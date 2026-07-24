export type PageSource =
  | { html: string; baseUrl?: string }
  | { lightDom: Element | DocumentFragment; baseUrl?: string };

export type AssetResolution =
  | {
      status: "resolved";
      bytes: Uint8Array;
      mimeType: string;
      resolvedUrl?: string;
    }
  | { status: "blocked"; reason?: string };

export type AssetResolver = (request: {
  url: string;
  kind: "font" | "image" | "media" | "stylesheet";
  baseUrl?: string;
  signal: AbortSignal;
}) => Promise<AssetResolution>;

export type PageExtensionWarningCode = `EXTENSION_${string}`;

export interface PageExtensionWarning {
  readonly code: PageExtensionWarningCode;
  readonly message: string;
}

export interface PageExtensionTransformInput {
  readonly html: string;
  readonly css: readonly string[];
  readonly baseUrl: string | undefined;
}

export interface PageExtensionTransformOutput {
  readonly html?: string;
  readonly css?: readonly string[];
}

export interface PageExtensionPublicationMetadata {
  readonly title: string;
  readonly language: string | undefined;
  readonly identifier: string | undefined;
  readonly entryCount: number;
}

export interface PageExtensionEntryMetadata {
  readonly id: string;
  readonly title: string;
  readonly index: number;
  readonly totalEntries: number;
  readonly baseUrl: string | undefined;
}

export interface PageExtensionEntryTransformInput {
  readonly html: string;
  readonly css: readonly string[];
  readonly publication: PageExtensionPublicationMetadata;
  readonly entry: PageExtensionEntryMetadata;
}

export interface PageExtensionAssetRequest {
  readonly url: string;
  readonly kind: "font" | "image" | "media" | "stylesheet";
  readonly baseUrl: string | undefined;
  readonly depth: number;
  readonly sourceIdentity: string;
}

export interface PageExtensionPage {
  readonly number: number;
  readonly totalPages: number;
  readonly side: "left" | "right";
  readonly blank: boolean;
}

export interface PageExtensionDecoration {
  readonly headerHtml?: string;
  readonly footerHtml?: string;
}

export interface PageExtensionTableFragment {
  readonly origin: Element;
  readonly fragment: Element;
  readonly index: number;
}

export interface PageExtensionFinalizePageInput {
  readonly number: number;
  readonly totalPages: number;
  readonly side: "left" | "right";
  readonly blank: boolean;
  readonly element: HTMLElement;
  readonly tableFragments: readonly PageExtensionTableFragment[];
}

export interface PageExtensionContext {
  readonly signal: AbortSignal;
  warn(warning: PageExtensionWarning): void;
  onCleanup(cleanup: () => void): void;
}

export interface PageExtension {
  readonly name: string;
  transform?(
    input: PageExtensionTransformInput,
    context: PageExtensionContext,
  ): PageExtensionTransformOutput | undefined | Promise<PageExtensionTransformOutput | undefined>;
  allowAsset?(request: PageExtensionAssetRequest, context: PageExtensionContext): boolean;
  decoratePage?(
    page: PageExtensionPage,
    context: PageExtensionContext,
  ): PageExtensionDecoration | undefined;
  /**
   * Mutates an accepted live page before commit. Runs for every allocated page,
   * including intentionally inserted blank pages, regardless of `decorateBlankPages`.
   */
  finalizePage?(page: PageExtensionFinalizePageInput, context: PageExtensionContext): void;
}

export interface PublicationExtension {
  readonly name: string;
  transformEntry?(
    input: PageExtensionEntryTransformInput,
    context: PageExtensionContext,
  ): PageExtensionTransformOutput | undefined | Promise<PageExtensionTransformOutput | undefined>;
  allowAsset?(request: PageExtensionAssetRequest, context: PageExtensionContext): boolean;
  decoratePage?(
    page: PageExtensionPage,
    context: PageExtensionContext,
  ): PageExtensionDecoration | undefined;
  /**
   * Mutates an accepted live page before commit. Runs for every allocated page,
   * including intentionally inserted blank pages, regardless of `decorateBlankPages`.
   */
  finalizePage?(page: PageExtensionFinalizePageInput, context: PageExtensionContext): void;
}

export type PageSize = "A4" | "Letter" | { readonly width: string; readonly height: string };

export type PageOrientation = "portrait" | "landscape";

export interface PageMarginEdges {
  readonly top: string;
  readonly right: string;
  readonly bottom: string;
  readonly left: string;
}

export type PageMargin = string | PageMarginEdges;

export interface PageOptions {
  readonly size?: PageSize;
  readonly orientation?: PageOrientation;
  readonly margin?: PageMargin;
}

export interface PageMargins {
  readonly topCssPx: number;
  readonly rightCssPx: number;
  readonly bottomCssPx: number;
  readonly leftCssPx: number;
}

export interface PageGeometry {
  readonly sheetWidthCssPx: number;
  readonly sheetHeightCssPx: number;
  readonly margins: PageMargins;
  readonly contentWidthCssPx: number;
  readonly contentHeightCssPx: number;
}

export interface PageContext {
  readonly side: "left" | "right";
  readonly name: string | undefined;
  readonly blank: boolean;
}

export interface ExperimentalPageFeatures {
  readonly footnotes?: boolean;
  readonly pageFloats?: boolean;
}

export interface EpubMetadata {
  readonly title: string;
  readonly language: string;
  readonly identifier: string;
  readonly modified?: string;
}

export interface EpubExportLimits {
  readonly maxEntries?: number;
  readonly maxBytes?: number;
}

export interface EpubExportOptions {
  readonly metadata: EpubMetadata;
  readonly signal?: AbortSignal;
  readonly limits?: EpubExportLimits;
}

export interface PageLimits {
  maxInputBytes?: number;
  maxNodes?: number;
  maxAssetBytes?: number;
  maxAssetDepth?: number;
  maxAssetReferences?: number;
  resourceDeadlineMs?: number;
  maxPages?: number;
  maxLayoutPasses?: number;
  maxGeneratedFragments?: number;
  maxGeneratedRecords?: number;
}

export const DEFAULT_PAGE_LIMITS = Object.freeze({
  maxInputBytes: 5 * 1024 * 1024,
  maxNodes: 100_000,
  maxAssetBytes: 25 * 1024 * 1024,
  maxAssetDepth: 8,
  maxAssetReferences: 512,
  resourceDeadlineMs: 30_000,
  maxPages: 10_000,
  maxLayoutPasses: 8,
  maxGeneratedFragments: 400_000,
  maxGeneratedRecords: 10_000,
});

export type EffectivePageLimits = Readonly<{
  [Key in keyof typeof DEFAULT_PAGE_LIMITS]: number;
}>;

export interface PageComposeOptions {
  yieldBudgetMs?: number;
  scheduler?: () => Promise<void>;
}

export interface PageComposeProgress {
  readonly completedPages: number;
  readonly pass: number;
  readonly provisional: true;
}

export interface PageDocumentOptions {
  css?: readonly string[];
  assetResolver?: AssetResolver;
  page?: PageOptions;
  limits?: PageLimits;
  headerTemplate?: string;
  footerTemplate?: string;
  decorateBlankPages?: boolean;
  experimental?: ExperimentalPageFeatures;
  extensions?: readonly (PageExtension | PublicationExtension)[];
  compose?: PageComposeOptions;
  signal?: AbortSignal;
  onProgress?: (progress: PageComposeProgress) => void;
}

export type CorePageWarningCode =
  | "PAGE_OVERFLOW"
  | "RESOURCE_BLOCKED"
  | "UNSUPPORTED_LAYOUT"
  | "UNSUPPORTED_DECORATION_TOKEN"
  | "PAGE_RULE_UNSUPPORTED"
  | "BREAK_CONSTRAINT_RELAXED"
  | "WIDOW_ORPHAN_RELAXED"
  | "WIDOW_ORPHAN_FALLBACK"
  | "HYPHENATION_FALLBACK"
  | "UNBREAKABLE_CONTENT"
  | "UNSUPPORTED_FRAGMENTATION_CONTEXT"
  | "REFERENCE_MISSING"
  | "REFERENCE_DUPLICATE"
  | "LAYOUT_NON_CONVERGENT"
  | "FOOTNOTE_DEFERRED"
  | "PAGE_FLOAT_FALLBACK"
  | "EPUB_RESOURCE_OMITTED"
  | "AVOID_RELAXED";

export type PageWarningCode = CorePageWarningCode | PageExtensionWarningCode;

export interface PageMetadata {
  readonly number: number;
  readonly side: "left" | "right";
  readonly name: string | undefined;
  readonly blank: boolean;
  readonly context: PageContext;
  readonly geometry: PageGeometry;
  readonly widthCssPx: number;
  readonly heightCssPx: number;
  readonly bodyText: readonly string[];
}

export interface PageWarningLocation {
  readonly generation: number | undefined;
  readonly entryId: string | undefined;
  readonly page: number | undefined;
}

export const UNLOCATED_PAGE_WARNING_LOCATION: PageWarningLocation = Object.freeze({
  generation: undefined,
  entryId: undefined,
  page: undefined,
});

export interface CorePageWarning {
  readonly code: CorePageWarningCode;
  readonly message: string;
  readonly sourceIdentity: string | undefined;
  readonly location: PageWarningLocation;
  readonly property?: string;
  readonly value?: string;
  readonly recovery?: string;
}

export interface ExtensionPageWarning {
  readonly code: PageExtensionWarningCode;
  readonly message: string;
  readonly sourceIdentity: undefined;
  readonly location: PageWarningLocation;
  readonly extension: string;
}

export type PageWarning = CorePageWarning | ExtensionPageWarning;

export interface PageTimings {
  readonly totalMs: number;
  readonly resourceMs: number;
  readonly paginationMs: number;
}

export interface PageDocument {
  readonly iframe: HTMLIFrameElement;
  readonly generation: number;
  readonly pageCount: number;
  readonly pages: readonly PageMetadata[];
  readonly warnings: readonly PageWarning[];
  readonly timings: PageTimings;
  exportEpub(options: EpubExportOptions): Promise<Blob>;
}

export interface PageDocumentController {
  readonly ready: Promise<PageDocument>;
  readonly current: PageDocument | undefined;
  update(source: PageSource, options?: { signal?: AbortSignal }): Promise<PageDocument>;
  print(): Promise<void>;
  destroy(): Promise<void>;
}
