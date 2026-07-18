import { prepareDocument } from "./document.js";
import { ImposiaError } from "./errors.js";
import { type ResolvedPageAssets, resolvePageAssets } from "./page-document-assets.js";
import { FRAME_STYLE } from "./page-document-frame.js";
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
  flow: HTMLElement;
  page: HTMLElement;
  warnings: readonly PageWarning[];
  blobUrls: readonly string[];
  revoke(): void;
}

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

export async function buildGeneration(
  frameDocument: Document,
  source: PageSource,
  settings: PageGenerationSettings,
  signal: AbortSignal,
): Promise<BuiltGeneration> {
  const html = sourceHtml(source);
  ensureInputLimit(html, settings.limits);
  const prepared = prepareDocument(html, {
    ...(settings.headerTemplate === undefined ? {} : { headerTemplate: settings.headerTemplate }),
    ...(settings.footerTemplate === undefined ? {} : { footerTemplate: settings.footerTemplate }),
    ...(settings.assetResolver === undefined ? {} : { allowRemoteResources: true }),
  });
  let assets: ResolvedPageAssets | undefined;
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

  const preparedSource = copyPreparedBody(
    frameDocument,
    assets?.html ?? prepared.html,
    assets !== undefined,
    assets === undefined ? undefined : new Set(assets.blobUrls),
  );
  flow.append(preparedSource.fragment);
  const nodeCount = flow.querySelectorAll("*").length;
  if (nodeCount > settings.limits.maxNodes) {
    assets?.revoke();
    throw new ImposiaError("NODE_LIMIT", "Page node limit exceeded.");
  }
  let resourceBlocked =
    preparedSource.resourceBlocked ||
    sanitizeFrameContent(
      flow,
      assets !== undefined,
      assets === undefined ? undefined : new Set(assets.blobUrls),
    );
  resourceBlocked ||= assets?.resourceBlocked ?? false;
  const headerResourceBlocked = appendDecoration(frameDocument, header, prepared.headerTemplate);
  const footerResourceBlocked = appendDecoration(frameDocument, footer, prepared.footerTemplate);
  resourceBlocked ||= headerResourceBlocked || footerResourceBlocked;
  content.append(flow);
  page.append(header, content, footer);
  resolveDecorationTokens(page, 1, 1);
  body.append(page);
  if (1 > settings.limits.maxPages) {
    assets?.revoke();
    throw new ImposiaError("PAGE_LIMIT", "Page limit exceeded.");
  }

  const sanitizedCss = (assets?.css ?? settings.css).map((css) =>
    sanitizeCss(
      css,
      assets !== undefined,
      assets === undefined ? undefined : new Set(assets.blobUrls),
    ),
  );
  resourceBlocked ||= sanitizedCss.some((item) => item.resourceBlocked);
  const warnings = [...pageWarnings(prepared.warnings)];
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
    css: Object.freeze([FRAME_STYLE, ...sanitizedCss.map((item) => item.css)]),
    flow,
    page,
    warnings: Object.freeze(warnings),
    blobUrls: assets?.blobUrls ?? Object.freeze([]),
    revoke: assets?.revoke ?? (() => undefined),
  };
}

export { bodyText };
