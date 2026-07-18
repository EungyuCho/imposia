import type { DocumentWarning, DocumentWarningCode } from "@imposia/core";

export type RenderInput = { html: string; baseUrl?: string } | { file: string } | { url: string };

export type WarningCode = DocumentWarningCode;

export type RenderWarning = DocumentWarning;

export interface RenderTimings {
  totalMs: number;
  browserStartupMs: number;
  resourceWaitMs: number;
  printPreparationMs: number;
  pdfGenerationMs: number;
}

export interface RenderPage {
  number: number;
  widthPoints: number;
  heightPoints: number;
}

export interface RenderResult {
  pages: RenderPage[];
  pageCount: number;
  pageSize: { widthPoints: number; heightPoints: number };
  warnings: RenderWarning[];
  timings: RenderTimings;
  pdf: Uint8Array;
}

export interface RenderHooks {
  onStart?: () => void | Promise<void>;
  onResourcesReady?: () => void | Promise<void>;
  onPaginated?: (result: Omit<RenderResult, "pdf">) => void | Promise<void>;
  onPdfReady?: (pdf: Uint8Array) => void | Promise<void>;
  onWarning?: (warning: RenderWarning) => void | Promise<void>;
}

export interface RenderOptions extends RenderHooks {
  headerTemplate?: string;
  footerTemplate?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  allowRemoteResources?: boolean;
  allowFileRoot?: string;
}

export interface Renderer {
  render(input: RenderInput, options?: RenderOptions): Promise<RenderResult>;
  close(): Promise<void>;
}
