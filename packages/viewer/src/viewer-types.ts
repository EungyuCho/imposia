import type {
  PageWarning,
  PublicationController,
  PublicationDestination,
  PublicationSearchResult,
} from "@imposia/core";
import type { ViewerTheme } from "./viewer-theme.js";

export type ViewerMode = "continuous" | "single";
export type PageViewerMode = ViewerMode | "spread";

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
  setTheme(theme?: ViewerTheme): void;
  destroy(): void;
  readonly state: ViewerState;
}

export interface ViewerOptions {
  mode?: ViewerMode;
  zoom?: number;
  workerSrc?: string;
  theme?: ViewerTheme;
}

export interface PageViewerOptions {
  mode?: PageViewerMode;
  spread?: Readonly<{ cover?: boolean }>;
  zoom?: number;
  controls?: boolean;
  theme?: ViewerTheme;
  inspector?: boolean;
  reader?: PublicationReaderOptions;
}

export interface ViewerInspectorState {
  open: boolean;
  warnings: readonly PageWarning[];
  selected: PageWarning | undefined;
}

export interface ViewerInspectorController {
  open(): void;
  close(): void;
  toggle(): void;
  select(warning: PageWarning): void;
  readonly state: ViewerInspectorState;
}

export interface PublicationReaderOptions {
  controller: PublicationController;
  initialDeepLink?: string;
  onDeepLinkChange?: (value: string | undefined) => void;
}

export interface PublicationThumbnail {
  readonly page: number;
  readonly generation: number;
  readonly widthCssPx: number;
  readonly heightCssPx: number;
  readonly previewLineCount: number;
}

export interface PublicationReaderState {
  tocOpen: boolean;
  thumbnailsOpen: boolean;
  thumbnails: readonly PublicationThumbnail[];
  destination: PublicationDestination | undefined;
  deepLink: string | undefined;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: readonly PublicationSearchResult[];
  searchResultIndex: number | undefined;
}

export interface PublicationReaderController {
  openTableOfContents(): void;
  closeTableOfContents(): void;
  toggleTableOfContents(): void;
  openThumbnails(): void;
  closeThumbnails(): void;
  toggleThumbnails(): void;
  selectThumbnail(thumbnail: PublicationThumbnail): void;
  openSearch(): void;
  closeSearch(): void;
  toggleSearch(): void;
  search(query: string): readonly PublicationSearchResult[];
  nextSearchResult(): PublicationSearchResult | undefined;
  previousSearchResult(): PublicationSearchResult | undefined;
  selectSearchResult(result: PublicationSearchResult): void;
  navigate(destination: PublicationDestination): void;
  restoreDeepLink(value: string): PublicationDestination | undefined;
  readonly state: PublicationReaderState;
}

export interface PageViewerState {
  page: number;
  pageCount: number;
  zoom: number;
  mode: PageViewerMode;
  effectiveMode: PageViewerMode;
  status: "ready";
  generation: number;
}

export interface PageViewerController {
  goToPage(page: number): void;
  nextPage(): void;
  previousPage(): void;
  setZoom(zoom: number): void;
  setMode(mode: PageViewerMode): void;
  setSpreadCover(cover: boolean): void;
  setTheme(theme?: ViewerTheme): void;
  subscribe(listener: (state: PageViewerState) => void): () => void;
  refresh(pageDocument: import("@imposia/core").PageDocument): void;
  print(): Promise<void>;
  destroy(): void;
  readonly state: PageViewerState;
  readonly reader: PublicationReaderController | undefined;
  readonly inspector: ViewerInspectorController | undefined;
}
