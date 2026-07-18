import { FRAME_STYLE } from "./page-document-frame.js";
import {
  appendDecoration,
  bodyText,
  copyPreparedBody,
  ensureInputLimit,
  pageWarnings,
  prepareDocument,
  resolveDecorationTokens,
  sanitizeCss,
  sanitizeFrameContent,
  sourceHtml,
} from "./page-document-sanitize.js";
import type {
  PageDocumentOptions,
  PageLimits,
  PageSource,
  PageWarning,
} from "./page-document-types.js";

export interface PageGenerationSettings {
  css: readonly string[];
  headerTemplate?: string;
  footerTemplate?: string;
  page?: { size?: "A4"; margin?: "20mm" };
  limits?: PageLimits;
  onProgress?: (progress: { completedPages: number }) => void;
}

export interface BuiltGeneration {
  body: DocumentFragment;
  css: readonly string[];
  flow: HTMLElement;
  page: HTMLElement;
  warnings: readonly PageWarning[];
}

const UNSUPPORTED_LIMITS: readonly (keyof PageLimits)[] = [
  "maxNodes",
  "maxAssetBytes",
  "maxAssetDepth",
  "resourceDeadlineMs",
  "maxPages",
];

export function snapshotSettings(options: PageDocumentOptions): PageGenerationSettings {
  if (options.assetResolver !== undefined) {
    throw new Error(
      "Asset resolver support is not implemented in the browser vertical slice; resources are blocked.",
    );
  }
  const unsupportedLimit = UNSUPPORTED_LIMITS.find((key) => options.limits?.[key] !== undefined);
  if (unsupportedLimit !== undefined) {
    throw new Error(`${unsupportedLimit} is not implemented in the browser vertical slice.`);
  }
  const maxInputBytes = options.limits?.maxInputBytes;
  if (maxInputBytes !== undefined && (!Number.isFinite(maxInputBytes) || maxInputBytes <= 0)) {
    throw new Error("maxInputBytes must be a finite positive number.");
  }
  if (options.decorateBlankPages !== undefined) {
    throw new Error("decorateBlankPages is not implemented in the browser vertical slice.");
  }
  return {
    css: Object.freeze([...(options.css ?? [])]),
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
    ...(options.limits === undefined ? {} : { limits: { ...options.limits } }),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
  };
}

export function buildGeneration(
  frameDocument: Document,
  source: PageSource,
  settings: PageGenerationSettings,
): BuiltGeneration {
  const html = sourceHtml(source);
  ensureInputLimit(html, settings.limits);
  const prepared = prepareDocument(html, {
    ...(settings.headerTemplate === undefined ? {} : { headerTemplate: settings.headerTemplate }),
    ...(settings.footerTemplate === undefined ? {} : { footerTemplate: settings.footerTemplate }),
  });
  const body = frameDocument.createDocumentFragment();
  const page = frameDocument.createElement("section");
  page.setAttribute("data-imposia-page", "");
  page.setAttribute("data-imposia-page-number", "1");
  page.setAttribute("data-imposia-page-side", "right");
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

  const preparedSource = copyPreparedBody(frameDocument, prepared.html);
  flow.append(preparedSource.fragment);
  let resourceBlocked = preparedSource.resourceBlocked || sanitizeFrameContent(flow);
  const headerResourceBlocked = appendDecoration(frameDocument, header, prepared.headerTemplate);
  const footerResourceBlocked = appendDecoration(frameDocument, footer, prepared.footerTemplate);
  resourceBlocked ||= headerResourceBlocked || footerResourceBlocked;
  content.append(flow);
  page.append(header, content, footer);
  resolveDecorationTokens(page, 1, 1);
  body.append(page);

  const sanitizedCss = settings.css.map((css) => sanitizeCss(css));
  resourceBlocked ||= sanitizedCss.some((item) => item.resourceBlocked);
  const warnings = [...pageWarnings(prepared.warnings)];
  if (resourceBlocked && !warnings.some((warning) => warning.code === "RESOURCE_BLOCKED")) {
    warnings.push(
      Object.freeze({
        code: "RESOURCE_BLOCKED",
        message: "Resource loading is disabled in the current browser vertical slice.",
        sourceIdentity: undefined,
      }),
    );
  }

  return {
    body,
    css: Object.freeze([FRAME_STYLE, ...sanitizedCss.map((item) => item.css)]),
    flow,
    page,
    warnings: Object.freeze(warnings),
  };
}

export { bodyText };
