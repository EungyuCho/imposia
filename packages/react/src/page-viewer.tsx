import type {
  EpubExportOptions,
  PageDocument,
  PageDocumentController,
  PageDocumentOptions,
  PageSource,
  PageViewerMode,
  PageViewerOptions,
  PageViewerState,
  PageWarning,
} from "@imposia/client";
import {
  type CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  type ImposiaDocumentCallbacks,
  type ImposiaDocumentState,
  useImposiaDocument,
} from "./use-imposia-document.js";
import { usePageViewerBinding } from "./use-page-viewer-binding.js";

export type ImposiaPageViewerProps = ImposiaDocumentCallbacks & {
  readonly source: PageSource;
  readonly sourceRevision?: string | number;
  readonly documentOptions?: PageDocumentOptions;
  readonly documentOptionsRevision?: string | number;
  readonly viewerOptions?: PageViewerOptions;
  readonly onViewerStateChange?: ((state: PageViewerState) => void) | undefined;
  readonly className?: string;
  readonly style?: CSSProperties;
};

export type ImposiaPageViewerHandle = Readonly<{
  readonly current: PageDocument | undefined;
  readonly viewerState: PageViewerState | undefined;
  goToPage(page: number): void;
  nextPage(): void;
  previousPage(): void;
  setZoom(zoom: number): void;
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
  return new Error("ImposiaPageViewer is not mounted.");
}

function documentUnavailableError(): Error {
  return new Error("ImposiaPageViewer document is not ready.");
}

function inspectorUnavailableError(): Error {
  return new Error("ImposiaPageViewer inspector is not enabled.");
}

export const ImposiaPageViewer = forwardRef<ImposiaPageViewerHandle, ImposiaPageViewerProps>(
  function ImposiaPageViewer(
    {
      source,
      sourceRevision,
      documentOptions,
      documentOptionsRevision,
      viewerOptions,
      onViewerStateChange,
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
    const pendingReadyRef = useRef<PageDocument | undefined>(undefined);
    const pendingReadyStateRef = useRef<ImposiaDocumentState | undefined>(undefined);
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
    const handleDocumentReady = useCallback((pageDocument: PageDocument) => {
      pendingReadyRef.current = pageDocument;
    }, []);
    const handleDocumentStateChange = useCallback((state: ImposiaDocumentState) => {
      if (state.status === "ready") pendingReadyStateRef.current = state;
      else {
        pendingReadyRef.current = undefined;
        pendingReadyStateRef.current = undefined;
        onStateChangeRef.current?.(state);
      }
    }, []);
    const lifecycle = useImposiaDocument({
      source,
      sourceRevision,
      documentOptions,
      documentOptionsRevision,
      onReady: handleDocumentReady,
      onError,
      onStateChange: handleDocumentStateChange,
    });
    const controllerRef = useRef<PageDocumentController | undefined>(undefined);
    const mountedRef = useRef(false);
    controllerRef.current = lifecycle.controller;
    const viewerBinding = usePageViewerBinding(
      lifecycle.hostRef,
      lifecycle.state.document,
      viewerOptions,
      onError,
      onViewerStateChange,
    );

    useEffect(() => {
      const pageDocument = pendingReadyRef.current;
      const viewer = viewerBinding.getViewer();
      if (pageDocument === undefined || viewer?.state.generation !== pageDocument.generation)
        return;
      const readyState = pendingReadyStateRef.current;
      pendingReadyStateRef.current = undefined;
      pendingReadyRef.current = undefined;
      if (readyState !== undefined) {
        onStateChangeRef.current?.(readyState);
      }
      onReadyRef.current?.(pageDocument);
    }, [viewerBinding]);

    useImperativeHandle(ref, () => {
      mountedRef.current = true;
      return {
        get current(): PageDocument | undefined {
          return mountedRef.current ? controllerRef.current?.current : undefined;
        },
        get viewerState(): PageViewerState | undefined {
          return mountedRef.current ? viewerBinding.getViewer()?.state : undefined;
        },
        goToPage(page: number): void {
          if (!mountedRef.current) throw handleUnavailableError();
          const viewer = viewerBinding.getViewer();
          if (viewer === undefined) throw documentUnavailableError();
          viewer.goToPage(page);
        },
        nextPage(): void {
          if (!mountedRef.current) throw handleUnavailableError();
          const viewer = viewerBinding.getViewer();
          if (viewer === undefined) throw documentUnavailableError();
          viewer.nextPage();
        },
        previousPage(): void {
          if (!mountedRef.current) throw handleUnavailableError();
          const viewer = viewerBinding.getViewer();
          if (viewer === undefined) throw documentUnavailableError();
          viewer.previousPage();
        },
        setZoom(zoom: number): void {
          if (!mountedRef.current) throw handleUnavailableError();
          const viewer = viewerBinding.getViewer();
          if (viewer === undefined) throw documentUnavailableError();
          viewer.setZoom(zoom);
        },
        setMode(mode: PageViewerMode): void {
          if (!mountedRef.current) throw handleUnavailableError();
          const viewer = viewerBinding.getViewer();
          if (viewer === undefined) throw documentUnavailableError();
          viewer.setMode(mode);
        },
        setSpreadCover(cover: boolean): void {
          if (!mountedRef.current) throw handleUnavailableError();
          const viewer = viewerBinding.getViewer();
          if (viewer === undefined) throw documentUnavailableError();
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
          if (controller === undefined) return Promise.reject(documentUnavailableError());
          return controller.print();
        },
        exportEpub(options: EpubExportOptions): Promise<Blob> {
          if (!mountedRef.current) return Promise.reject(handleUnavailableError());
          const pageDocument = controllerRef.current?.current;
          if (pageDocument === undefined) return Promise.reject(documentUnavailableError());
          return pageDocument.exportEpub(options);
        },
      };
    }, [viewerBinding]);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        controllerRef.current = undefined;
        pendingReadyRef.current = undefined;
        pendingReadyStateRef.current = undefined;
      };
    }, []);

    const state: ImposiaDocumentState =
      viewerBinding.error === undefined
        ? lifecycle.state
        : { status: "error", error: viewerBinding.error };
    const document: PageDocument | undefined = lifecycle.state.document;
    return (
      <div
        ref={lifecycle.hostRef}
        className={className}
        style={style}
        data-imposia-react-status={state.status}
        data-imposia-generation={document?.generation}
        aria-busy={state.status === "loading" ? "true" : "false"}
        aria-invalid={state.status === "error" ? "true" : undefined}
      />
    );
  },
);
