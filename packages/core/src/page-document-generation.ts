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
  readonly sourceIdentity: string;
  before: PageBreak;
  after: PageBreak;
  readonly insideAvoid: boolean;
  readonly widows: number;
  readonly orphans: number;
  contributesToFlow: boolean;
  readonly layout: FragmentationLayout;
  readonly atomic: boolean;
  hasForcedDescendant: boolean;
}

type FragmentationLayout =
  | "normal"
  | "table"
  | "safe-flex"
  | "safe-grid"
  | "safe-multicol"
  | "unsupported-flex"
  | "unsupported-grid"
  | "unsupported-multicol";

interface FragmentCursor {
  readonly page: PageParts;
  readonly container: Element;
  readonly overflowRoot?: HTMLElement;
}

type ContinueFragment = (name: string | undefined) => FragmentCursor;

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

function topLevelTrackCount(value: string): number {
  if (value === "none" || value.trim() === "") return 0;
  let depth = 0;
  let count = 1;
  for (const character of value.trim()) {
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (/\s/u.test(character) && depth === 0) count += 1;
  }
  return count;
}

function isStaticOrderedChild(element: Element, view: Window): boolean {
  const style = view.getComputedStyle(element);
  return style.position === "static" && Number(style.order) === 0;
}

function gridPlacementSpans(start: string, end: string): boolean {
  if (start.includes("span") || end.includes("span")) return true;
  const startLine = Number(start);
  const endLine = Number(end);
  return (
    start === "-1" ||
    end === "-1" ||
    (Number.isFinite(startLine) && Number.isFinite(endLine) && Math.abs(endLine - startLine) > 1)
  );
}

function isSafeGridChild(element: Element, view: Window): boolean {
  if (!isStaticOrderedChild(element, view)) return false;
  const style = view.getComputedStyle(element);
  return (
    !gridPlacementSpans(style.gridColumnStart, style.gridColumnEnd) &&
    !gridPlacementSpans(style.gridRowStart, style.gridRowEnd)
  );
}

function absoluteCssPixels(value: string): number | undefined {
  const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+))px$/u.exec(value.trim().toLowerCase());
  if (match?.[1] === undefined) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function establishesMulticol(style: CSSStyleDeclaration): boolean {
  return style.columnCount !== "auto" || style.columnWidth !== "auto";
}

function safeMulticol(element: Element, style: CSSStyleDeclaration, view: Window): boolean {
  const columnCount = Number(style.columnCount);
  const columnWidth = absoluteCssPixels(style.columnWidth);
  const columnGap = absoluteCssPixels(style.columnGap);
  if (
    style.columnFill !== "auto" ||
    (!(Number.isInteger(columnCount) && columnCount > 0) &&
      !(columnWidth !== undefined && columnWidth > 0)) ||
    columnGap === undefined
  ) {
    return false;
  }

  for (const descendant of element.querySelectorAll<Element>("*")) {
    const descendantStyle = view.getComputedStyle(descendant);
    if (
      descendantStyle.position !== "static" ||
      descendantStyle.cssFloat !== "none" ||
      descendantStyle.columnSpan !== "none" ||
      establishesMulticol(descendantStyle) ||
      descendantStyle.display.includes("flex") ||
      descendantStyle.display.includes("grid") ||
      descendantStyle.display.includes("table")
    ) {
      return false;
    }
  }
  return true;
}

function fragmentationLayout(
  element: Element,
  style: CSSStyleDeclaration,
  view: Window,
): FragmentationLayout {
  if (element.localName.toLowerCase() === "table") return "table";
  if (style.display.includes("flex")) {
    const safe =
      style.flexDirection === "column" &&
      style.flexWrap === "nowrap" &&
      [...element.children].every((child) => isStaticOrderedChild(child, view));
    return safe ? "safe-flex" : "unsupported-flex";
  }
  if (style.display.includes("grid")) {
    const safe =
      topLevelTrackCount(style.gridTemplateColumns) === 1 &&
      [...element.children].every((child) => isSafeGridChild(child, view));
    return safe ? "safe-grid" : "unsupported-grid";
  }
  if (establishesMulticol(style)) {
    return safeMulticol(element, style, view) ? "safe-multicol" : "unsupported-multicol";
  }
  return "normal";
}

function atomicElement(
  element: Element,
  style: CSSStyleDeclaration,
  layout: FragmentationLayout,
): boolean {
  if (layout.startsWith("unsupported-")) return true;
  if (layout !== "normal") return false;
  return (
    isReplacedElement(element) ||
    style.transform !== "none" ||
    style.position === "absolute" ||
    style.position === "fixed" ||
    style.position === "sticky"
  );
}

function positiveComputedInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function captureBreakConstraints(
  root: HTMLElement,
  check: () => void,
): ReadonlyMap<Element, BreakConstraint> {
  const constraints = new Map<Element, BreakConstraint>();
  const view = root.ownerDocument.defaultView;
  if (view === null) return constraints;

  const elements = [...root.querySelectorAll<Element>("*")];
  for (const [index, element] of elements.entries()) {
    check();
    const localName = element.localName.toLowerCase();
    if (NON_FLOW_ELEMENT_NAMES.has(localName)) {
      constraints.set(element, {
        sourceIdentity: `source-${index + 1}:${localName}`,
        before: "auto",
        after: "auto",
        insideAvoid: false,
        widows: 2,
        orphans: 2,
        contributesToFlow: false,
        layout: "normal",
        atomic: true,
        hasForcedDescendant: false,
      });
      continue;
    }
    const style = view.getComputedStyle(element);
    const layout = fragmentationLayout(element, style, view);
    const contributesToFlow =
      style.display !== "none" && style.position !== "absolute" && style.position !== "fixed";
    const supportsBreak =
      contributesToFlow &&
      style.display !== "contents" &&
      (!isInlineDisplay(style.display) || isReplacedElement(element));
    constraints.set(element, {
      sourceIdentity: `source-${index + 1}:${localName}`,
      before: supportsBreak ? pageBreak(style.breakBefore) : "auto",
      after: supportsBreak ? pageBreak(style.breakAfter) : "auto",
      insideAvoid: style.breakInside.trim().toLowerCase() === "avoid",
      widows: positiveComputedInteger(style.widows, 2),
      orphans: positiveComputedInteger(style.orphans, 2),
      contributesToFlow,
      layout,
      atomic: atomicElement(element, style, layout),
      hasForcedDescendant: false,
    });
  }

  for (const element of [...elements].reverse()) {
    check();
    const constraint = constraints.get(element);
    if (constraint === undefined) continue;
    const parent = element.parentElement;
    const parentConstraint = parent === null ? undefined : constraints.get(parent);
    if (parentConstraint !== undefined) {
      parentConstraint.hasForcedDescendant ||=
        constraint.before !== "auto" ||
        constraint.after !== "auto" ||
        constraint.hasForcedDescendant;
    }
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

function pageOverflows(page: PageParts): boolean {
  const contentBounds = page.content.getBoundingClientRect();
  const flowBounds = page.flow.getBoundingClientRect();
  const availableHeight = Math.max(page.content.clientHeight, contentBounds.height);
  return (
    Math.max(page.flow.scrollHeight, flowBounds.height) >
    availableHeight + OVERFLOW_TOLERANCE_CSS_PX
  );
}

function graphemeEnds(value: string): readonly number[] {
  const ends: number[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const segment of segmenter.segment(value)) ends.push(segment.index + segment.segment.length);
  return ends;
}

function splitTextToFit(text: Text, overflows: () => boolean, check: () => void): Text | undefined {
  const value = text.data;
  const ends = graphemeEnds(value);
  if (ends.length === 0) return undefined;

  let low = 1;
  let high = ends.length;
  let fitting = 0;
  while (low <= high) {
    check();
    const middle = Math.floor((low + high) / 2);
    const end = ends[middle - 1];
    if (end === undefined) break;
    text.data = value.slice(0, end);
    if (overflows()) high = middle - 1;
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
  const fittingEnd = ends[fitting - 1];
  if (fittingEnd === undefined) {
    text.data = value;
    return undefined;
  }
  const fittingPrefix = value.slice(0, fittingEnd);
  const whitespaceRuns = [...fittingPrefix.matchAll(/\s+/gu)];
  const lastWhitespace = whitespaceRuns.at(-1);
  const whitespaceEnd =
    lastWhitespace?.index === undefined
      ? undefined
      : lastWhitespace.index + lastWhitespace[0].length;
  const end = whitespaceEnd !== undefined && whitespaceEnd > 0 ? whitespaceEnd : fittingEnd;
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

function combinedBreak(previousAfter: PageBreak, currentBefore: PageBreak): PageBreak {
  return currentBefore === "auto" ? previousAfter : currentBefore;
}

function stripContinuationIds(element: Element): void {
  element.removeAttribute("id");
  for (const descendant of element.querySelectorAll<Element>("[id]")) {
    descendant.removeAttribute("id");
  }
}

function directLineGroups(element: Element): readonly (readonly Node[])[] | undefined {
  if (![...element.children].some((child) => child.localName.toLowerCase() === "br")) {
    return undefined;
  }
  const groups: Node[][] = [];
  let group: Node[] = [];
  for (const child of [...element.childNodes]) {
    group.push(child);
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).localName === "br") {
      groups.push(group);
      group = [];
    }
  }
  if (group.length > 0) groups.push(group);
  return groups.length > 1 ? groups : undefined;
}

function htmlElement(element: Element): HTMLElement | undefined {
  return element.namespaceURI === "http://www.w3.org/1999/xhtml"
    ? (element as HTMLElement)
    : undefined;
}

function renderedLineEnds(text: Text, check: () => void): readonly number[] {
  const ends: number[] = [];
  let previousEnd = 0;
  let previousTop: number | undefined;
  const range = text.ownerDocument.createRange();
  for (const end of graphemeEnds(text.data)) {
    check();
    range.setStart(text, previousEnd);
    range.setEnd(text, end);
    const rects = range.getClientRects();
    const rect = rects.item(rects.length - 1);
    if (
      rect !== null &&
      previousTop !== undefined &&
      Math.abs(rect.top - previousTop) > OVERFLOW_TOLERANCE_CSS_PX
    ) {
      ends.push(previousEnd);
    }
    if (rect !== null) previousTop = rect.top;
    previousEnd = end;
  }
  range.detach();
  if (previousEnd > 0 && ends.at(-1) !== previousEnd) ends.push(previousEnd);
  return ends;
}

interface RecursiveFragmenterOptions {
  readonly constraints: ReadonlyMap<Element, BreakConstraint>;
  readonly signal: AbortSignal;
  readonly deadlineAt: number;
  readonly limits: EffectivePageLimits;
  readonly decorateBlankPages: boolean;
  readonly pageMedia: PaginationPageMedia;
  readonly decoratePage: (page: PageParts) => void;
  readonly reportOverflow: () => void;
  readonly warnings: PageWarning[];
}

class RecursiveFragmenter {
  readonly #constraints: ReadonlyMap<Element, BreakConstraint>;
  readonly #signal: AbortSignal;
  readonly #deadlineAt: number;
  readonly #limits: EffectivePageLimits;
  readonly #decorateBlankPages: boolean;
  readonly #pageMedia: PaginationPageMedia;
  readonly #decoratePage: (page: PageParts) => void;
  readonly #reportOverflow: () => void;
  readonly #warnings: PageWarning[];
  readonly #warned = new Set<string>();
  readonly #pageContent = new Map<PageParts, number>();
  #generatedFragments = 0;
  #generatedRecords = 0;

  constructor(options: RecursiveFragmenterOptions) {
    this.#constraints = options.constraints;
    this.#signal = options.signal;
    this.#deadlineAt = options.deadlineAt;
    this.#limits = options.limits;
    this.#decorateBlankPages = options.decorateBlankPages;
    this.#pageMedia = options.pageMedia;
    this.#decoratePage = options.decoratePage;
    this.#reportOverflow = options.reportOverflow;
    this.#warnings = options.warnings;
  }

  check(): void {
    throwIfAborted(this.#signal);
    if (performance.now() > this.#deadlineAt) {
      throw new ImposiaError("RESOURCE_TIMEOUT", "Page generation timed out.");
    }
  }

  #beginRecord(): void {
    this.check();
    this.#generatedRecords += 1;
    if (this.#generatedRecords > this.#limits.maxGeneratedRecords) {
      throw new ImposiaError(
        "GENERATED_RECORD_LIMIT",
        "Generated fragmentation record limit exceeded.",
      );
    }
  }

  #generatedFragment(): void {
    this.check();
    this.#generatedFragments += 1;
    if (this.#generatedFragments > this.#limits.maxGeneratedFragments) {
      throw new ImposiaError("GENERATED_FRAGMENT_LIMIT", "Generated fragment limit exceeded.");
    }
  }

  #cloneFragment<ElementType extends Element>(element: ElementType, deep: boolean): ElementType {
    this.#generatedFragment();
    const clone = element.cloneNode(deep) as ElementType;
    stripContinuationIds(clone);
    return clone;
  }

  #hasPageContent(page: PageParts): boolean {
    return (this.#pageContent.get(page) ?? 0) > 0;
  }

  #markPageContent(page: PageParts, amount = 1): void {
    this.#pageContent.set(page, (this.#pageContent.get(page) ?? 0) + amount);
  }

  #warnOnce(
    code: "AVOID_RELAXED" | "WIDOW_ORPHAN_RELAXED" | "UNSUPPORTED_LAYOUT",
    constraint: BreakConstraint,
    message: string,
    property: string,
    value: string,
    recovery: string,
  ): void {
    const key = `${code}\u0000${constraint.sourceIdentity}`;
    if (this.#warned.has(key)) return;
    this.#warned.add(key);
    this.#warnings.push(
      Object.freeze({
        code,
        message,
        sourceIdentity: constraint.sourceIdentity,
        property,
        value,
        recovery,
      }),
    );
  }

  #cursorOverflows(cursor: FragmentCursor): boolean {
    if (pageOverflows(cursor.page)) return true;
    const root = cursor.overflowRoot;
    if (root === undefined) return false;
    const bounds = root.getBoundingClientRect();
    const availableWidth = Math.max(root.clientWidth, bounds.width);
    return root.scrollWidth > availableWidth + OVERFLOW_TOLERANCE_CSS_PX;
  }

  #elementOverflows(
    element: Element,
    cursor: FragmentCursor,
    constraint: BreakConstraint,
  ): boolean {
    if (this.#cursorOverflows(cursor)) return true;
    const multicol = constraint.layout === "safe-multicol" ? htmlElement(element) : undefined;
    if (multicol === undefined) return false;
    const bounds = multicol.getBoundingClientRect();
    const availableWidth = Math.max(multicol.clientWidth, bounds.width);
    return multicol.scrollWidth > availableWidth + OVERFLOW_TOLERANCE_CSS_PX;
  }

  #shellCursor(
    parent: FragmentCursor,
    shell: Element,
    constraint: BreakConstraint,
  ): FragmentCursor {
    const multicol = constraint.layout === "safe-multicol" ? htmlElement(shell) : undefined;
    if (multicol !== undefined) {
      return { page: parent.page, container: shell, overflowRoot: multicol };
    }
    return {
      page: parent.page,
      container: shell,
      ...(parent.overflowRoot === undefined ? {} : { overflowRoot: parent.overflowRoot }),
    };
  }

  startForBreak(
    cursor: FragmentCursor,
    breakValue: PageBreak,
    continueParent: ContinueFragment,
    requestedName: string | undefined,
  ): FragmentCursor {
    this.check();
    let current = cursor;
    const nameChanged = current.page.name !== requestedName;
    if (breakValue !== "auto" || (nameChanged && this.#hasPageContent(current.page))) {
      if (this.#hasPageContent(current.page)) current = continueParent(requestedName);
      if (
        (breakValue === "left" || breakValue === "right") &&
        pageSide(current.page) !== breakValue
      ) {
        setPageBlank(current.page, true, this.#decorateBlankPages, this.#pageMedia);
        this.#decoratePage(current.page);
        current = continueParent(requestedName);
      }
    }
    if (current.page.name !== requestedName) {
      updatePageMedia(current.page, this.#pageMedia, requestedName, false);
      this.#decoratePage(current.page);
    }
    return current;
  }

  placeNode(
    node: Node,
    initialCursor: FragmentCursor,
    continueParent: ContinueFragment,
  ): FragmentCursor {
    this.check();
    if (isNonFlowNode(node)) {
      initialCursor.container.append(node);
      return initialCursor;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return this.#placeText(node as Text, initialCursor, continueParent);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      initialCursor.container.append(node);
      return initialCursor;
    }

    const element = node as Element;
    const constraint = this.#constraints.get(element);
    if (constraint === undefined) {
      initialCursor.container.append(element);
      this.#markPageContent(initialCursor.page);
      return initialCursor;
    }
    if (constraint.layout.startsWith("unsupported-")) {
      this.#warnOnce(
        "UNSUPPORTED_LAYOUT",
        constraint,
        "The authored layout is outside the supported fragmentation subset and was kept atomic.",
        "display",
        constraint.layout.replace("unsupported-", ""),
        "Kept the source layout atomic.",
      );
    }

    let cursor = initialCursor;
    const pageHadContent = this.#hasPageContent(cursor.page);
    cursor.container.append(element);
    let overflows = this.#elementOverflows(element, cursor, constraint);
    const mustHonorDescendantBreak = constraint.hasForcedDescendant && !constraint.atomic;

    if (overflows && pageHadContent) {
      element.remove();
      cursor = continueParent(cursor.page.name);
      cursor.container.append(element);
      overflows = this.#elementOverflows(element, cursor, constraint);
    }

    if (constraint.insideAvoid && (overflows || mustHonorDescendantBreak)) {
      this.#warnOnce(
        "AVOID_RELAXED",
        constraint,
        "The break-inside avoidance constraint could not be preserved.",
        "break-inside",
        "avoid",
        "Fragmented the source content deterministically.",
      );
    }

    if (!overflows && !mustHonorDescendantBreak) {
      this.#markPageContent(cursor.page);
      return cursor;
    }
    if (constraint.atomic) {
      if (overflows) this.#reportOverflow();
      this.#markPageContent(cursor.page);
      return cursor;
    }
    if (constraint.layout === "table") {
      return this.#fragmentTable(element, cursor, continueParent);
    }
    const lines = overflows ? directLineGroups(element) : undefined;
    if (lines !== undefined) {
      return this.#fragmentLineBlock(element, lines, cursor, continueParent, constraint);
    }
    const onlyChild = element.childNodes.length === 1 ? element.firstChild : null;
    if (overflows && onlyChild?.nodeType === Node.TEXT_NODE) {
      return this.#fragmentPlainTextBlock(
        element,
        onlyChild as Text,
        cursor,
        continueParent,
        constraint,
      );
    }
    return this.#fragmentElement(element, cursor, continueParent, constraint);
  }

  #placeText(
    text: Text,
    initialCursor: FragmentCursor,
    continueParent: ContinueFragment,
  ): FragmentCursor {
    let cursor = initialCursor;
    const pageHadContent = this.#hasPageContent(cursor.page);
    cursor.container.append(text);
    if (this.#cursorOverflows(cursor) && pageHadContent) {
      text.remove();
      cursor = continueParent(cursor.page.name);
      cursor.container.append(text);
    }

    let currentText = text;
    while (this.#cursorOverflows(cursor)) {
      this.check();
      const remainder = splitTextToFit(
        currentText,
        () => this.#cursorOverflows(cursor),
        () => this.check(),
      );
      if (remainder === undefined) {
        this.#reportOverflow();
        this.#markPageContent(cursor.page);
        return cursor;
      }
      this.#generatedFragment();
      this.#markPageContent(cursor.page);
      cursor = continueParent(cursor.page.name);
      cursor.container.append(remainder);
      currentText = remainder;
    }
    if (currentText.data.trim() !== "") this.#markPageContent(cursor.page);
    return cursor;
  }

  #fragmentElement(
    element: Element,
    parentCursor: FragmentCursor,
    continueParent: ContinueFragment,
    constraint: BreakConstraint,
  ): FragmentCursor {
    this.#beginRecord();
    const children = [...element.childNodes];
    if (children.length === 0) {
      if (this.#elementOverflows(element, parentCursor, constraint)) this.#reportOverflow();
      this.#markPageContent(parentCursor.page);
      return parentCursor;
    }

    element.replaceChildren();
    let parentAtFragment = parentCursor;
    let shell = element;
    let shellCursor = this.#shellCursor(parentAtFragment, shell, constraint);
    const continueShell: ContinueFragment = (name) => {
      const shellIsEmpty = ![...shell.childNodes].some((child) => !isNonFlowNode(child));
      if (shellIsEmpty) shell.remove();
      parentAtFragment = continueParent(name);
      if (!shellIsEmpty) shell = this.#cloneFragment(element, false);
      parentAtFragment.container.append(shell);
      shellCursor = this.#shellCursor(parentAtFragment, shell, constraint);
      return shellCursor;
    };

    let pendingBreakAfter: PageBreak = "auto";
    let placedChild = false;
    for (const child of children) {
      this.check();
      const childContributes = nodeContributesToFlow(child, this.#constraints);
      const childConstraint = breakConstraintFor(child, this.#constraints);
      if (childContributes) {
        const requestedName =
          child.nodeType === Node.ELEMENT_NODE
            ? authoredPageName(child as Element)
            : shellCursor.page.name;
        shellCursor = this.startForBreak(
          shellCursor,
          combinedBreak(pendingBreakAfter, childConstraint.before),
          continueShell,
          requestedName,
        );
        placedChild = true;
      }
      shellCursor = this.placeNode(child, shellCursor, continueShell);
      if (childContributes) pendingBreakAfter = childConstraint.after;
    }
    if (!placedChild) this.#markPageContent(shellCursor.page);
    return parentAtFragment;
  }

  #fragmentLineBlock(
    element: Element,
    lines: readonly (readonly Node[])[],
    parentCursor: FragmentCursor,
    continueParent: ContinueFragment,
    constraint: BreakConstraint,
  ): FragmentCursor {
    this.#beginRecord();
    element.replaceChildren();
    let parentAtFragment = parentCursor;
    let shell = element;
    let shellCursor = this.#shellCursor(parentAtFragment, shell, constraint);
    const continueShell: ContinueFragment = (name) => {
      parentAtFragment = continueParent(name);
      shell = this.#cloneFragment(element, false);
      parentAtFragment.container.append(shell);
      shellCursor = this.#shellCursor(parentAtFragment, shell, constraint);
      return shellCursor;
    };

    let lineIndex = 0;
    while (lineIndex < lines.length) {
      this.check();
      let fittingLines = 0;
      while (lineIndex + fittingLines < lines.length) {
        this.check();
        const line = lines[lineIndex + fittingLines];
        if (line === undefined) break;
        shell.append(...line);
        if (this.#cursorOverflows(shellCursor)) {
          for (const node of line) node.parentNode?.removeChild(node);
          break;
        }
        fittingLines += 1;
      }

      if (lineIndex + fittingLines === lines.length) {
        this.#markPageContent(shellCursor.page, Math.max(1, fittingLines));
        break;
      }
      if (fittingLines === 0) {
        const line = lines[lineIndex];
        if (line === undefined) break;
        shell.append(...line);
        fittingLines = 1;
        this.#reportOverflow();
      }

      const remainingLines = lines.length - lineIndex;
      const legalMaximum = Math.min(fittingLines, remainingLines - constraint.widows);
      const legalBreak = legalMaximum >= constraint.orphans ? legalMaximum : 0;
      const selectedLines = legalBreak > 0 ? legalBreak : fittingLines;
      if (legalBreak === 0) {
        this.#warnOnce(
          "WIDOW_ORPHAN_RELAXED",
          constraint,
          "The widows and orphans constraints cannot both be satisfied.",
          "widows/orphans",
          `${constraint.widows}/${constraint.orphans}`,
          "Used the latest fitting rendered-line breakpoint.",
        );
      }
      for (let index = selectedLines; index < fittingLines; index += 1) {
        const line = lines[lineIndex + index];
        if (line === undefined) continue;
        for (const node of line) node.parentNode?.removeChild(node);
      }
      this.#markPageContent(shellCursor.page, selectedLines);
      lineIndex += selectedLines;
      if (lineIndex < lines.length) continueShell(shellCursor.page.name);
    }
    return parentAtFragment;
  }

  #fragmentPlainTextBlock(
    element: Element,
    text: Text,
    parentCursor: FragmentCursor,
    continueParent: ContinueFragment,
    constraint: BreakConstraint,
  ): FragmentCursor {
    this.#beginRecord();
    let parentAtFragment = parentCursor;
    let shell = element;
    let shellCursor = this.#shellCursor(parentAtFragment, shell, constraint);
    const continueShell: ContinueFragment = (name) => {
      parentAtFragment = continueParent(name);
      shell = this.#cloneFragment(element, false);
      parentAtFragment.container.append(shell);
      shellCursor = this.#shellCursor(parentAtFragment, shell, constraint);
      return shellCursor;
    };

    let currentText = text;
    while (this.#cursorOverflows(shellCursor)) {
      this.check();
      const value = currentText.data;
      const lineEnds = renderedLineEnds(currentText, () => this.check());
      const fittingRemainder = splitTextToFit(
        currentText,
        () => this.#cursorOverflows(shellCursor),
        () => this.check(),
      );
      if (fittingRemainder === undefined) {
        currentText.data = value;
        this.#reportOverflow();
        this.#markPageContent(shellCursor.page);
        return parentAtFragment;
      }
      const fittingEnd = currentText.data.length;
      currentText.data = value;
      const fittingLines = lineEnds.filter((end) => end <= fittingEnd).length;
      const legalMaximum = Math.min(fittingLines, lineEnds.length - constraint.widows);
      const legalBreak = legalMaximum >= constraint.orphans ? legalMaximum : 0;
      const selectedLines = legalBreak > 0 ? legalBreak : Math.max(1, fittingLines);
      if (legalBreak === 0) {
        this.#warnOnce(
          "WIDOW_ORPHAN_RELAXED",
          constraint,
          "The widows and orphans constraints cannot both be satisfied.",
          "widows/orphans",
          `${constraint.widows}/${constraint.orphans}`,
          "Used the latest fitting rendered-line breakpoint.",
        );
      }
      const renderedEnd = lineEnds[selectedLines - 1] ?? fittingEnd;
      const renderedPrefix = value.slice(0, renderedEnd);
      const whitespaceRuns = [...renderedPrefix.matchAll(/\s+/gu)];
      const lastWhitespace = whitespaceRuns.at(-1);
      const whitespaceEnd =
        lastWhitespace?.index === undefined
          ? undefined
          : lastWhitespace.index + lastWhitespace[0].length;
      const selectedEnd =
        whitespaceEnd !== undefined && whitespaceEnd > 0 ? whitespaceEnd : renderedEnd;
      currentText.data = value.slice(0, selectedEnd);
      const remainder = currentText.ownerDocument.createTextNode(value.slice(selectedEnd));
      this.#generatedFragment();
      this.#markPageContent(shellCursor.page, selectedLines);
      continueShell(shellCursor.page.name);
      shell.append(remainder);
      currentText = remainder;
    }
    if (currentText.data.trim() !== "") this.#markPageContent(shellCursor.page);
    return parentAtFragment;
  }

  #fragmentTable(
    element: Element,
    parentCursor: FragmentCursor,
    continueParent: ContinueFragment,
  ): FragmentCursor {
    this.#beginRecord();
    const structuralChildren = [...element.children];
    const captions = structuralChildren.filter((child) => child.localName === "caption");
    const colgroups = structuralChildren.filter((child) => child.localName === "colgroup");
    const headers = structuralChildren.filter((child) => child.localName === "thead");
    const colgroupTemplates = colgroups.map((child) => child.cloneNode(true) as Element);
    const headerTemplates = headers.map((child) => child.cloneNode(true) as Element);
    const groups = structuralChildren
      .filter((child) => child.localName === "tbody" || child.localName === "tfoot")
      .map((group) => ({
        group,
        rows: [...group.children].filter((child) => child.localName === "tr"),
      }));
    for (const { group } of groups) group.replaceChildren();
    element.replaceChildren(...captions, ...colgroups, ...headers);

    let parentAtFragment = parentCursor;
    let tableShell = element;
    let tableCursor: FragmentCursor = {
      page: parentAtFragment.page,
      container: tableShell,
      ...(parentAtFragment.overflowRoot === undefined
        ? {}
        : { overflowRoot: parentAtFragment.overflowRoot }),
    };
    let rowsOnFragment = 0;
    let groupShell: Element | undefined;

    const continueTable = (name: string | undefined, sourceGroup: Element): FragmentCursor => {
      parentAtFragment = continueParent(name);
      tableShell = this.#cloneFragment(element, false);
      for (const template of colgroupTemplates) {
        tableShell.append(this.#cloneFragment(template, true));
      }
      for (const template of headerTemplates) {
        tableShell.append(this.#cloneFragment(template, true));
      }
      parentAtFragment.container.append(tableShell);
      groupShell = this.#cloneFragment(sourceGroup, false);
      tableShell.append(groupShell);
      tableCursor = {
        page: parentAtFragment.page,
        container: groupShell,
        ...(parentAtFragment.overflowRoot === undefined
          ? {}
          : { overflowRoot: parentAtFragment.overflowRoot }),
      };
      rowsOnFragment = 0;
      return tableCursor;
    };

    let pendingBreakAfter: PageBreak = "auto";
    for (const { group, rows } of groups) {
      this.check();
      groupShell = group;
      tableShell.append(groupShell);
      tableCursor = {
        page: parentAtFragment.page,
        container: groupShell,
        ...(parentAtFragment.overflowRoot === undefined
          ? {}
          : { overflowRoot: parentAtFragment.overflowRoot }),
      };
      const groupConstraint = this.#constraints.get(group);
      let firstRow = true;
      for (const row of rows) {
        this.check();
        const rowConstraint = this.#constraints.get(row);
        const before = combinedBreak(
          firstRow && groupConstraint !== undefined
            ? combinedBreak(pendingBreakAfter, groupConstraint.before)
            : pendingBreakAfter,
          rowConstraint?.before ?? "auto",
        );
        if (before !== "auto" && rowsOnFragment > 0) {
          tableCursor = continueTable(parentAtFragment.page.name, group);
        }

        tableCursor.container.append(row);
        if (this.#cursorOverflows(tableCursor)) {
          row.remove();
          if (rowsOnFragment > 0) tableCursor = continueTable(parentAtFragment.page.name, group);
          tableCursor.container.append(row);
          if (this.#cursorOverflows(tableCursor)) {
            this.#reportOverflow();
            pendingBreakAfter = "page";
          }
        }
        this.#markPageContent(tableCursor.page);
        rowsOnFragment += 1;
        pendingBreakAfter = rowConstraint?.after ?? pendingBreakAfter;
        firstRow = false;
      }
      if (groupConstraint?.after !== undefined && groupConstraint.after !== "auto") {
        pendingBreakAfter = groupConstraint.after;
      }
    }
    if (groups.every(({ rows }) => rows.length === 0)) {
      if (this.#cursorOverflows(tableCursor)) this.#reportOverflow();
      this.#markPageContent(tableCursor.page);
    }
    return parentAtFragment;
  }
}

export async function buildGeneration(
  frameDocument: Document,
  source: PageSource,
  settings: PageGenerationSettings,
  signal: AbortSignal,
): Promise<BuiltGeneration> {
  const paginationStartedAt = performance.now();
  const deadlineAt = paginationStartedAt + settings.limits.resourceDeadlineMs;
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
    const fragmentationWarnings: PageWarning[] = [];
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
      const checkPagination = () => {
        throwIfAborted(signal);
        if (performance.now() > deadlineAt) {
          throw new ImposiaError("RESOURCE_TIMEOUT", "Page generation timed out.");
        }
      };
      const breakConstraints = captureBreakConstraints(sourceFlow, checkPagination);
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

      const fragmenter = new RecursiveFragmenter({
        constraints: breakConstraints,
        signal,
        deadlineAt,
        limits: settings.limits,
        decorateBlankPages: settings.decorateBlankPages,
        pageMedia,
        decoratePage: decorateCurrentPage,
        reportOverflow,
        warnings: fragmentationWarnings,
      });
      const initialPage = allocatePage(undefined);
      let currentCursor: FragmentCursor = { page: initialPage, container: initialPage.flow };
      const continueRoot: ContinueFragment = (name) => {
        const page = nextContentPage(name);
        return { page, container: page.flow };
      };
      let pendingBreakAfter: PageBreak = "auto";
      for (const node of [...sourceFlow.childNodes]) {
        fragmenter.check();
        const contributesToFlow = nodeContributesToFlow(node, breakConstraints);
        const constraint = breakConstraintFor(node, breakConstraints);
        if (contributesToFlow) {
          const requestedName =
            node.nodeType === Node.ELEMENT_NODE ? authoredPageName(node as Element) : undefined;
          let requestedBreak = constraint.before === "auto" ? pendingBreakAfter : constraint.before;
          if (
            requestedBreak === "auto" &&
            flowHasContent(currentCursor.page.flow) &&
            currentCursor.page.name !== requestedName
          ) {
            requestedBreak = "page";
          }
          currentCursor = fragmenter.startForBreak(
            currentCursor,
            requestedBreak,
            continueRoot,
            requestedName,
          );
        }
        currentCursor = fragmenter.placeNode(node, currentCursor, continueRoot);

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
      ...fragmentationWarnings,
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
