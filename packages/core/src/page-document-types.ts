export type PageSource =
  | { html: string; baseUrl?: string }
  | { lightDom: Element | DocumentFragment; baseUrl?: string };

export type AssetResolution =
  | { status: "resolved"; bytes: Uint8Array; mimeType: string }
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
  resourceDeadlineMs?: number;
  maxPages?: number;
}

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
  | "RESOURCE_TIMEOUT"
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
