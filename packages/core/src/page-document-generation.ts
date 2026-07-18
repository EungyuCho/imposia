import { prepareDocument } from "./document.js";
import { ImposiaError } from "./errors.js";
import { type ResolvedPageAssets, resolvePageAssets } from "./page-document-assets.js";
import { abortError, FRAME_STYLE } from "./page-document-frame.js";
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
import type {
  AssetResolver,
  EffectivePageLimits,
  PageDocumentOptions,
  PageLimits,
  PageSource,
  PageWarning,
} from "./page-document-types.js";
import { DEFAULT_PAGE_LIMITS } from "./page-document-types.js";

export interface PageGenerationSettings {
  css: readonly string[];
  assetResolver?: AssetResolver;
  headerTemplate?: string;
  footerTemplate?: string;
  page?: { size?: "A4"; margin?: "20mm" };
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
  revoke(): void;
}

export interface BuiltPage {
  page: HTMLElement;
  flow: HTMLElement;
}

interface PageParts extends BuiltPage {
  content: HTMLElement;
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
  });
}

export function snapshotSettings(options: PageDocumentOptions): PageGenerationSettings {
  if (options.decorateBlankPages !== undefined) {
    throw new Error("decorateBlankPages is not implemented in the browser vertical slice.");
  }
  return {
    css: Object.freeze([...(options.css ?? [])]),
    ...(options.assetResolver === undefined ? {} : { assetResolver: options.assetResolver }),
    ...(options.headerTemplate === undefined ? {} : { headerTemplate: options.headerTemplate }),
    ...(options.footerTemplate === undefined ? {} : { footerTemplate: options.footerTemplate }),
    ...(options.page === undefined
      ? {}
      : {
          page: {
            ...(options.page.size === undefined ? {} : { size: options.page.size }),
            ...(options.page.margin === undefined ? {} : { margin: options.page.margin }),
          },
        }),
    limits: normalizePageLimits(options.limits),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
  };
}

function createPage(
  frameDocument: Document,
  settings: PageGenerationSettings,
  pageNumber: number,
): { page: PageParts; resourceBlocked: boolean } {
  const page = frameDocument.createElement("section");
  page.setAttribute("data-imposia-page", "");
  page.setAttribute("data-imposia-page-number", String(pageNumber));
  page.setAttribute("data-imposia-page-side", pageNumber % 2 === 1 ? "right" : "left");
  page.setAttribute("data-imposia-blank", "false");
  if (settings.page?.margin !== undefined) {
    page.style.setProperty("--imposia-page-margin", settings.page.margin);
  }

  const header = frameDocument.createElement("header");
  header.setAttribute("data-imposia-page-header", "");
  const content = frameDocument.createElement("main");
  content.setAttribute("data-imposia-page-content", "");
  const flow = frameDocument.createElement("div");
  flow.setAttribute("data-imposia-page-flow", "");
  const footer = frameDocument.createElement("footer");
  footer.setAttribute("data-imposia-page-footer", "");

  const headerResourceBlocked = appendDecoration(frameDocument, header, settings.headerTemplate);
  const footerResourceBlocked = appendDecoration(frameDocument, footer, settings.footerTemplate);
  content.append(flow);
  page.append(header, content, footer);
  return {
    page: { page, flow, content },
    resourceBlocked: headerResourceBlocked || footerResourceBlocked,
  };
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
  const prepared = prepareDocument(html, {
    ...(settings.headerTemplate === undefined ? {} : { headerTemplate: settings.headerTemplate }),
    ...(settings.footerTemplate === undefined ? {} : { footerTemplate: settings.footerTemplate }),
    ...(settings.assetResolver === undefined ? {} : { allowRemoteResources: true }),
  });
  let assets: ResolvedPageAssets | undefined;
  const resourceStartedAt = performance.now();
  if (settings.assetResolver !== undefined) {
    assets = await resolvePageAssets(
      sanitizeAssetResolverInput(prepared.html),
      source.baseUrl,
      settings.css,
      settings.assetResolver,
      settings.limits,
      signal,
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

    const sanitizedCss = (assets?.css ?? settings.css).map((css) =>
      sanitizeCss(
        css,
        assets !== undefined,
        assets === undefined ? undefined : new Set(assets.blobUrls),
      ),
    );
    resourceBlocked ||= sanitizedCss.some((item) => item.resourceBlocked);
    const css = Object.freeze([FRAME_STYLE, ...sanitizedCss.map((item) => item.css)]);
    const body = frameDocument.createDocumentFragment();
    const pages: PageParts[] = [];
    let overflowWarning: PageWarning | undefined;
    const reportOverflow = () => {
      overflowWarning ??= Object.freeze({
        code: "PAGE_OVERFLOW",
        message: "Content exceeds the usable page area.",
        sourceIdentity: undefined,
      });
    };
    const probeStyles = appendProbeStyles(frameDocument, css);
    const probe = createProbe(frameDocument);
    try {
      const nextPage = (): PageParts => {
        throwIfAborted(signal);
        if (pages.length >= settings.limits.maxPages) {
          throw new ImposiaError("PAGE_LIMIT", "Page limit exceeded.");
        }
        const created = createPage(frameDocument, settings, pages.length + 1);
        resourceBlocked ||= created.resourceBlocked;
        pages.push(created.page);
        probe.append(created.page.page);
        return created.page;
      };

      let currentPage = nextPage();
      for (const node of [...sourceFlow.childNodes]) {
        throwIfAborted(signal);
        const currentHadContent = flowHasContent(currentPage.flow);
        currentPage.flow.append(node);
        if (!pageOverflows(currentPage)) continue;

        if (currentHadContent) {
          node.remove();
          currentPage = nextPage();
          currentPage.flow.append(node);
          if (!pageOverflows(currentPage)) continue;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          currentPage = fragmentText(node as Text, currentPage, nextPage, reportOverflow);
        } else if (node.nodeType === Node.ELEMENT_NODE && !isAtomicElement(node as Element)) {
          currentPage = fragmentElement(node as Element, currentPage, nextPage, reportOverflow);
        } else {
          reportOverflow();
        }
      }

      for (const [index, page] of pages.entries()) {
        resolveDecorationTokens(page.page, index + 1, pages.length);
      }
      body.append(...pages.map((page) => page.page));
    } finally {
      probe.remove();
      for (const style of probeStyles) style.remove();
    }

    const warnings = [...pageWarnings(prepared.warnings)];
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

    return {
      body,
      css,
      pages: Object.freeze(pages.map(({ page, flow }) => ({ page, flow }))),
      warnings: Object.freeze(warnings),
      timings: Object.freeze({
        resourceMs: resourceFinishedAt - resourceStartedAt,
        paginationMs:
          resourceStartedAt - paginationStartedAt + (performance.now() - resourceFinishedAt),
      }),
      blobUrls: assets?.blobUrls ?? Object.freeze([]),
      revoke: assets?.revoke ?? (() => undefined),
    };
  } catch (error: unknown) {
    assets?.revoke();
    throw error;
  }
}

export { bodyText };
