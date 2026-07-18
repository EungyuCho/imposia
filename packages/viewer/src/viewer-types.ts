export type ViewerMode = "continuous" | "single";

export type ViewerSource = Uint8Array | ArrayBuffer | string | { pdf: Uint8Array };

export interface ViewerState {
  page: number;
  pageCount: number;
  zoom: number;
  mode: ViewerMode;
  status: "loading" | "ready" | "error";
  error?: string;
}

export interface ViewerController {
  goToPage(page: number): void;
  nextPage(): void;
  previousPage(): void;
  setZoom(zoom: number): void;
  setMode(mode: ViewerMode): void;
  destroy(): void;
  readonly state: ViewerState;
}

export interface ViewerOptions {
  mode?: ViewerMode;
  zoom?: number;
  workerSrc?: string;
}

export interface PageViewerOptions {
  mode?: ViewerMode;
  zoom?: number;
}

export interface PageViewerState {
  page: number;
  pageCount: number;
  zoom: number;
  mode: ViewerMode;
  status: "ready";
  generation: number;
}

export interface PageViewerController {
  goToPage(page: number): void;
  nextPage(): void;
  previousPage(): void;
  setZoom(zoom: number): void;
  setMode(mode: ViewerMode): void;
  refresh(pageDocument: import("@imposia/core").PageDocument): void;
  print(): Promise<void>;
  destroy(): void;
  readonly state: PageViewerState;
}
