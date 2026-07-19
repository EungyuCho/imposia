import type {
  EpubExportOptions,
  PageViewerMode,
  PageViewerOptions,
  PageWarning,
  PublicationController,
  PublicationDestination,
  PublicationDocument,
  PublicationOptions,
  PublicationReaderOptions,
  PublicationSearchResult,
  PublicationSnapshot,
  PublicationThumbnail,
} from "@imposia/client";
import {
  type CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  type ImposiaPublicationCallbacks,
  type ImposiaPublicationState,
  useImposiaPublication,
} from "./use-imposia-publication.js";
import { usePageViewerBinding } from "./use-page-viewer-binding.js";

export type ImposiaPublicationViewerProps = ImposiaPublicationCallbacks & {
  readonly snapshot: PublicationSnapshot;
  readonly snapshotRevision?: string | number;
  readonly publicationOptions?: PublicationOptions;
  readonly publicationOptionsRevision?: string | number;
  readonly viewerOptions?: Omit<PageViewerOptions, "reader">;
  readonly readerOptions?: Omit<PublicationReaderOptions, "controller">;
  readonly className?: string;
  readonly style?: CSSProperties;
};

export type ImposiaPublicationViewerHandle = Readonly<{
  readonly current: PublicationDocument | undefined;
  resolveDestination(id: string): PublicationDestination | undefined;
  navigate(destination: PublicationDestination): void;
  openTableOfContents(): void;
  closeTableOfContents(): void;
  toggleTableOfContents(): void;
  openThumbnails(): void;
  closeThumbnails(): void;
  toggleThumbnails(): void;
  getThumbnails(): readonly PublicationThumbnail[];
  selectThumbnail(thumbnail: PublicationThumbnail): void;
  restoreDeepLink(value: string): PublicationDestination | undefined;
  openSearch(): void;
  closeSearch(): void;
  toggleSearch(): void;
  search(query: string): readonly PublicationSearchResult[];
  nextSearchResult(): PublicationSearchResult | undefined;
  previousSearchResult(): PublicationSearchResult | undefined;
  selectSearchResult(result: PublicationSearchResult): void;
  setMode(mode: PageViewerMode): void;
  setSpreadCover(cover: boolean): void;
  openInspector(): void;
  closeInspector(): void;
  toggleInspector(): void;
  selectWarning(warning: PageWarning): void;
  print(): Promise<void>;
  exportEpub(options: EpubExportOptions): Promise<Blob>;
}>;

function handleUnavailableError(): Error {
  return new Error("ImposiaPublicationViewer is not mounted.");
}

function publicationUnavailableError(): Error {
  return new Error("ImposiaPublicationViewer publication is not ready.");
}

function inspectorUnavailableError(): Error {
  return new Error("ImposiaPublicationViewer inspector is not enabled.");
}

export const ImposiaPublicationViewer = forwardRef<
  ImposiaPublicationViewerHandle,
  ImposiaPublicationViewerProps
>(function ImposiaPublicationViewer(
  {
    snapshot,
    snapshotRevision,
    publicationOptions,
    publicationOptionsRevision,
    viewerOptions,
    readerOptions,
    className,
    style,
    onReady,
    onError,
    onStateChange,
  },
  ref,
) {
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  const pendingReadyRef = useRef<PublicationDocument | undefined>(undefined);
  const pendingReadyStateRef = useRef<ImposiaPublicationState | undefined>(undefined);
  const readerOptionsRef = useRef(readerOptions);
  onReadyRef.current = onReady;
  onStateChangeRef.current = onStateChange;
  readerOptionsRef.current = readerOptions;
  const handlePublicationReady = useCallback((publication: PublicationDocument) => {
    pendingReadyRef.current = publication;
  }, []);
  const handlePublicationStateChange = useCallback((state: ImposiaPublicationState) => {
    if (state.status === "ready") pendingReadyStateRef.current = state;
    else {
      pendingReadyStateRef.current = undefined;
      onStateChangeRef.current?.(state);
    }
  }, []);
  const lifecycle = useImposiaPublication({
    snapshot,
    snapshotRevision,
    publicationOptions,
    publicationOptionsRevision,
    onReady: handlePublicationReady,
    onError,
    onStateChange: handlePublicationStateChange,
  });
  const controllerRef = useRef<PublicationController | undefined>(undefined);
  const mountedRef = useRef(false);
  controllerRef.current = lifecycle.controller;
  const handleDeepLinkChange = useCallback((value: string | undefined) => {
    readerOptionsRef.current?.onDeepLinkChange?.(value);
  }, []);
  const boundViewerOptions = useMemo<PageViewerOptions | undefined>(() => {
    const controller = lifecycle.controller;
    if (controller === undefined) return viewerOptions;
    return {
      ...viewerOptions,
      reader: {
        controller,
        ...(readerOptions?.initialDeepLink === undefined
          ? {}
          : { initialDeepLink: readerOptions.initialDeepLink }),
        onDeepLinkChange: handleDeepLinkChange,
      },
    };
  }, [handleDeepLinkChange, lifecycle.controller, readerOptions?.initialDeepLink, viewerOptions]);
  const viewerBinding = usePageViewerBinding(
    lifecycle.hostRef,
    lifecycle.state.publication,
    boundViewerOptions,
    onError,
  );

  useEffect(() => {
    const reader = viewerBinding.getViewer()?.reader;
    if (reader === undefined) return;
    const readyState = pendingReadyStateRef.current;
    if (readyState !== undefined) {
      pendingReadyStateRef.current = undefined;
      onStateChangeRef.current?.(readyState);
    }
    const publication = pendingReadyRef.current;
    if (publication === undefined) return;
    pendingReadyRef.current = undefined;
    onReadyRef.current?.(publication);
  }, [viewerBinding]);

  useImperativeHandle(ref, () => {
    mountedRef.current = true;
    return {
      get current(): PublicationDocument | undefined {
        return mountedRef.current ? controllerRef.current?.current : undefined;
      },
      resolveDestination(id: string): PublicationDestination | undefined {
        return mountedRef.current ? controllerRef.current?.resolveDestination(id) : undefined;
      },
      navigate(destination: PublicationDestination): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.navigate(destination);
      },
      openTableOfContents(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.openTableOfContents();
      },
      closeTableOfContents(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.closeTableOfContents();
      },
      toggleTableOfContents(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.toggleTableOfContents();
      },
      openThumbnails(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.openThumbnails();
      },
      closeThumbnails(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.closeThumbnails();
      },
      toggleThumbnails(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.toggleThumbnails();
      },
      getThumbnails(): readonly PublicationThumbnail[] {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        return reader.state.thumbnails;
      },
      selectThumbnail(thumbnail: PublicationThumbnail): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.selectThumbnail(thumbnail);
      },
      restoreDeepLink(value: string): PublicationDestination | undefined {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        return reader.restoreDeepLink(value);
      },
      openSearch(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.openSearch();
      },
      closeSearch(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.closeSearch();
      },
      toggleSearch(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.toggleSearch();
      },
      search(query: string): readonly PublicationSearchResult[] {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        return reader.search(query);
      },
      nextSearchResult(): PublicationSearchResult | undefined {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        return reader.nextSearchResult();
      },
      previousSearchResult(): PublicationSearchResult | undefined {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        return reader.previousSearchResult();
      },
      selectSearchResult(result: PublicationSearchResult): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const reader = viewerBinding.getViewer()?.reader;
        if (reader === undefined) throw publicationUnavailableError();
        reader.selectSearchResult(result);
      },
      setMode(mode: PageViewerMode): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const viewer = viewerBinding.getViewer();
        if (viewer === undefined) throw publicationUnavailableError();
        viewer.setMode(mode);
      },
      setSpreadCover(cover: boolean): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const viewer = viewerBinding.getViewer();
        if (viewer === undefined) throw publicationUnavailableError();
        viewer.setSpreadCover(cover);
      },
      openInspector(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const inspector = viewerBinding.getViewer()?.inspector;
        if (inspector === undefined) throw inspectorUnavailableError();
        inspector.open();
      },
      closeInspector(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const inspector = viewerBinding.getViewer()?.inspector;
        if (inspector === undefined) throw inspectorUnavailableError();
        inspector.close();
      },
      toggleInspector(): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const inspector = viewerBinding.getViewer()?.inspector;
        if (inspector === undefined) throw inspectorUnavailableError();
        inspector.toggle();
      },
      selectWarning(warning: PageWarning): void {
        if (!mountedRef.current) throw handleUnavailableError();
        const inspector = viewerBinding.getViewer()?.inspector;
        if (inspector === undefined) throw inspectorUnavailableError();
        inspector.select(warning);
      },
      print(): Promise<void> {
        if (!mountedRef.current) return Promise.reject(handleUnavailableError());
        const controller = controllerRef.current;
        if (controller === undefined) return Promise.reject(publicationUnavailableError());
        return controller.print();
      },
      exportEpub(options: EpubExportOptions): Promise<Blob> {
        if (!mountedRef.current) return Promise.reject(handleUnavailableError());
        const publication = controllerRef.current?.current;
        if (publication === undefined) return Promise.reject(publicationUnavailableError());
        return publication.exportEpub(options);
      },
    };
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current = undefined;
      pendingReadyStateRef.current = undefined;
    };
  }, []);

  const state: ImposiaPublicationState =
    viewerBinding.error === undefined
      ? lifecycle.state
      : { status: "error", error: viewerBinding.error };
  const publication = lifecycle.state.publication;
  return (
    <div
      ref={lifecycle.hostRef}
      className={className}
      style={style}
      data-imposia-react-status={state.status}
      data-imposia-generation={publication?.generation}
      aria-busy={state.status === "loading" ? "true" : "false"}
      aria-invalid={state.status === "error" ? "true" : undefined}
    />
  );
});
