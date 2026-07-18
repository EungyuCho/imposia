import { normalizeCss } from "./css-contracts.js";
import { prepareDecoration, prepareDocument } from "./document.js";
import { ImposiaError } from "./errors.js";
import { type ResolvedPageAssets, resolvePageAssets } from "./page-document-assets.js";
import {
  allowExtensionAsset,
  applyExtensionTransforms,
  createExtensionWarningCollector,
  decorateExtensionPage,
  type ExtensionWarningCollector,
  type PageExtensionSnapshots,
  snapshotExtensions,
  type ValidatedPageExtension,
  validateExtensions,
} from "./page-document-extensions.js";
import { abortError, FRAME_STYLE, frameStyle } from "./page-document-frame.js";
import {
  appendDecoration,
  bodyText,
  copyPreparedBody,
  ensureInputLimit,
  pageWarnings,
  resolveDecorationTokens,
  sanitizeAssetResolverInput,
  sanitizeCss,
  sanitizeFrameContent,
  sourceHtml,
} from "./page-document-sanitize.js";
import { createPageSemanticSnapshot, type PageSemanticSnapshot } from "./page-document-semantic.js";
import type {
  AssetResolver,
  EffectivePageLimits,
  ExperimentalPageFeatures,
  PageContext,
  PageDocumentOptions,
  PageGeometry,
  PageLimits,
  PageSource,
  PageWarning,
} from "./page-document-types.js";
import { DEFAULT_PAGE_LIMITS } from "./page-document-types.js";
import {
  type AuthoredPageRule,
  authoredPageName,
  cssPx,
  extractPageMediaCss,
  type HostPageOverrides,
  marginBoxText,
  normalizeHostPageOptions,
  PAGE_MARGIN_BOX_NAMES,
  type PageMarginBoxName,
  type PageMarginContentPart,
  resolvePageMedia,
} from "./page-media.js";
import { createWarningCollector, type DocumentWarning, type WarningCollector } from "./warnings.js";

export interface PageGenerationSettings {
  css: readonly string[];
  assetResolver?: AssetResolver;
  headerTemplate?: string;
  footerTemplate?: string;
  decorateBlankPages: boolean;
  experimental: Readonly<ExperimentalPageFeatures>;
  extensions: PageExtensionSnapshots;
  page: HostPageOverrides;
  limits: EffectivePageLimits;
  onProgress?: (progress: { completedPages: number }) => void;
}

export interface BuiltGeneration {
  body: DocumentFragment;
  css: readonly string[];
  pages: readonly BuiltPage[];
  warnings: readonly PageWarning[];
  timings: Readonly<{ resourceMs: number; paginationMs: number }>;
  blobUrls: readonly string[];
  semanticSnapshot: PageSemanticSnapshot;
  revoke(): void;
}

export interface BuiltPage {
  page: HTMLElement;
  flow: HTMLElement;
  blank: boolean;
  name: string | undefined;
  geometry: PageGeometry;
}

interface PageParts extends BuiltPage {
  content: HTMLElement;
  decorated: boolean;
  marginBoxes: ReadonlyMap<PageMarginBoxName, readonly PageMarginContentPart[]>;
}

interface PaginationPageMedia {
  readonly rules: readonly AuthoredPageRule[];
  readonly host: HostPageOverrides;
  readonly warnings: WarningCollector;
}

type PageBreak = "auto" | "page" | "left" | "right";

interface BreakConstraint {
  before: PageBreak;
  after: PageBreak;
  contributesToFlow: boolean;
}

const ATOMIC_ELEMENT_NAMES = new Set([
  "audio",
  "canvas",
  "embed",
  "iframe",
  "img",
  "input",
  "math",
  "object",
  "picture",
  "select",
  "svg",
  "table",
  "textarea",
  "video",
]);

const NON_FLOW_ELEMENT_NAMES = new Set(["style", "template"]);
const OVERFLOW_TOLERANCE_CSS_PX = 0.5;
const PAGE_BREAK_VALUES = new Set<PageBreak>(["auto", "page", "left", "right"]);

function limitError(name: keyof PageLimits, maximum: number): Error {
  return new Error(`${name} must be a finite positive number no greater than ${maximum}.`);
}

function normalizeLimit(name: keyof EffectivePageLimits, supplied: number | undefined): number {
  const maximum = DEFAULT_PAGE_LIMITS[name];
  if (supplied === undefined) return maximum;
  if (
    !Number.isFinite(supplied) ||
    !Number.isInteger(supplied) ||
    supplied <= 0 ||
    supplied > maximum
  ) {
    throw limitError(name, maximum);
  }
  return supplied;
}

export function normalizePageLimits(limits: PageLimits | undefined): EffectivePageLimits {
  return Object.freeze({
    maxInputBytes: normalizeLimit("maxInputBytes", limits?.maxInputBytes),
    maxNodes: normalizeLimit("maxNodes", limits?.maxNodes),
    maxAssetBytes: normalizeLimit("maxAssetBytes", limits?.maxAssetBytes),
    maxAssetDepth: normalizeLimit("maxAssetDepth", limits?.maxAssetDepth),
    maxAssetReferences: normalizeLimit("maxAssetReferences", limits?.maxAssetReferences),
    resourceDeadlineMs: normalizeLimit("resourceDeadlineMs", limits?.resourceDeadlineMs),
    maxPages: normalizeLimit("maxPages", limits?.maxPages),
    maxLayoutPasses: normalizeLimit("maxLayoutPasses", limits?.maxLayoutPasses),
    maxGeneratedFragments: normalizeLimit("maxGeneratedFragments", limits?.maxGeneratedFragments),
    maxGeneratedRecords: normalizeLimit("maxGeneratedRecords", limits?.maxGeneratedRecords),
  });
}

function snapshotExperimental(
  value: ExperimentalPageFeatures | undefined,
): Readonly<ExperimentalPageFeatures> {
  if (value === undefined) return Object.freeze({});
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Experimental page features must be an object.");
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.footnotes !== undefined && typeof record.footnotes !== "boolean") {
    throw new TypeError("experimental.footnotes must be a boolean.");
  }
  if (record.pageFloats !== undefined && typeof record.pageFloats !== "boolean") {
    throw new TypeError("experimental.pageFloats must be a boolean.");
  }
  return Object.freeze({
    ...(record.footnotes === undefined ? {} : { footnotes: record.footnotes }),
    ...(record.pageFloats === undefined ? {} : { pageFloats: record.pageFloats }),
  });
}

export function snapshotSettings(options: PageDocumentOptions): PageGenerationSettings {
  return {
    css: Object.freeze([...(options.css ?? [])]),
    ...(options.assetResolver === undefined ? {} : { assetResolver: options.assetResolver }),
    ...(options.headerTemplate === undefined ? {} : { headerTemplate: options.headerTemplate }),
    ...(options.footerTemplate === undefined ? {} : { footerTemplate: options.footerTemplate }),
    decorateBlankPages: options.decorateBlankPages ?? true,
    experimental: snapshotExperimental(options.experimental),
    extensions: snapshotExtensions(options.extensions),
    page: normalizeHostPageOptions(options.page),
    limits: normalizePageLimits(options.limits),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
  };
}

function contextForPage(pageNumber: number, name: string | undefined, blank: boolean): PageContext {
  return Object.freeze({
    side: pageNumber % 2 === 1 ? "right" : "left",
    name,
    blank,
  });
}

function applyPageGeometry(page: HTMLElement, geometry: PageGeometry): void {
  page.style.setProperty("width", cssPx(geometry.sheetWidthCssPx), "important");
  page.style.setProperty("height", cssPx(geometry.sheetHeightCssPx), "important");
  page.style.setProperty("padding-top", cssPx(geometry.margins.topCssPx), "important");
  page.style.setProperty("padding-right", cssPx(geometry.margins.rightCssPx), "important");
  page.style.setProperty("padding-bottom", cssPx(geometry.margins.bottomCssPx), "important");
  page.style.setProperty("padding-left", cssPx(geometry.margins.leftCssPx), "important");
  page.style.setProperty("--imposia-margin-top", cssPx(geometry.margins.topCssPx));
  page.style.setProperty("--imposia-margin-right", cssPx(geometry.margins.rightCssPx));
  page.style.setProperty("--imposia-margin-bottom", cssPx(geometry.margins.bottomCssPx));
  page.style.setProperty("--imposia-margin-left", cssPx(geometry.margins.leftCssPx));
  page.style.setProperty("--imposia-content-width", cssPx(geometry.contentWidthCssPx));
  page.style.setProperty("--imposia-content-height", cssPx(geometry.contentHeightCssPx));
}

function createPage(
  frameDocument: Document,
  pageMedia: PaginationPageMedia,
  pageNumber: number,
  name: string | undefined,
): PageParts {
  const context = contextForPage(pageNumber, name, false);
  const resolved = resolvePageMedia(
    pageMedia.rules,
    pageMedia.host,
    context,
    pageNumber,
    pageMedia.warnings,
  );
  const page = frameDocument.createElement("section");
  page.setAttribute("data-imposia-page", "");
  page.setAttribute("data-imposia-page-number", String(pageNumber));
  page.setAttribute("data-imposia-page-side", context.side);
  page.setAttribute("data-imposia-page-name", name ?? "");
  page.setAttribute("data-imposia-blank", "false");
  applyPageGeometry(page, resolved.geometry);

  const header = frameDocument.createElement("header");
  header.setAttribute("data-imposia-page-header", "");
  header.style.gridRow = "1";
  const content = frameDocument.createElement("main");
  content.setAttribute("data-imposia-page-content", "");
  content.style.gridRow = "2";
  const flow = frameDocument.createElement("div");
  flow.setAttribute("data-imposia-page-flow", "");
  const footer = frameDocument.createElement("footer");
  footer.setAttribute("data-imposia-page-footer", "");
  footer.style.gridRow = "3";

  const marginBoxes = PAGE_MARGIN_BOX_NAMES.map((boxName) => {
    const box = frameDocument.createElement("div");
    box.setAttribute("data-imposia-margin-box", boxName);
    return box;
  });

  content.append(flow);
  page.append(content, header, footer, ...marginBoxes);
  return {
    page,
    flow,
    content,
    blank: false,
    name,
    geometry: resolved.geometry,
    marginBoxes: resolved.marginBoxes,
    decorated: false,
  };
}

function updatePageMedia(
  page: PageParts,
  pageMedia: PaginationPageMedia,
  name: string | undefined,
  blank: boolean,
): void {
  const pageNumber = Number(page.page.getAttribute("data-imposia-page-number"));
  const context = contextForPage(pageNumber, name, blank);
  const resolved = resolvePageMedia(
    pageMedia.rules,
    pageMedia.host,
    context,
    pageNumber,
    pageMedia.warnings,
  );
  page.name = name;
  page.blank = blank;
  page.geometry = resolved.geometry;
  page.marginBoxes = resolved.marginBoxes;
  page.page.setAttribute("data-imposia-page-side", context.side);
  page.page.setAttribute("data-imposia-page-name", name ?? "");
  page.page.setAttribute("data-imposia-blank", String(blank));
  applyPageGeometry(page.page, resolved.geometry);
}

function setPageBlank(
  page: PageParts,
  blank: boolean,
  decorateBlankPages: boolean,
  pageMedia: PaginationPageMedia,
): void {
  updatePageMedia(page, pageMedia, page.name, blank);
  if (blank && !decorateBlankPages && page.decorated) {
    page.page.querySelector("[data-imposia-page-header]")?.replaceChildren();
    page.page.querySelector("[data-imposia-page-footer]")?.replaceChildren();
  }
}

function decoratePage(
  frameDocument: Document,
  page: PageParts,
  settings: PageGenerationSettings,
  extensions: readonly ValidatedPageExtension[],
  signal: AbortSignal,
  warnings: ExtensionWarningCollector,
  decorationWarnings: DocumentWarning[],
): boolean {
  if (page.decorated) return false;
  page.decorated = true;
  if (page.blank && !settings.decorateBlankPages) return false;
  const header = page.page.querySelector<HTMLElement>("[data-imposia-page-header]");
  const footer = page.page.querySelector<HTMLElement>("[data-imposia-page-footer]");
  if (header === null || footer === null) throw new Error("Page decorations are unavailable.");
  let resourceBlocked = appendDecoration(frameDocument, header, settings.headerTemplate);
  resourceBlocked =
    appendDecoration(frameDocument, footer, settings.footerTemplate) || resourceBlocked;
  const decorations = decorateExtensionPage(
    extensions,
    {
      number: Number(page.page.getAttribute("data-imposia-page-number")),
      side: pageSide(page),
      blank: page.blank,
    },
    signal,
    warnings,
  );
  for (const decoration of decorations) {
    if (decoration.headerHtml !== undefined) {
      const prepared = prepareDecoration(decoration.headerHtml);
      decorationWarnings.push(...prepared.warnings);
      resourceBlocked =
        appendDecoration(frameDocument, header, prepared.html, true) || resourceBlocked;
    }
    if (decoration.footerHtml !== undefined) {
      const prepared = prepareDecoration(decoration.footerHtml);
      decorationWarnings.push(...prepared.warnings);
      resourceBlocked =
        appendDecoration(frameDocument, footer, prepared.html, true) || resourceBlocked;
    }
  }
  return resourceBlocked;
}

function resolveMarginBoxes(page: PageParts, pageNumber: number, totalPages: number): void {
  for (const boxName of PAGE_MARGIN_BOX_NAMES) {
    const box = page.page.querySelector<HTMLElement>(`[data-imposia-margin-box="${boxName}"]`);
    if (box === null) throw new Error(`Page margin box ${boxName} is unavailable.`);
    box.textContent = marginBoxText(page.marginBoxes.get(boxName), pageNumber, totalPages);
  }
}

function isNonFlowNode(node: Node): boolean {
  if (node.nodeType === Node.COMMENT_NODE) return true;
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim() === "";
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    NON_FLOW_ELEMENT_NAMES.has((node as Element).localName.toLowerCase())
  );
}

function flowHasContent(flow: HTMLElement): boolean {
  return [...flow.childNodes].some((node) => !isNonFlowNode(node));
}

function pageBreak(value: string): PageBreak {
  const normalized = value.trim().toLowerCase();
  if (normalized === "always") return "page";
  return PAGE_BREAK_VALUES.has(normalized as PageBreak) ? (normalized as PageBreak) : "auto";
}

function isInlineDisplay(display: string): boolean {
  return display === "inline" || display.startsWith("inline-") || display.startsWith("inline ");
}

function isReplacedElement(element: Element): boolean {
  return ATOMIC_ELEMENT_NAMES.has(element.localName.toLowerCase());
}

function captureBreakConstraints(root: HTMLElement): ReadonlyMap<Element, BreakConstraint> {
  const constraints = new Map<Element, BreakConstraint>();
  const view = root.ownerDocument.defaultView;
  if (view === null) return constraints;

  for (const element of root.querySelectorAll<Element>("*")) {
    const localName = element.localName.toLowerCase();
    if (NON_FLOW_ELEMENT_NAMES.has(localName)) {
      constraints.set(element, { before: "auto", after: "auto", contributesToFlow: false });
      continue;
    }
    const style = view.getComputedStyle(element);
    const contributesToFlow =
      style.display !== "none" && style.position !== "absolute" && style.position !== "fixed";
    const supportsBreak =
      contributesToFlow &&
      style.display !== "contents" &&
      (!isInlineDisplay(style.display) || isReplacedElement(element));
    constraints.set(element, {
      before: supportsBreak ? pageBreak(style.breakBefore) : "auto",
      after: supportsBreak ? pageBreak(style.breakAfter) : "auto",
      contributesToFlow,
    });
  }
  return constraints;
}

function nodeContributesToFlow(
  node: Node,
  constraints: ReadonlyMap<Element, BreakConstraint>,
): boolean {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim() !== "";
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  return constraints.get(node as Element)?.contributesToFlow ?? !isNonFlowNode(node);
}

function breakConstraintFor(
  node: Node,
  constraints: ReadonlyMap<Element, BreakConstraint>,
): Pick<BreakConstraint, "before" | "after"> {
  if (node.nodeType !== Node.ELEMENT_NODE) return { before: "auto", after: "auto" };
  return constraints.get(node as Element) ?? { before: "auto", after: "auto" };
}

function pageSide(page: PageParts): "left" | "right" {
  return page.page.getAttribute("data-imposia-page-side") === "left" ? "left" : "right";
}

function startPageForBreak(
  currentPage: PageParts,
  breakValue: PageBreak,
  nextPage: () => PageParts,
  decorateBlankPages: boolean,
  pageMedia: PaginationPageMedia,
  decorateBlankPage: (page: PageParts) => void,
): PageParts {
  if (breakValue === "auto") return currentPage;
  let page = currentPage;
  if (flowHasContent(page.flow)) page = nextPage();
  if ((breakValue === "left" || breakValue === "right") && pageSide(page) !== breakValue) {
    setPageBlank(page, true, decorateBlankPages, pageMedia);
    decorateBlankPage(page);
    page = nextPage();
  }
  return page;
}

function pageOverflows(page: PageParts): boolean {
  const contentBounds = page.content.getBoundingClientRect();
  const flowBounds = page.flow.getBoundingClientRect();
  const availableHeight = Math.max(page.content.clientHeight, contentBounds.height);
  return (
    Math.max(page.flow.scrollHeight, flowBounds.height) >
    availableHeight + OVERFLOW_TOLERANCE_CSS_PX
  );
}

function isAtomicElement(element: Element): boolean {
  const name = element.localName.toLowerCase();
  if (ATOMIC_ELEMENT_NAMES.has(name)) return true;
  const view = element.ownerDocument.defaultView;
  if (view === null) return false;
  const style = view.getComputedStyle(element);
  return (
    style.display.includes("flex") ||
    style.display.includes("grid") ||
    style.columnCount !== "auto" ||
    style.columnWidth !== "auto" ||
    style.transform !== "none" ||
    style.position === "absolute" ||
    style.position === "fixed" ||
    style.position === "sticky"
  );
}

function graphemeEnds(value: string): readonly number[] {
  const ends: number[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const segment of segmenter.segment(value)) ends.push(segment.index + segment.segment.length);
  return ends;
}

function splitTextToFit(text: Text, page: PageParts): Text | undefined {
  const value = text.data;
  const ends = graphemeEnds(value);
  if (ends.length === 0) return undefined;

  let low = 1;
  let high = ends.length;
  let fitting = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const end = ends[middle - 1];
    if (end === undefined) break;
    text.data = value.slice(0, end);
    if (pageOverflows(page)) high = middle - 1;
    else {
      fitting = middle;
      low = middle + 1;
    }
  }

  if (fitting === 0) {
    text.data = value;
    return undefined;
  }
  if (fitting === ends.length) {
    text.data = value;
    return undefined;
  }
  const end = ends[fitting - 1];
  if (end === undefined) {
    text.data = value;
    return undefined;
  }
  text.data = value.slice(0, end);
  return text.ownerDocument.createTextNode(value.slice(end));
}

function appendProbeStyles(frameDocument: Document, css: readonly string[]): HTMLStyleElement[] {
  return css.map((value) => {
    const style = frameDocument.createElement("style");
    style.setAttribute("data-imposia-pagination-probe", "");
    style.textContent = value;
    frameDocument.head.append(style);
    return style;
  });
}

function createProbe(frameDocument: Document): HTMLElement {
  const probe = frameDocument.createElement("div");
  probe.setAttribute("data-imposia-pagination-probe", "");
  probe.style.cssText =
    "position:absolute;top:0;left:-100000px;visibility:hidden;pointer-events:none;contain:layout style";
  frameDocument.body.append(probe);
  return probe;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function ensureTransformedInputLimit(
  html: string,
  css: readonly string[],
  limits: PageLimits,
): void {
  ensureInputLimit(`${html}\u0000${css.join("\u0000")}`, limits);
}

function compilePageMediaCss(
  sourceFlow: HTMLElement,
  css: readonly string[],
  warnings: WarningCollector,
): Readonly<{ css: readonly string[]; rules: readonly AuthoredPageRule[] }> {
  const rules: AuthoredPageRule[] = [];
  const outputCss: string[] = [];
  let order = 0;
  for (const value of css) {
    const normalized = normalizeCss(value, warnings, order);
    const extracted = extractPageMediaCss(normalized, order);
    outputCss.push(extracted.css);
    rules.push(...extracted.rules);
    order = Math.max(extracted.nextOrder, order + value.length + 1);
  }
  for (const style of sourceFlow.querySelectorAll<HTMLStyleElement>("style")) {
    const value = style.textContent ?? "";
    const normalized = normalizeCss(value, warnings, order);
    const extracted = extractPageMediaCss(normalized, order);
    style.textContent = extracted.css;
    rules.push(...extracted.rules);
    order = Math.max(extracted.nextOrder, order + value.length + 1);
  }
  return Object.freeze({ css: Object.freeze(outputCss), rules: Object.freeze(rules) });
}

function mappedDocumentWarnings(warnings: readonly DocumentWarning[]): readonly PageWarning[] {
  const mapped = [...pageWarnings(warnings)];
  for (const warning of warnings) {
    if (warning.code !== "PAGE_RULE_UNSUPPORTED") continue;
    mapped.push(
      Object.freeze({
        code: "PAGE_RULE_UNSUPPORTED" as const,
        message: warning.message,
        sourceIdentity: undefined,
        ...(warning.property === undefined ? {} : { property: warning.property }),
        ...(warning.value === undefined ? {} : { value: warning.value }),
        ...(warning.recovery === undefined ? {} : { recovery: warning.recovery }),
      }),
    );
  }
  return Object.freeze(mapped);
}

function fragmentText(
  text: Text,
  page: PageParts,
  nextPage: () => PageParts,
  reportOverflow: () => void,
): PageParts {
  let currentPage = page;
  let currentText = text;
  while (pageOverflows(currentPage)) {
    const remainder = splitTextToFit(currentText, currentPage);
    if (remainder === undefined) {
      reportOverflow();
      return currentPage;
    }
    currentPage = nextPage();
    currentPage.flow.append(remainder);
    currentText = remainder;
  }
  return currentPage;
}

function fragmentElement(
  element: Element,
  page: PageParts,
  nextPage: () => PageParts,
  reportOverflow: () => void,
): PageParts {
  const children = [...element.childNodes];
  if (children.length === 0 || isAtomicElement(element)) {
    reportOverflow();
    return page;
  }

  element.replaceChildren();
  if (pageOverflows(page)) {
    element.append(...children);
    reportOverflow();
    return page;
  }

  let currentPage = page;
  let shell = element;
  for (const child of children) {
    const shellHadContent = flowHasContent(shell as HTMLElement);
    shell.append(child);
    if (!pageOverflows(currentPage)) continue;

    if (shellHadContent) {
      child.remove();
      currentPage = nextPage();
      shell = element.cloneNode(false) as Element;
      currentPage.flow.append(shell);
      shell.append(child);
      if (!pageOverflows(currentPage)) continue;
    }

    if (child.nodeType === Node.TEXT_NODE) {
      let remainder = splitTextToFit(child as Text, currentPage);
      while (remainder !== undefined) {
        currentPage = nextPage();
        shell = element.cloneNode(false) as Element;
        currentPage.flow.append(shell);
        shell.append(remainder);
        if (!pageOverflows(currentPage)) break;
        remainder = splitTextToFit(remainder, currentPage);
      }
      if (remainder !== undefined) continue;
      if (!pageOverflows(currentPage)) continue;
    }

    reportOverflow();
  }
  return currentPage;
}

export async function buildGeneration(
  frameDocument: Document,
  source: PageSource,
  settings: PageGenerationSettings,
  signal: AbortSignal,
): Promise<BuiltGeneration> {
  const paginationStartedAt = performance.now();
  const html = sourceHtml(source);
  ensureInputLimit(html, settings.limits);
  const extensions = validateExtensions(settings.extensions);
  const extensionWarnings = createExtensionWarningCollector(signal);
  const transformed = await applyExtensionTransforms(
    extensions,
    Object.freeze({ html, css: settings.css, baseUrl: source.baseUrl }),
    signal,
    extensionWarnings,
    (nextHtml, nextCss) => ensureTransformedInputLimit(nextHtml, nextCss, settings.limits),
  );
  const prepared = prepareDocument(transformed.html, {
    ...(settings.headerTemplate === undefined ? {} : { headerTemplate: settings.headerTemplate }),
    ...(settings.footerTemplate === undefined ? {} : { footerTemplate: settings.footerTemplate }),
    ...(settings.assetResolver === undefined ? {} : { allowRemoteResources: true }),
  });
  const pageSettings: PageGenerationSettings = {
    ...settings,
    ...(prepared.headerTemplate === undefined ? {} : { headerTemplate: prepared.headerTemplate }),
    ...(prepared.footerTemplate === undefined ? {} : { footerTemplate: prepared.footerTemplate }),
  };
  let assets: ResolvedPageAssets | undefined;
  const resourceStartedAt = performance.now();
  if (settings.assetResolver !== undefined) {
    assets = await resolvePageAssets(
      sanitizeAssetResolverInput(prepared.html),
      source.baseUrl,
      transformed.css,
      settings.assetResolver,
      settings.limits,
      signal,
      extensions.length === 0
        ? undefined
        : (request) => allowExtensionAsset(extensions, request, signal, extensionWarnings),
    );
  }
  const resourceFinishedAt = performance.now();
  try {
    throwIfAborted(signal);
    const preparedSource = copyPreparedBody(
      frameDocument,
      assets?.html ?? prepared.html,
      assets !== undefined,
      assets === undefined ? undefined : new Set(assets.blobUrls),
    );
    const sourceFlow = frameDocument.createElement("div");
    sourceFlow.append(preparedSource.fragment);
    const nodeCount = sourceFlow.querySelectorAll("*").length;
    if (nodeCount > settings.limits.maxNodes) {
      throw new ImposiaError("NODE_LIMIT", "Page node limit exceeded.");
    }
    let resourceBlocked =
      preparedSource.resourceBlocked ||
      sanitizeFrameContent(
        sourceFlow,
        assets !== undefined,
        assets === undefined ? undefined : new Set(assets.blobUrls),
      );
    resourceBlocked ||= assets?.resourceBlocked ?? false;

    const sanitizedCss = (assets?.css ?? transformed.css).map((css) =>
      sanitizeCss(
        css,
        assets !== undefined,
        assets === undefined ? undefined : new Set(assets.blobUrls),
      ),
    );
    resourceBlocked ||= sanitizedCss.some((item) => item.resourceBlocked);
    const pageMediaWarnings = createWarningCollector();
    const compiledPageMedia = compilePageMediaCss(
      sourceFlow,
      sanitizedCss.map((item) => item.css),
      pageMediaWarnings,
    );
    const pageMedia: PaginationPageMedia = Object.freeze({
      rules: compiledPageMedia.rules,
      host: settings.page,
      warnings: pageMediaWarnings,
    });
    const semanticSnapshot = createPageSemanticSnapshot({
      html: sourceFlow.innerHTML,
      css: compiledPageMedia.css,
      baseUrl: source.baseUrl,
      assets: assets?.semanticAssets ?? Object.freeze([]),
    });
    const probeCss = Object.freeze([FRAME_STYLE, ...compiledPageMedia.css]);
    const body = frameDocument.createDocumentFragment();
    const pages: PageParts[] = [];
    const decorationWarnings: DocumentWarning[] = [];
    let overflowWarning: PageWarning | undefined;
    const reportOverflow = () => {
      overflowWarning ??= Object.freeze({
        code: "PAGE_OVERFLOW",
        message: "Content exceeds the usable page area.",
        sourceIdentity: undefined,
      });
    };
    const probeStyles = appendProbeStyles(frameDocument, probeCss);
    const probe = createProbe(frameDocument);
    try {
      probe.append(sourceFlow);
      const breakConstraints = captureBreakConstraints(sourceFlow);
      const decorateCurrentPage = (page: PageParts) => {
        resourceBlocked =
          decoratePage(
            frameDocument,
            page,
            pageSettings,
            extensions,
            signal,
            extensionWarnings,
            decorationWarnings,
          ) || resourceBlocked;
      };
      const allocatePage = (name: string | undefined): PageParts => {
        throwIfAborted(signal);
        if (pages.length >= settings.limits.maxPages) {
          throw new ImposiaError("PAGE_LIMIT", "Page limit exceeded.");
        }
        const created = createPage(frameDocument, pageMedia, pages.length + 1, name);
        pages.push(created);
        probe.append(created.page);
        return created;
      };
      const nextContentPage = (name: string | undefined): PageParts => {
        const page = allocatePage(name);
        decorateCurrentPage(page);
        return page;
      };

      let currentPage = allocatePage(undefined);
      let pendingBreakAfter: PageBreak = "auto";
      for (const node of [...sourceFlow.childNodes]) {
        throwIfAborted(signal);
        const contributesToFlow = nodeContributesToFlow(node, breakConstraints);
        const constraint = breakConstraintFor(node, breakConstraints);
        if (contributesToFlow) {
          const requestedName =
            node.nodeType === Node.ELEMENT_NODE ? authoredPageName(node as Element) : undefined;
          let requestedBreak = constraint.before === "auto" ? pendingBreakAfter : constraint.before;
          if (
            requestedBreak === "auto" &&
            flowHasContent(currentPage.flow) &&
            currentPage.name !== requestedName
          ) {
            requestedBreak = "page";
          }
          currentPage = startPageForBreak(
            currentPage,
            requestedBreak,
            () => allocatePage(requestedName),
            settings.decorateBlankPages,
            pageMedia,
            decorateCurrentPage,
          );
          updatePageMedia(currentPage, pageMedia, requestedName, false);
          decorateCurrentPage(currentPage);
        }
        const currentHadContent = flowHasContent(currentPage.flow);
        currentPage.flow.append(node);
        if (pageOverflows(currentPage)) {
          if (currentHadContent) {
            node.remove();
            currentPage = nextContentPage(currentPage.name);
            currentPage.flow.append(node);
          }

          if (pageOverflows(currentPage)) {
            if (node.nodeType === Node.TEXT_NODE) {
              const continuationName = currentPage.name;
              currentPage = fragmentText(
                node as Text,
                currentPage,
                () => nextContentPage(continuationName),
                reportOverflow,
              );
            } else if (node.nodeType === Node.ELEMENT_NODE && !isAtomicElement(node as Element)) {
              const continuationName = currentPage.name;
              currentPage = fragmentElement(
                node as Element,
                currentPage,
                () => nextContentPage(continuationName),
                reportOverflow,
              );
            } else {
              reportOverflow();
            }
          }
        }

        if (contributesToFlow) pendingBreakAfter = constraint.after;
      }

      for (const page of pages) decorateCurrentPage(page);
      for (const [index, page] of pages.entries()) {
        resolveDecorationTokens(page.page, index + 1, pages.length);
        resolveMarginBoxes(page, index + 1, pages.length);
      }
      body.append(...pages.map((page) => page.page));
    } finally {
      probe.remove();
      for (const style of probeStyles) style.remove();
    }

    const css = Object.freeze([
      frameStyle(pages.map((page) => page.geometry)),
      ...compiledPageMedia.css,
    ]);

    const warnings = [
      ...mappedDocumentWarnings([
        ...prepared.warnings,
        ...decorationWarnings,
        ...pageMediaWarnings.finish(),
      ]),
    ];
    if (overflowWarning !== undefined) warnings.push(overflowWarning);
    if (resourceBlocked && !warnings.some((warning) => warning.code === "RESOURCE_BLOCKED")) {
      warnings.push(
        Object.freeze({
          code: "RESOURCE_BLOCKED",
          message: "Resource was blocked by the loading policy.",
          sourceIdentity: assets?.sourceIdentity,
        }),
      );
    }
    warnings.push(...extensionWarnings.finish());

    return {
      body,
      css,
      pages: Object.freeze(
        pages.map(({ page, flow, blank, name, geometry }) => ({
          page,
          flow,
          blank,
          name,
          geometry,
        })),
      ),
      warnings: Object.freeze(warnings),
      timings: Object.freeze({
        resourceMs: resourceFinishedAt - resourceStartedAt,
        paginationMs:
          resourceStartedAt - paginationStartedAt + (performance.now() - resourceFinishedAt),
      }),
      blobUrls: assets?.blobUrls ?? Object.freeze([]),
      semanticSnapshot,
      revoke: assets?.revoke ?? (() => undefined),
    };
  } catch (error: unknown) {
    assets?.revoke();
    throw error;
  }
}

export { bodyText };
