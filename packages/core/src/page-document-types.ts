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

export interface PageLimits {
  maxInputBytes?: number;
  maxNodes?: number;
  maxAssetBytes?: number;
  maxAssetDepth?: number;
  maxAssetReferences?: number;
  resourceDeadlineMs?: number;
  maxPages?: number;
}

export const DEFAULT_PAGE_LIMITS = Object.freeze({
  maxInputBytes: 5 * 1024 * 1024,
  maxNodes: 100_000,
  maxAssetBytes: 25 * 1024 * 1024,
  maxAssetDepth: 8,
  maxAssetReferences: 512,
  resourceDeadlineMs: 30_000,
  maxPages: 10_000,
});

export type EffectivePageLimits = Readonly<{
  [Key in keyof typeof DEFAULT_PAGE_LIMITS]: number;
}>;

export interface PageDocumentOptions {
  css?: readonly string[];
  assetResolver?: AssetResolver;
  page?: { size?: "A4"; margin?: "20mm" };
  limits?: PageLimits;
  headerTemplate?: string;
  footerTemplate?: string;
  decorateBlankPages?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: { completedPages: number }) => void;
}

export type PageWarningCode =
  | "PAGE_OVERFLOW"
  | "RESOURCE_BLOCKED"
  | "UNSUPPORTED_LAYOUT"
  | "UNSUPPORTED_DECORATION_TOKEN"
  | "AVOID_RELAXED";

export interface PageMetadata {
  readonly number: number;
  readonly side: "left" | "right";
  readonly blank: boolean;
  readonly widthCssPx: number;
  readonly heightCssPx: number;
  readonly bodyText: readonly string[];
}

export interface PageWarning {
  readonly code: PageWarningCode;
  readonly message: string;
  readonly sourceIdentity: string | undefined;
}

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
}

export interface PageDocumentController {
  readonly ready: Promise<PageDocument>;
  readonly current: PageDocument | undefined;
  update(source: PageSource, options?: { signal?: AbortSignal }): Promise<PageDocument>;
  print(): Promise<void>;
  destroy(): Promise<void>;
}
