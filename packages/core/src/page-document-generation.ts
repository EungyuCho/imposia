import { normalizeCss } from "./css-contracts.js";
import { prepareDecoration, prepareDocument, prepareExtensionInput } from "./document.js";
import { ImposiaError } from "./errors.js";
import { type ResolvedPageAssets, resolvePageAssets } from "./page-document-assets.js";
import {
  allowExtensionAsset,
  applyExtensionEntryTransforms,
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
  cleanPublishingInternals,
  extractPublishingCss,
  finalizePublishingPass,
  namedStringValue,
  PUBLISHING_SOURCE_MARKER,
  type PublishingCssRule,
  preparePublishingContent,
  preparePublishingPass,
} from "./page-document-publishing.js";
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
import { DEFAULT_PAGE_LIMITS, UNLOCATED_PAGE_WARNING_LOCATION } from "./page-document-types.js";
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
import {
  composePublicationExtensionSource,
  publicationExtensionSource,
} from "./publication-source.js";
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
  documentLanguage?: string;
  pages: readonly BuiltPage[];
  warnings: readonly PageWarning[];
  warningSourceLocations: ReadonlyMap<string, BuiltWarningSourceLocation>;
  timings: Readonly<{ resourceMs: number; paginationMs: number }>;
  blobUrls: readonly string[];
  semanticSnapshot: PageSemanticSnapshot;
  revoke(): void;
}

export interface BuiltWarningSourceLocation {
  readonly page: number;
  readonly publicationEntryIndex: number | undefined;
  readonly target: Element;
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
  readonly sourceIdentity: string | undefined;
  before: PageBreak;
  after: PageBreak;
  readonly insideAvoid: boolean;
  readonly widows: number;
  readonly orphans: number;
  readonly widowOrphanFallback: boolean;
  contributesToFlow: boolean;
  readonly layout: FragmentationLayout;
  readonly atomic: boolean;
  hasForcedDescendant: boolean;
  hasUnbreakableDescendant: boolean;
}

const PUBLICATION_ENTRY_MARKER = "data-imposia-publication-entry";

type FragmentationLayout =
  | "normal"
  | "table"
  | "safe-flex"
  | "safe-grid"
  | "safe-multicol"
  | "unsupported-table"
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
  totalPages: number,
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
      totalPages,
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

function resolveMarginBoxes(
  page: PageParts,
  pageNumber: number,
  totalPages: number,
  namedStrings?: ReadonlyMap<string, string>,
): void {
  for (const boxName of PAGE_MARGIN_BOX_NAMES) {
    const box = page.page.querySelector<HTMLElement>(`[data-imposia-margin-box="${boxName}"]`);
    if (box === null) throw new Error(`Page margin box ${boxName} is unavailable.`);
    box.textContent = marginBoxText(
      page.marginBoxes.get(boxName),
      pageNumber,
      totalPages,
      (name, position) => namedStringValue(namedStrings, name, position),
    );
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

function topLevelTrackValues(value: string): readonly string[] {
  if (value === "none" || value.trim() === "") return [];
  const tracks: string[] = [];
  let track = "";
  let depth = 0;
  for (const character of value.trim()) {
    if (/\s/u.test(character) && depth === 0) {
      if (track !== "") tracks.push(track);
      track = "";
      continue;
    }
    track += character;
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
  }
  if (track !== "") tracks.push(track);
  return tracks;
}

function isStaticOrderedChild(element: Element, view: Window): boolean {
  const style = view.getComputedStyle(element);
  return style.position === "static" && Number(style.order) === 0;
}

function generatesPseudoItem(
  element: Element,
  pseudo: "::before" | "::after" | "::marker",
  view: Window,
): boolean {
  const style = view.getComputedStyle(element, pseudo);
  const content = style.content.trim().toLowerCase();
  return style.display !== "none" && content !== "" && content !== "normal" && content !== "none";
}

function hasSourceOrderedFlexItems(element: Element, view: Window): boolean {
  if (
    generatesPseudoItem(element, "::before", view) ||
    generatesPseudoItem(element, "::after", view)
  ) {
    return false;
  }
  let previousOrder = Number.NEGATIVE_INFINITY;
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if ((child.textContent ?? "").trim() === "") continue;
      if (0 < previousOrder) return false;
      previousOrder = 0;
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const style = view.getComputedStyle(child as Element);
    if (style.display === "none") continue;
    const order = Number(style.order);
    if (
      style.display === "contents" ||
      (style.position !== "static" && style.position !== "relative") ||
      !Number.isInteger(order) ||
      order < previousOrder
    ) {
      return false;
    }
    previousOrder = order;
  }
  return true;
}

function isSafeGridChild(element: Element, view: Window): boolean {
  if (!isStaticOrderedChild(element, view)) return false;
  const style = view.getComputedStyle(element);
  return (
    style.display !== "contents" &&
    style.gridColumnStart === "auto" &&
    style.gridColumnEnd === "auto" &&
    style.gridRowStart === "auto" &&
    style.gridRowEnd === "auto"
  );
}

function hasForcedGridDescendant(element: Element, view: Window): boolean {
  return [...element.querySelectorAll<Element>("*")].some((descendant) => {
    const style = view.getComputedStyle(descendant);
    return (
      pageBreak(style.breakBefore) !== "auto" ||
      pageBreak(style.breakAfter) !== "auto" ||
      authoredPageName(descendant) !== undefined
    );
  });
}

interface ResolvedGridTracks {
  readonly columns: readonly string[];
  readonly rows: readonly string[];
}

function safeGridTracks(
  element: Element,
  style: CSSStyleDeclaration,
  view: Window,
): ResolvedGridTracks | undefined {
  const template = style.gridTemplateColumns.trim().toLowerCase();
  const rowTemplate = style.gridTemplateRows.trim().toLowerCase();
  const columns = topLevelTrackValues(template);
  const columnCount = columns.length;
  if (
    htmlElement(element) === undefined ||
    style.display !== "grid" ||
    style.gridAutoFlow !== "row" ||
    style.gridTemplateAreas !== "none" ||
    columnCount < 1 ||
    template.includes("[") ||
    template.includes("subgrid") ||
    template.includes("masonry") ||
    rowTemplate.includes("[") ||
    rowTemplate.includes("subgrid") ||
    rowTemplate.includes("masonry") ||
    generatesPseudoItem(element, "::before", view) ||
    generatesPseudoItem(element, "::after", view)
  ) {
    return undefined;
  }

  const rowBreaks = new Map<
    number,
    { before: PageBreak | undefined; after: PageBreak | undefined }
  >();
  let itemIndex = 0;
  for (const child of element.childNodes) {
    if (isNonFlowNode(child)) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) return undefined;
    const childElement = child as Element;
    const childStyle = view.getComputedStyle(childElement);
    if (childStyle.display === "none") continue;
    if (
      !isSafeGridChild(childElement, view) ||
      authoredPageName(childElement) !== undefined ||
      hasForcedGridDescendant(childElement, view)
    ) {
      return undefined;
    }

    const rowIndex = Math.floor(itemIndex / columnCount);
    const breaks = rowBreaks.get(rowIndex) ?? { before: undefined, after: undefined };
    const before = pageBreak(childStyle.breakBefore);
    const after = pageBreak(childStyle.breakAfter);
    if (
      (before !== "auto" && breaks.before !== undefined && breaks.before !== before) ||
      (after !== "auto" && breaks.after !== undefined && breaks.after !== after)
    ) {
      return undefined;
    }
    if (before !== "auto") breaks.before = before;
    if (after !== "auto") breaks.after = after;
    rowBreaks.set(rowIndex, breaks);
    itemIndex += 1;
  }
  const rows = topLevelTrackValues(rowTemplate);
  if (
    itemIndex === 0 ||
    rows.length !== Math.ceil(itemIndex / columnCount) ||
    [...columns, ...rows].some((track) => absoluteCssPixels(track) === undefined)
  ) {
    return undefined;
  }
  return { columns, rows };
}

function tableCellSpan(cell: Element, attribute: "rowspan" | "colspan"): number | undefined {
  const value = cell.getAttribute(attribute);
  if (value === null) return 1;
  if (!/^\d+$/u.test(value.trim())) return undefined;
  const span = Number(value);
  return Number.isSafeInteger(span) && span > 0 ? span : undefined;
}

function tableRowClusters(group: Element): readonly (readonly Element[])[] | undefined {
  const rows = [...group.children].filter((child) => child.localName.toLowerCase() === "tr");
  const clusters: Element[][] = [];
  let start = 0;
  while (start < rows.length) {
    let end = start;
    for (let rowIndex = start; rowIndex <= end; rowIndex += 1) {
      const row = rows[rowIndex];
      if (row === undefined) return undefined;
      for (const cell of [...row.children].filter((child) => {
        const name = child.localName.toLowerCase();
        return name === "td" || name === "th";
      })) {
        const rowspan = tableCellSpan(cell, "rowspan");
        const colspan = tableCellSpan(cell, "colspan");
        if (rowspan === undefined || colspan === undefined) return undefined;
        end = Math.max(end, rowIndex + rowspan - 1);
        if (end >= rows.length) return undefined;
      }
    }
    clusters.push(rows.slice(start, end + 1));
    start = end + 1;
  }
  return clusters;
}

function tableUsesIdSelector(element: Element): boolean {
  const identifiers = [element, ...element.querySelectorAll<Element>("[id]")]
    .map((candidate) => candidate.id)
    .filter((identifier) => identifier !== "");
  if (identifiers.length === 0) return false;
  const view = element.ownerDocument.defaultView;
  const escapedIdentifiers = identifiers.map((identifier) =>
    view?.CSS?.escape === undefined ? identifier : view.CSS.escape(identifier),
  );
  const ruleListUsesIdentifier = (rules: CSSRuleList): boolean => {
    for (const rule of rules) {
      const selector = "selectorText" in rule ? String(rule.selectorText) : undefined;
      if (
        selector !== undefined &&
        identifiers.some(
          (identifier, index) =>
            selector.includes(`#${identifier}`) ||
            selector.includes(`#${escapedIdentifiers[index] ?? identifier}`),
        )
      ) {
        return true;
      }
      if ("cssRules" in rule && ruleListUsesIdentifier(rule.cssRules as CSSRuleList)) return true;
    }
    return false;
  };
  for (const sheet of element.ownerDocument.styleSheets) {
    try {
      if (ruleListUsesIdentifier(sheet.cssRules)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

function safeTableStructure(element: Element, style: CSSStyleDeclaration, view: Window): boolean {
  if (style.display !== "table" || tableUsesIdSelector(element)) return false;
  const expectedDisplays = new Map([
    ["table", "table"],
    ["caption", "table-caption"],
    ["colgroup", "table-column-group"],
    ["col", "table-column"],
    ["thead", "table-header-group"],
    ["tbody", "table-row-group"],
    ["tfoot", "table-footer-group"],
    ["tr", "table-row"],
    ["td", "table-cell"],
    ["th", "table-cell"],
  ]);
  for (const candidate of [element, ...element.querySelectorAll<Element>("*")]) {
    const candidateStyle = view.getComputedStyle(candidate);
    const expectedDisplay = expectedDisplays.get(candidate.localName.toLowerCase());
    if (
      (expectedDisplay !== undefined && candidateStyle.display !== expectedDisplay) ||
      generatesPseudoItem(candidate, "::before", view) ||
      generatesPseudoItem(candidate, "::after", view)
    ) {
      return false;
    }
    if (
      candidate !== element &&
      (pageBreak(candidateStyle.breakBefore) !== "auto" ||
        pageBreak(candidateStyle.breakAfter) !== "auto" ||
        authoredPageName(candidate) !== undefined)
    ) {
      return false;
    }
  }
  const allowedChildren = new Set(["caption", "colgroup", "thead", "tbody", "tfoot"]);
  if ([...element.children].some((child) => !allowedChildren.has(child.localName.toLowerCase()))) {
    return false;
  }

  for (const group of [...element.children].filter((child) => {
    const name = child.localName.toLowerCase();
    return name === "thead" || name === "tbody" || name === "tfoot";
  })) {
    const clusters = tableRowClusters(group);
    if (clusters === undefined) return false;
  }
  return true;
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

function visitCssStyleRules(
  document: Document,
  visit: (selector: string, style: CSSStyleDeclaration) => void,
): boolean {
  let reliable = true;
  const mediaMatches = (media: MediaList): boolean => {
    const query = media.mediaText.trim();
    if (query === "") return true;
    try {
      return document.defaultView?.matchMedia(query).matches === true;
    } catch {
      return false;
    }
  };
  const visitRules = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      const styleRule = "selectorText" in rule && "style" in rule;
      if (styleRule) {
        const selector = String(rule.selectorText).trim();
        if (selector !== "") visit(selector, (rule as CSSStyleRule).style);
      }
      if (!("cssRules" in rule)) continue;
      if (styleRule) {
        visitRules(rule.cssRules as CSSRuleList);
        continue;
      }
      if ("media" in rule && !mediaMatches(rule.media as MediaList)) continue;
      if ("media" in rule) {
        visitRules(rule.cssRules as CSSRuleList);
        continue;
      }
      const cssText = rule.cssText.trimStart().toLowerCase();
      if (cssText.startsWith("@supports")) {
        const condition = String((rule as CSSSupportsRule).conditionText).trim();
        if (condition === "" || document.defaultView?.CSS?.supports(condition) !== true) continue;
        visitRules(rule.cssRules as CSSRuleList);
        continue;
      }
      if (cssText.startsWith("@layer")) {
        visitRules(rule.cssRules as CSSRuleList);
        continue;
      }
      if (cssText.startsWith("@keyframes") || cssText.startsWith("@-webkit-keyframes")) continue;
      reliable = false;
    }
  };
  try {
    for (const sheet of document.styleSheets) {
      if (!sheet.disabled && mediaMatches(sheet.media)) visitRules(sheet.cssRules);
    }
    return reliable;
  } catch {
    return false;
  }
}

function positiveAbsoluteCssLength(value: string): boolean {
  const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+))(px|in|cm|mm|q|pt|pc)$/iu.exec(value.trim());
  return match?.[1] !== undefined && Number(match[1]) > 0;
}

function hasAuthoredAbsoluteMulticolHeight(element: Element): boolean {
  let found = false;
  let unsafe = false;
  const inspect = (style: CSSStyleDeclaration): void => {
    const height = style.getPropertyValue("height").trim();
    if (height !== "") {
      found = true;
      if (!positiveAbsoluteCssLength(height)) unsafe = true;
    }
    for (const property of ["block-size", "min-height", "max-height", "all"] as const) {
      if (style.getPropertyValue(property).trim() !== "") unsafe = true;
    }
  };
  const inlineStyle = htmlElement(element)?.style;
  if (inlineStyle !== undefined) inspect(inlineStyle);
  const accessible = visitCssStyleRules(element.ownerDocument, (selector, ruleStyle) => {
    try {
      if (element.matches(selector)) inspect(ruleStyle);
    } catch {
      unsafe = true;
    }
  });
  return accessible && found && !unsafe;
}

function multicolUsesFragmentSensitiveSelector(element: Element): boolean {
  const structuralPseudo =
    /:(?:first|last|only)-(?:child|of-type)|:nth-(?:last-)?(?:child|of-type)\([^)]*\)|:has\([^)]*\)/giu;
  const candidates = [element, ...element.querySelectorAll<Element>("*")];
  let sensitive = false;
  const accessible = visitCssStyleRules(element.ownerDocument, (selector) => {
    if (sensitive) return;
    const hasStructuralPseudo = structuralPseudo.test(selector);
    structuralPseudo.lastIndex = 0;
    const hasSiblingCombinator = /(?:\+|~)(?!=)/u.test(selector);
    if (!hasStructuralPseudo && !hasSiblingCombinator) return;
    const stableSelector = selector.replace(structuralPseudo, "").replace(/:not\(\s*\)/giu, "");
    structuralPseudo.lastIndex = 0;
    try {
      sensitive = candidates.some((candidate) => candidate.matches(stableSelector));
    } catch {
      sensitive = true;
    }
  });
  return !accessible || sensitive;
}

function safeMulticol(element: Element, style: CSSStyleDeclaration, view: Window): boolean {
  const columnCount = Number(style.columnCount);
  const columnWidth = absoluteCssPixels(style.columnWidth);
  const columnGap = absoluteCssPixels(style.columnGap);
  const columnHeight = absoluteCssPixels(style.height);
  if (
    style.position !== "static" ||
    style.cssFloat !== "none" ||
    style.transform !== "none" ||
    style.writingMode !== "horizontal-tb" ||
    style.direction !== "ltr" ||
    isInlineDisplay(style.display) ||
    style.display === "contents" ||
    style.display === "list-item" ||
    ["ol", "ul", "menu"].includes(element.localName.toLowerCase()) ||
    style.columnFill !== "auto" ||
    (!(Number.isInteger(columnCount) && columnCount > 0) &&
      !(columnWidth !== undefined && columnWidth > 0)) ||
    columnGap === undefined ||
    columnHeight === undefined ||
    columnHeight <= 0 ||
    !hasAuthoredAbsoluteMulticolHeight(element) ||
    [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].some(
      (margin) => absoluteCssPixels(margin) !== 0,
    ) ||
    generatesPseudoItem(element, "::before", view) ||
    generatesPseudoItem(element, "::after", view) ||
    generatesPseudoItem(element, "::marker", view) ||
    tableUsesIdSelector(element) ||
    multicolUsesFragmentSensitiveSelector(element) ||
    [...element.childNodes].some(
      (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "",
    )
  ) {
    return false;
  }

  for (const descendant of element.querySelectorAll<Element>("*")) {
    const descendantStyle = view.getComputedStyle(descendant);
    const columnSpan = descendantStyle.columnSpan.trim().toLowerCase();
    const directSpanner = descendant.parentElement === element && columnSpan === "all";
    const breakInside = descendantStyle.breakInside.trim().toLowerCase();
    if (
      descendantStyle.position !== "static" ||
      descendantStyle.cssFloat !== "none" ||
      (columnSpan !== "none" && !directSpanner) ||
      (descendant.parentElement === element &&
        (isInlineDisplay(descendantStyle.display) || descendantStyle.display === "contents")) ||
      establishesMulticol(descendantStyle) ||
      descendantStyle.display.includes("flex") ||
      descendantStyle.display.includes("grid") ||
      descendantStyle.display.includes("table") ||
      descendantStyle.display === "list-item" ||
      descendantStyle.transform !== "none" ||
      descendantStyle.breakBefore.trim().toLowerCase() !== "auto" ||
      descendantStyle.breakAfter.trim().toLowerCase() !== "auto" ||
      (breakInside !== "auto" && breakInside !== "avoid") ||
      authoredPageName(descendant) !== undefined ||
      generatesPseudoItem(descendant, "::before", view) ||
      generatesPseudoItem(descendant, "::after", view) ||
      generatesPseudoItem(descendant, "::marker", view) ||
      (directSpanner &&
        descendant.getBoundingClientRect().height +
          (absoluteCssPixels(descendantStyle.marginTop) ?? Number.POSITIVE_INFINITY) +
          (absoluteCssPixels(descendantStyle.marginBottom) ?? Number.POSITIVE_INFINITY) >
          columnHeight)
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
  if (element.localName.toLowerCase() === "table") {
    return safeTableStructure(element, style, view) ? "table" : "unsupported-table";
  }
  if (style.display.includes("flex")) {
    const safe =
      style.flexDirection === "column" &&
      style.flexWrap === "nowrap" &&
      hasSourceOrderedFlexItems(element, view);
    return safe ? "safe-flex" : "unsupported-flex";
  }
  if (style.display.includes("grid")) {
    return safeGridTracks(element, style, view) === undefined ? "unsupported-grid" : "safe-grid";
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

function elementSourceIdentity(element: Element): string | undefined {
  const authoredElement = element.closest(`[${PUBLISHING_SOURCE_MARKER}]`);
  const authoredOrder = authoredElement?.getAttribute(PUBLISHING_SOURCE_MARKER);
  if (authoredElement === null || authoredElement === undefined || authoredOrder === undefined) {
    return undefined;
  }
  if (authoredOrder === null || !/^[1-9][0-9]*$/u.test(authoredOrder)) return undefined;
  return `source-${authoredOrder}:${authoredElement.localName.toLowerCase()}`;
}

function captureBreakConstraints(
  root: HTMLElement,
  check: () => void,
): ReadonlyMap<Element, BreakConstraint> {
  const constraints = new Map<Element, BreakConstraint>();
  const view = root.ownerDocument.defaultView;
  if (view === null) return constraints;

  const elements = [...root.querySelectorAll<Element>("*")];
  for (const element of elements) {
    check();
    const localName = element.localName.toLowerCase();
    const sourceIdentity = elementSourceIdentity(element);
    if (NON_FLOW_ELEMENT_NAMES.has(localName)) {
      constraints.set(element, {
        sourceIdentity,
        before: "auto",
        after: "auto",
        insideAvoid: false,
        widows: 2,
        orphans: 2,
        widowOrphanFallback: false,
        contributesToFlow: false,
        layout: "normal",
        atomic: true,
        hasForcedDescendant: false,
        hasUnbreakableDescendant: false,
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
    const computedWidows = positiveComputedInteger(style.widows, 0);
    const computedOrphans = positiveComputedInteger(style.orphans, 0);
    const inlineWidows = inheritedInlinePositiveInteger(element, "widows");
    const inlineOrphans = inheritedInlinePositiveInteger(element, "orphans");
    constraints.set(element, {
      sourceIdentity,
      before: supportsBreak ? pageBreak(style.breakBefore) : "auto",
      after: supportsBreak ? pageBreak(style.breakAfter) : "auto",
      insideAvoid: style.breakInside.trim().toLowerCase() === "avoid",
      widows: computedWidows || inlineWidows || 2,
      orphans: computedOrphans || inlineOrphans || 2,
      widowOrphanFallback:
        (computedWidows === 0 && inlineWidows !== undefined) ||
        (computedOrphans === 0 && inlineOrphans !== undefined),
      contributesToFlow,
      layout,
      atomic: atomicElement(element, style, layout),
      hasForcedDescendant: false,
      hasUnbreakableDescendant: false,
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
      parentConstraint.hasUnbreakableDescendant ||=
        directUnbreakableText(element) || constraint.hasUnbreakableDescendant;
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

interface GridRowGroup {
  readonly nodes: readonly Node[];
  readonly items: readonly Element[];
}

function gridRowGroups(
  element: Element,
  columnCount: number,
  constraints: ReadonlyMap<Element, BreakConstraint>,
): readonly GridRowGroup[] {
  const groups: { nodes: Node[]; items: Element[] }[] = [];
  let nodes: Node[] = [];
  let items: Element[] = [];
  for (const child of element.childNodes) {
    nodes.push(child);
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      (constraints.get(child as Element)?.contributesToFlow ?? !isNonFlowNode(child))
    ) {
      items.push(child as Element);
      if (items.length === columnCount) {
        groups.push({ nodes, items });
        nodes = [];
        items = [];
      }
    }
  }
  if (nodes.length > 0) {
    if (items.length === 0 && groups.length > 0) groups.at(-1)?.nodes.push(...nodes);
    else groups.push({ nodes, items });
  }
  return groups;
}

function gridRowBreak(
  row: GridRowGroup,
  edge: "before" | "after",
  constraints: ReadonlyMap<Element, BreakConstraint>,
): PageBreak {
  for (const item of row.items) {
    const value = constraints.get(item)?.[edge] ?? "auto";
    if (value !== "auto") return value;
  }
  return "auto";
}

function tableClusterBreak(
  cluster: readonly Element[],
  edge: "before" | "after",
  constraints: ReadonlyMap<Element, BreakConstraint>,
): PageBreak {
  for (const row of edge === "before" ? cluster : [...cluster].reverse()) {
    const value = constraints.get(row)?.[edge] ?? "auto";
    if (value !== "auto") return value;
  }
  return "auto";
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

function collectWarningSourceLocations(
  pages: readonly PageParts[],
): ReadonlyMap<string, BuiltWarningSourceLocation> {
  const locations = new Map<string, BuiltWarningSourceLocation>();
  for (const [pageIndex, page] of pages.entries()) {
    for (const element of page.page.querySelectorAll<Element>(`[${PUBLISHING_SOURCE_MARKER}]`)) {
      const sourceOrder = element.getAttribute(PUBLISHING_SOURCE_MARKER);
      if (sourceOrder === null || !/^[1-9][0-9]*$/u.test(sourceOrder)) continue;
      const entryValue = element
        .closest(`[${PUBLICATION_ENTRY_MARKER}]`)
        ?.getAttribute(PUBLICATION_ENTRY_MARKER);
      const parsedEntryIndex =
        entryValue === undefined || entryValue === null ? undefined : Number(entryValue);
      const publicationEntryIndex =
        parsedEntryIndex !== undefined &&
        Number.isInteger(parsedEntryIndex) &&
        parsedEntryIndex >= 0
          ? parsedEntryIndex
          : undefined;
      const location = Object.freeze({
        page: pageIndex + 1,
        publicationEntryIndex,
        target: element,
      });
      const identity = `source-${sourceOrder}`;
      if (!locations.has(identity)) locations.set(identity, location);
      const elementIdentity = `${identity}:${element.localName.toLowerCase()}`;
      if (!locations.has(elementIdentity)) locations.set(elementIdentity, location);
    }
  }
  return locations;
}

function graphemeEnds(value: string): readonly number[] {
  const ends: number[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const segment of segmenter.segment(value)) ends.push(segment.index + segment.segment.length);
  return ends;
}

function splitTextToFit(
  text: Text,
  overflows: () => boolean,
  check: () => void,
  preferWhitespace = true,
): Text | undefined {
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
  const end =
    preferWhitespace && whitespaceEnd !== undefined && whitespaceEnd > 0
      ? whitespaceEnd
      : fittingEnd;
  text.data = value.slice(0, end);
  return text.ownerDocument.createTextNode(value.slice(end));
}

function hasKnownContentLanguage(element: Element): boolean {
  const languageElement = element.closest("[lang]");
  const language =
    languageElement === null
      ? element.ownerDocument.documentElement.lang.trim()
      : (languageElement.getAttribute("lang") ?? "").trim();
  if (language === "") return false;
  try {
    return Intl.getCanonicalLocales(language).length === 1;
  } catch {
    return false;
  }
}

function directUnbreakableText(element: Element): boolean {
  return [...element.childNodes].some(
    (child) => child.nodeType === Node.TEXT_NODE && /\S+/u.test(child.textContent ?? ""),
  );
}

function inheritedInlinePositiveInteger(
  element: Element,
  property: "widows" | "orphans",
): number | undefined {
  const declaration = new RegExp(
    `(?:^|;)\\s*${property}\\s*:\\s*([+]?[0-9]+)\\s*(?:!important\\s*)?(?:;|$)`,
    "iu",
  );
  for (
    let candidate: Element | null = element;
    candidate !== null;
    candidate = candidate.parentElement
  ) {
    const value = declaration.exec(candidate.getAttribute("style") ?? "")?.[1];
    if (value === undefined) continue;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
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
): Readonly<{
  css: readonly string[];
  rules: readonly AuthoredPageRule[];
  publishingRules: readonly PublishingCssRule[];
}> {
  const rules: AuthoredPageRule[] = [];
  const publishingRules: PublishingCssRule[] = [];
  const outputCss: string[] = [];
  let order = 0;
  for (const value of css) {
    const normalized = normalizeCss(value, warnings, order);
    const extracted = extractPageMediaCss(normalized, order);
    const publishing = extractPublishingCss(extracted.css, extracted.nextOrder, warnings);
    outputCss.push(publishing.css);
    rules.push(...extracted.rules);
    publishingRules.push(...publishing.rules);
    order = Math.max(publishing.nextOrder, order + value.length + 1);
  }
  for (const style of sourceFlow.querySelectorAll<HTMLStyleElement>("style")) {
    const value = style.textContent ?? "";
    const normalized = normalizeCss(value, warnings, order);
    const extracted = extractPageMediaCss(normalized, order);
    const publishing = extractPublishingCss(extracted.css, extracted.nextOrder, warnings);
    style.textContent = publishing.css;
    rules.push(...extracted.rules);
    publishingRules.push(...publishing.rules);
    order = Math.max(publishing.nextOrder, order + value.length + 1);
  }
  return Object.freeze({
    css: Object.freeze(outputCss),
    rules: Object.freeze(rules),
    publishingRules: Object.freeze(publishingRules),
  });
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
        location: UNLOCATED_PAGE_WARNING_LOCATION,
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
    this.#reportOverflow = options.reportOverflow;
    this.#warnings = options.warnings;
    for (const [element, constraint] of this.#constraints) {
      this.#prepareTypography(element, constraint);
      if (constraint.widowOrphanFallback) {
        this.#warnOnce(
          "WIDOW_ORPHAN_FALLBACK",
          constraint,
          "The browser does not expose authored widows and orphans through computed style.",
          "widows/orphans",
          `${constraint.widows}/${constraint.orphans}`,
          "Applied direct inline positive-integer constraints in Core pagination.",
        );
      }
    }
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
    code:
      | "AVOID_RELAXED"
      | "HYPHENATION_FALLBACK"
      | "UNBREAKABLE_CONTENT"
      | "WIDOW_ORPHAN_FALLBACK"
      | "WIDOW_ORPHAN_RELAXED"
      | "UNSUPPORTED_FRAGMENTATION_CONTEXT"
      | "UNSUPPORTED_LAYOUT",
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
        location: UNLOCATED_PAGE_WARNING_LOCATION,
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

  #inlineOverflows(element: HTMLElement, cursor: FragmentCursor): boolean {
    const bounds = element.getBoundingClientRect();
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.writingMode !== "horizontal-tb") {
      const inlineExtent = Math.max(element.scrollHeight, bounds.height);
      const blockExtent = Math.max(element.scrollWidth, bounds.width);
      return (
        inlineExtent > cursor.page.geometry.contentHeightCssPx + OVERFLOW_TOLERANCE_CSS_PX ||
        blockExtent > cursor.page.geometry.contentWidthCssPx + OVERFLOW_TOLERANCE_CSS_PX
      );
    }
    const ownWidth = Math.max(element.clientWidth, bounds.width);
    const availableWidth = Math.min(ownWidth, cursor.page.geometry.contentWidthCssPx);
    return element.scrollWidth > availableWidth + OVERFLOW_TOLERANCE_CSS_PX;
  }

  #prepareTypography(element: Element, constraint: BreakConstraint): void {
    const html = htmlElement(element);
    const view = element.ownerDocument.defaultView;
    if (html === undefined || view === null) return;
    const style = view.getComputedStyle(element);
    if (
      style.hyphens === "auto" &&
      element.children.length === 0 &&
      [...element.childNodes].some(
        (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "",
      ) &&
      !hasKnownContentLanguage(element)
    ) {
      html.style.hyphens = "manual";
      this.#warnOnce(
        "HYPHENATION_FALLBACK",
        constraint,
        "Automatic hyphenation requires a known content language.",
        "hyphens",
        "auto",
        "Used manual hyphenation because the content language is unknown.",
      );
    }
  }

  #recoverInlineOverflow(
    element: Element,
    cursor: FragmentCursor,
    constraint: BreakConstraint,
  ): boolean {
    const html = htmlElement(element);
    const view = element.ownerDocument.defaultView;
    if (
      html === undefined ||
      view === null ||
      constraint.layout !== "normal" ||
      constraint.atomic ||
      !directUnbreakableText(element) ||
      html.textContent?.trim() === "" ||
      !this.#inlineOverflows(html, cursor)
    ) {
      return false;
    }
    const style = view.getComputedStyle(html);
    if (style.overflowX !== "visible") return false;
    if (style.writingMode !== "horizontal-tb") {
      this.#warnOnce(
        "UNSUPPORTED_FRAGMENTATION_CONTEXT",
        constraint,
        "Overflowing vertical text is outside the supported fragmentation subset.",
        "writing-mode",
        style.writingMode,
        "Kept vertical writing atomic and reported page overflow.",
      );
      this.#reportOverflow();
      return true;
    }
    const wrappingForbidden = style.whiteSpace === "nowrap" || style.whiteSpace === "pre";
    if (!wrappingForbidden && style.overflowWrap !== "anywhere") {
      const authoredValue = style.overflowWrap;
      html.style.overflowWrap = "anywhere";
      if (!this.#inlineOverflows(html, cursor)) {
        this.#warnOnce(
          "UNBREAKABLE_CONTENT",
          constraint,
          "An unbreakable text run exceeded the available inline size.",
          "overflow-wrap",
          authoredValue,
          "Applied overflow-wrap: anywhere.",
        );
        return false;
      }
    }
    this.#warnOnce(
      "UNBREAKABLE_CONTENT",
      constraint,
      "An unbreakable text run still exceeds the available inline size.",
      wrappingForbidden ? "white-space" : "overflow-wrap",
      wrappingForbidden ? style.whiteSpace : style.overflowWrap,
      "Kept authored white-space and reported page overflow.",
    );
    this.#reportOverflow();
    return false;
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
        current = continueParent(requestedName);
      }
    }
    if (current.page.name !== requestedName) {
      updatePageMedia(current.page, this.#pageMedia, requestedName, false);
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
    const typographyAtomic = this.#recoverInlineOverflow(element, cursor, constraint);
    let overflows = this.#elementOverflows(element, cursor, constraint);
    const mustHonorDescendantBreak = constraint.hasForcedDescendant && !constraint.atomic;

    if (overflows && pageHadContent) {
      element.remove();
      cursor = continueParent(cursor.page.name);
      cursor.container.append(element);
      overflows = this.#elementOverflows(element, cursor, constraint);
    }

    if (
      constraint.layout === "safe-multicol" &&
      element.getBoundingClientRect().height >
        cursor.page.geometry.contentHeightCssPx + OVERFLOW_TOLERANCE_CSS_PX
    ) {
      this.#warnOnce(
        "UNSUPPORTED_LAYOUT",
        constraint,
        "The fixed multi-column height exceeds the usable page area and was kept atomic.",
        "display",
        "multicol",
        "Kept the source layout atomic.",
      );
      if (overflows) this.#reportOverflow();
      this.#markPageContent(cursor.page);
      return cursor;
    }

    if (typographyAtomic) {
      this.#markPageContent(cursor.page);
      return cursor;
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

    const html = htmlElement(element);
    const mustInspectInlineOverflow =
      constraint.hasUnbreakableDescendant &&
      html !== undefined &&
      this.#inlineOverflows(html, cursor);
    if (!overflows && !mustHonorDescendantBreak && !mustInspectInlineOverflow) {
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
    if (constraint.layout === "safe-grid") {
      return this.#fragmentGrid(element, cursor, continueParent, constraint);
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

  #fragmentGrid(
    element: Element,
    parentCursor: FragmentCursor,
    continueParent: ContinueFragment,
    constraint: BreakConstraint,
  ): FragmentCursor {
    this.#beginRecord();
    const view = element.ownerDocument.defaultView;
    const tracks =
      view === null ? undefined : safeGridTracks(element, view.getComputedStyle(element), view);
    const gridElement = htmlElement(element);
    if (tracks === undefined || gridElement === undefined) {
      this.#reportOverflow();
      this.#markPageContent(parentCursor.page);
      return parentCursor;
    }
    const rows = gridRowGroups(element, tracks.columns.length, this.#constraints);
    gridElement.style.gridTemplateColumns = tracks.columns.join(" ");
    gridElement.style.gridTemplateRows = "none";
    element.replaceChildren();
    let parentAtFragment = parentCursor;
    let shell = element;
    let shellCursor = this.#shellCursor(parentAtFragment, shell, constraint);
    let shellRowTracks: string[] = [];
    const applyShellTracks = () => {
      const shellElement = htmlElement(shell);
      if (shellElement === undefined) return;
      shellElement.style.gridTemplateColumns = tracks.columns.join(" ");
      shellElement.style.gridTemplateRows =
        shellRowTracks.length === 0 ? "none" : shellRowTracks.join(" ");
    };
    const continueShell: ContinueFragment = (name) => {
      const shellIsEmpty = ![...shell.childNodes].some((child) => !isNonFlowNode(child));
      if (shellIsEmpty) shell.remove();
      parentAtFragment = continueParent(name);
      if (!shellIsEmpty) shell = this.#cloneFragment(element, false);
      shellRowTracks = [];
      applyShellTracks();
      parentAtFragment.container.append(shell);
      shellCursor = this.#shellCursor(parentAtFragment, shell, constraint);
      return shellCursor;
    };

    let pendingBreakAfter: PageBreak = "auto";
    let placedRow = false;
    for (const [rowIndex, row] of rows.entries()) {
      this.check();
      if (row.items.length === 0) {
        shellCursor.container.append(...row.nodes);
        continue;
      }
      const sourceTrack = tracks.rows[rowIndex];
      if (sourceTrack === undefined) {
        this.#reportOverflow();
        shellCursor.container.append(...row.nodes);
        this.#markPageContent(shellCursor.page, row.items.length);
        continue;
      }
      shellCursor = this.startForBreak(
        shellCursor,
        combinedBreak(pendingBreakAfter, gridRowBreak(row, "before", this.#constraints)),
        continueShell,
        shellCursor.page.name,
      );
      const pageHadContent = this.#hasPageContent(shellCursor.page);
      shellRowTracks.push(sourceTrack);
      applyShellTracks();
      shellCursor.container.append(...row.nodes);
      if (this.#cursorOverflows(shellCursor)) {
        for (const node of row.nodes) node.parentNode?.removeChild(node);
        shellRowTracks.pop();
        applyShellTracks();
        if (pageHadContent) shellCursor = continueShell(shellCursor.page.name);
        shellRowTracks.push(sourceTrack);
        applyShellTracks();
        shellCursor.container.append(...row.nodes);
        if (this.#cursorOverflows(shellCursor)) this.#reportOverflow();
      }
      this.#markPageContent(shellCursor.page, row.items.length);
      pendingBreakAfter = gridRowBreak(row, "after", this.#constraints);
      placedRow = true;
    }
    if (!placedRow) this.#markPageContent(shellCursor.page);
    return parentAtFragment;
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
        false,
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
      const previousRenderedEnd = lineEnds[selectedLines - 2] ?? 0;
      const selectedEnd =
        whitespaceEnd !== undefined && whitespaceEnd > previousRenderedEnd
          ? whitespaceEnd
          : renderedEnd;
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
    const footers = structuralChildren.filter((child) => child.localName === "tfoot");
    const colgroupTemplates = colgroups.map((child) => child.cloneNode(true) as Element);
    const headerTemplates = headers.map((child) => child.cloneNode(true) as Element);
    const footerTemplates = footers.map((child) => child.cloneNode(true) as Element);
    const groups = structuralChildren
      .filter((child) => child.localName === "tbody")
      .map((group) => ({
        group,
        template: group.cloneNode(false) as Element,
        clusters: tableRowClusters(group) ?? [],
      }));
    for (const { group } of groups) group.replaceChildren();
    element.replaceChildren(...captions, ...colgroups, ...headers, ...footers);

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

    const appendGroup = (table: Element, group: Element): void => {
      const footer = [...table.children].find((child) => child.localName === "tfoot");
      if (footer === undefined) table.append(group);
      else table.insertBefore(group, footer);
    };

    const reportFurnitureOverflow = (cursor: FragmentCursor): boolean => {
      if (!this.#cursorOverflows(cursor)) return false;
      const tableConstraint = this.#constraints.get(element);
      if (tableConstraint !== undefined) {
        this.#warnOnce(
          "UNSUPPORTED_LAYOUT",
          tableConstraint,
          "The table caption, header, or footer is too tall to fit in the usable page area.",
          "display",
          "table",
          "Kept the table furniture atomic.",
        );
      }
      this.#reportOverflow();
      return true;
    };

    const continueTable = (name: string | undefined, groupTemplate: Element): FragmentCursor => {
      parentAtFragment = continueParent(name);
      tableShell = this.#cloneFragment(element, false);
      for (const template of colgroupTemplates) {
        tableShell.append(this.#cloneFragment(template, true));
      }
      for (const template of headerTemplates) {
        tableShell.append(this.#cloneFragment(template, true));
      }
      groupShell = this.#cloneFragment(groupTemplate, false);
      appendGroup(tableShell, groupShell);
      for (const template of footerTemplates) {
        tableShell.append(this.#cloneFragment(template, true));
      }
      parentAtFragment.container.append(tableShell);
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
    for (const { group, template, clusters } of groups) {
      this.check();
      groupShell = group;
      appendGroup(tableShell, groupShell);
      tableCursor = {
        page: parentAtFragment.page,
        container: groupShell,
        ...(parentAtFragment.overflowRoot === undefined
          ? {}
          : { overflowRoot: parentAtFragment.overflowRoot }),
      };
      const groupConstraint = this.#constraints.get(group);
      let firstCluster = true;
      for (const cluster of clusters) {
        this.check();
        const before = combinedBreak(
          firstCluster && groupConstraint !== undefined
            ? combinedBreak(pendingBreakAfter, groupConstraint.before)
            : pendingBreakAfter,
          tableClusterBreak(cluster, "before", this.#constraints),
        );
        if (before !== "auto" && rowsOnFragment > 0) {
          tableCursor = continueTable(parentAtFragment.page.name, template);
        }

        tableCursor.container.append(...cluster);
        let overflowed = false;
        if (this.#cursorOverflows(tableCursor)) {
          for (const row of cluster) row.remove();
          let furnitureOverflowed = reportFurnitureOverflow(tableCursor);
          if (furnitureOverflowed) {
            this.#markPageContent(tableCursor.page);
          }
          const captionOnFragment = [...tableShell.children].some(
            (child) => child.localName === "caption",
          );
          if (rowsOnFragment > 0 || captionOnFragment) {
            tableCursor = continueTable(parentAtFragment.page.name, template);
            furnitureOverflowed = reportFurnitureOverflow(tableCursor);
          }
          tableCursor.container.append(...cluster);
          if (this.#cursorOverflows(tableCursor)) {
            if (!furnitureOverflowed) {
              const clusterConstraint = this.#constraints.get(cluster[0] as Element);
              if (clusterConstraint !== undefined) {
                this.#warnOnce(
                  "UNSUPPORTED_LAYOUT",
                  clusterConstraint,
                  "The table row cluster is too tall to fragment without breaking cell structure.",
                  "display",
                  "table-row",
                  "Kept the row cluster atomic.",
                );
              }
            }
            this.#reportOverflow();
            overflowed = true;
          }
        }
        this.#markPageContent(tableCursor.page, cluster.length);
        rowsOnFragment += cluster.length;
        pendingBreakAfter = overflowed
          ? "page"
          : tableClusterBreak(cluster, "after", this.#constraints);
        firstCluster = false;
      }
      if (groupConstraint?.after !== undefined && groupConstraint.after !== "auto") {
        pendingBreakAfter = groupConstraint.after;
      }
    }
    if (groups.every(({ clusters }) => clusters.length === 0)) {
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
  const extensionInputWarnings: DocumentWarning[] = [];
  let transformed: Readonly<{ html: string; css: readonly string[] }>;
  try {
    const publicationSource = publicationExtensionSource(source);
    if (publicationSource === undefined) {
      if (extensions.some((extension) => extension.transformEntry !== undefined)) {
        throw new TypeError(
          "Invalid page extension: transformEntry is only supported by mountPublication().",
        );
      }
      if (extensions.some((extension) => extension.transform !== undefined)) {
        transformed = await applyExtensionTransforms(
          extensions,
          Object.freeze({ html, css: settings.css, baseUrl: source.baseUrl }),
          signal,
          extensionWarnings,
          (nextHtml, nextCss) => ensureTransformedInputLimit(nextHtml, nextCss, settings.limits),
          (nextHtml, nextCss) => {
            const safeInput = prepareExtensionInput(nextHtml, nextCss);
            extensionInputWarnings.push(...safeInput.warnings);
            return Object.freeze({ html: safeInput.html, css: safeInput.css });
          },
        );
      } else {
        transformed = Object.freeze({ html, css: settings.css });
      }
    } else {
      if (extensions.some((extension) => extension.transform !== undefined)) {
        throw new TypeError(
          "Invalid page extension: Publication extensions must use transformEntry instead of transform.",
        );
      }
      if (extensions.some((extension) => extension.transformEntry !== undefined)) {
        const entries: Array<Readonly<{ html: string; css: readonly string[] }>> = [];
        for (const entry of publicationSource.entries) {
          entries.push(
            await applyExtensionEntryTransforms(
              extensions,
              Object.freeze({
                html: entry.html,
                css: Object.freeze([]),
                publication: publicationSource.publication,
                entry: entry.metadata,
              }),
              signal,
              extensionWarnings,
              (nextHtml, nextCss) =>
                ensureTransformedInputLimit(nextHtml, nextCss, settings.limits),
              (nextHtml, nextCss) => {
                const safeInput = prepareExtensionInput(nextHtml, nextCss);
                extensionInputWarnings.push(...safeInput.warnings);
                return Object.freeze({ html: safeInput.html, css: safeInput.css });
              },
            ),
          );
        }
        const composed = composePublicationExtensionSource(publicationSource, entries);
        const composedHtml = sourceHtml(composed);
        ensureTransformedInputLimit(composedHtml, settings.css, settings.limits);
        transformed = Object.freeze({ html: composedHtml, css: settings.css });
      } else {
        transformed = Object.freeze({ html, css: settings.css });
      }
    }
  } catch (error: unknown) {
    extensionWarnings.cleanup();
    throw error;
  }
  let prepared: ReturnType<typeof prepareDocument>;
  try {
    prepared = prepareDocument(transformed.html, {
      ...(settings.headerTemplate === undefined ? {} : { headerTemplate: settings.headerTemplate }),
      ...(settings.footerTemplate === undefined ? {} : { footerTemplate: settings.footerTemplate }),
      allowRemoteResources: true,
    });
  } catch (error: unknown) {
    extensionWarnings.cleanup();
    throw error;
  }
  const pageSettings: PageGenerationSettings = {
    ...settings,
    ...(prepared.headerTemplate === undefined ? {} : { headerTemplate: prepared.headerTemplate }),
    ...(prepared.footerTemplate === undefined ? {} : { footerTemplate: prepared.footerTemplate }),
  };
  let assets: ResolvedPageAssets | undefined;
  const resourceStartedAt = performance.now();
  try {
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
  } catch (error: unknown) {
    assets?.revoke();
    extensionWarnings.cleanup();
    throw error;
  }
  const resourceFinishedAt = performance.now();
  try {
    throwIfAborted(signal);
    const resolvedBlobUrls = assets === undefined ? undefined : new Set(assets.blobUrls);
    const preparedSemanticSource = copyPreparedBody(
      frameDocument,
      assets?.html ?? prepared.html,
      assets !== undefined,
      resolvedBlobUrls,
      true,
    );
    if (preparedSemanticSource.documentLanguage !== undefined) {
      frameDocument.documentElement.lang = preparedSemanticSource.documentLanguage;
    }
    const semanticSourceFlow = frameDocument.createElement("div");
    semanticSourceFlow.append(preparedSemanticSource.fragment);
    const nodeCount = semanticSourceFlow.querySelectorAll("*").length;
    if (nodeCount > settings.limits.maxNodes) {
      throw new ImposiaError("NODE_LIMIT", "Page node limit exceeded.");
    }
    let resourceBlocked =
      preparedSemanticSource.resourceBlocked ||
      sanitizeFrameContent(semanticSourceFlow, assets !== undefined, resolvedBlobUrls, true);
    const sourceFlow = semanticSourceFlow.cloneNode(true) as HTMLElement;
    resourceBlocked ||= sanitizeFrameContent(sourceFlow, assets !== undefined, resolvedBlobUrls);
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
    const semanticStyles = semanticSourceFlow.querySelectorAll<HTMLStyleElement>("style");
    const frameStyles = sourceFlow.querySelectorAll<HTMLStyleElement>("style");
    for (const [index, style] of [...semanticStyles].entries()) {
      style.textContent = frameStyles[index]?.textContent ?? "";
    }
    const pageMedia: PaginationPageMedia = Object.freeze({
      rules: compiledPageMedia.rules,
      host: settings.page,
      warnings: pageMediaWarnings,
    });
    const semanticSnapshot = createPageSemanticSnapshot({
      html: semanticSourceFlow.innerHTML,
      css: compiledPageMedia.css,
      baseUrl: source.baseUrl,
      assets: assets?.semanticAssets ?? Object.freeze([]),
    });
    const publishing = preparePublishingContent(
      sourceFlow,
      compiledPageMedia.publishingRules,
      settings.limits,
    );
    const probeCss = Object.freeze([FRAME_STYLE, ...compiledPageMedia.css]);
    const body = frameDocument.createDocumentFragment();
    const probeStyles = appendProbeStyles(frameDocument, probeCss);
    const probe = createProbe(frameDocument);
    let pages: PageParts[] = [];
    const decorationWarnings: DocumentWarning[] = [];
    let fragmentationWarnings: PageWarning[] = [];
    let publishingWarnings: readonly PageWarning[] = Object.freeze([]);
    let overflowWarning: PageWarning | undefined;
    let warningSourceLocations: ReadonlyMap<string, BuiltWarningSourceLocation> = new Map();
    try {
      const paginate = (generatedValues: ReadonlyMap<string, string>) => {
        probe.replaceChildren();
        const passSource = sourceFlow.cloneNode(true) as HTMLElement;
        preparePublishingPass(
          passSource,
          publishing,
          generatedValues,
          settings.experimental,
          settings.limits,
        );
        probe.append(passSource);
        const passPages: PageParts[] = [];
        const passFragmentationWarnings: PageWarning[] = [];
        let passOverflowWarning: PageWarning | undefined;
        const reportOverflow = () => {
          passOverflowWarning ??= Object.freeze({
            code: "PAGE_OVERFLOW",
            message: "Content exceeds the usable page area.",
            sourceIdentity: undefined,
            location: UNLOCATED_PAGE_WARNING_LOCATION,
          });
        };
        const checkPagination = () => {
          throwIfAborted(signal);
          if (performance.now() > deadlineAt) {
            throw new ImposiaError("RESOURCE_TIMEOUT", "Page generation timed out.");
          }
        };
        const breakConstraints = captureBreakConstraints(passSource, checkPagination);
        const allocatePage = (name: string | undefined): PageParts => {
          throwIfAborted(signal);
          if (passPages.length >= settings.limits.maxPages) {
            throw new ImposiaError("PAGE_LIMIT", "Page limit exceeded.");
          }
          const created = createPage(frameDocument, pageMedia, passPages.length + 1, name);
          passPages.push(created);
          probe.append(created.page);
          return created;
        };
        const nextContentPage = (name: string | undefined): PageParts => {
          return allocatePage(name);
        };
        const fragmenter = new RecursiveFragmenter({
          constraints: breakConstraints,
          signal,
          deadlineAt,
          limits: settings.limits,
          decorateBlankPages: settings.decorateBlankPages,
          pageMedia,
          reportOverflow,
          warnings: passFragmentationWarnings,
        });
        const initialPage = allocatePage(undefined);
        let currentCursor: FragmentCursor = { page: initialPage, container: initialPage.flow };
        const continueRoot: ContinueFragment = (name) => {
          const page = nextContentPage(name);
          return { page, container: page.flow };
        };
        let pendingBreakAfter: PageBreak = "auto";
        for (const node of [...passSource.childNodes]) {
          fragmenter.check();
          const contributesToFlow = nodeContributesToFlow(node, breakConstraints);
          const constraint = breakConstraintFor(node, breakConstraints);
          if (contributesToFlow) {
            const requestedName =
              node.nodeType === Node.ELEMENT_NODE ? authoredPageName(node as Element) : undefined;
            let requestedBreak =
              constraint.before === "auto" ? pendingBreakAfter : constraint.before;
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
        const finalized = finalizePublishingPass(passPages, publishing, settings.experimental);
        return {
          pages: passPages,
          fragmentationWarnings: passFragmentationWarnings,
          overflowWarning: passOverflowWarning,
          publishing: finalized,
        };
      };

      let generatedValues: ReadonlyMap<string, string> = new Map();
      let previousSignature: string | undefined;
      const signatures = new Set<string>();
      let accepted: ReturnType<typeof paginate> | undefined;
      const passLimit = publishing.requiresConvergence ? settings.limits.maxLayoutPasses : 1;
      for (let pass = 0; pass < passLimit; pass += 1) {
        const result = paginate(generatedValues);
        if (!publishing.requiresConvergence || result.publishing.signature === previousSignature) {
          accepted = result;
          break;
        }
        if (signatures.has(result.publishing.signature)) {
          throw new ImposiaError(
            "LAYOUT_NON_CONVERGENT",
            "Generated publishing layout entered a non-convergent cycle.",
          );
        }
        signatures.add(result.publishing.signature);
        previousSignature = result.publishing.signature;
        generatedValues = result.publishing.generatedValues;
      }
      if (accepted === undefined) {
        throw new ImposiaError(
          "LAYOUT_NON_CONVERGENT",
          "Generated publishing layout did not converge within the configured pass limit.",
        );
      }
      pages = accepted.pages;
      fragmentationWarnings = accepted.fragmentationWarnings;
      publishingWarnings = accepted.publishing.warnings;
      overflowWarning = accepted.overflowWarning;
      for (const [index, page] of pages.entries()) {
        resourceBlocked =
          decoratePage(
            frameDocument,
            page,
            pages.length,
            pageSettings,
            extensions,
            signal,
            extensionWarnings,
            decorationWarnings,
          ) || resourceBlocked;
        resolveDecorationTokens(page.page, index + 1, pages.length);
        resolveMarginBoxes(page, index + 1, pages.length, accepted.publishing.namedStrings[index]);
      }
      warningSourceLocations = collectWarningSourceLocations(pages);
      cleanPublishingInternals(pages);
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
        ...extensionInputWarnings,
        ...prepared.warnings,
        ...decorationWarnings,
        ...pageMediaWarnings.finish(),
      ]),
      ...publishingWarnings,
      ...fragmentationWarnings,
    ];
    if (overflowWarning !== undefined) warnings.push(overflowWarning);
    if (resourceBlocked && !warnings.some((warning) => warning.code === "RESOURCE_BLOCKED")) {
      warnings.push(
        Object.freeze({
          code: "RESOURCE_BLOCKED",
          message: "Resource was blocked by the loading policy.",
          sourceIdentity: assets?.sourceIdentity,
          location: UNLOCATED_PAGE_WARNING_LOCATION,
        }),
      );
    }
    warnings.push(...extensionWarnings.finish());

    extensionWarnings.cleanup();
    return {
      body,
      css,
      ...(preparedSemanticSource.documentLanguage === undefined
        ? {}
        : { documentLanguage: preparedSemanticSource.documentLanguage }),
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
      warningSourceLocations,
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
    extensionWarnings.cleanup();
    throw error;
  }
}

export { bodyText };
