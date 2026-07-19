import {
  type EpubExportOptions,
  mountPageViewer,
  type PageDocument,
  type PageDocumentController,
  type PageDocumentOptions,
  type PageSource,
  type PageViewerOptions,
} from "@imposia/client";
import {
  type CSSProperties,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  type ImposiaDocumentCallbacks,
  type ImposiaDocumentState,
  useImposiaDocument,
} from "./use-imposia-document.js";

export type ImposiaPageViewerProps = ImposiaDocumentCallbacks & {
  readonly source: PageSource;
  readonly sourceRevision?: string | number;
  readonly documentOptions?: PageDocumentOptions;
  readonly viewerOptions?: PageViewerOptions;
  readonly className?: string;
  readonly style?: CSSProperties;
};

export type ImposiaPageViewerHandle = Readonly<{
  readonly current: PageDocument | undefined;
  print(): Promise<void>;
  exportEpub(options: EpubExportOptions): Promise<Blob>;
}>;

function handleUnavailableError(): Error {
  return new Error("ImposiaPageViewer is not mounted.");
}

function documentUnavailableError(): Error {
  return new Error("ImposiaPageViewer document is not ready.");
}

function sameViewerOptions(
  left: PageViewerOptions | undefined,
  right: PageViewerOptions | undefined,
): boolean {
  return left?.mode === right?.mode && left?.zoom === right?.zoom;
}

export const ImposiaPageViewer = forwardRef<ImposiaPageViewerHandle, ImposiaPageViewerProps>(
  function ImposiaPageViewer(
    {
      source,
      sourceRevision,
      documentOptions,
      viewerOptions,
      className,
      style,
      onReady,
      onError,
      onStateChange,
    },
    ref,
  ) {
    const lifecycle = useImposiaDocument({
      source,
      sourceRevision,
      documentOptions,
      onReady,
      onError,
      onStateChange,
    });
    const controllerRef = useRef<PageDocumentController | undefined>(undefined);
    const mountedRef = useRef(false);
    const viewerRef = useRef<ReturnType<typeof mountPageViewer> | undefined>(undefined);
    const viewerOptionsRef = useRef(viewerOptions);
    const onErrorRef = useRef(onError);
    const [viewerError, setViewerError] = useState<unknown>();
    controllerRef.current = lifecycle.controller;
    viewerOptionsRef.current = viewerOptions;
    onErrorRef.current = onError;

    useImperativeHandle(ref, () => {
      mountedRef.current = true;
      return {
        get current(): PageDocument | undefined {
          return mountedRef.current ? controllerRef.current?.current : undefined;
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
    }, []);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        controllerRef.current = undefined;
      };
    }, []);

    useEffect(() => {
      const host = lifecycle.hostRef.current;
      const pageDocument = lifecycle.state.document;
      if (host === null || pageDocument === undefined) return;
      try {
        if (viewerRef.current === undefined) {
          viewerRef.current = mountPageViewer(host, pageDocument, viewerOptionsRef.current);
        } else {
          viewerRef.current.refresh(pageDocument);
        }
        setViewerError(undefined);
      } catch (error: unknown) {
        setViewerError(error);
        onErrorRef.current?.(error);
      }
    }, [lifecycle.hostRef, lifecycle.state.document]);

    const previousViewerOptionsRef = useRef(viewerOptions);
    useEffect(() => {
      const previous = previousViewerOptionsRef.current;
      previousViewerOptionsRef.current = viewerOptions;
      if (sameViewerOptions(previous, viewerOptions)) return;
      const viewer = viewerRef.current;
      if (viewer === undefined) return;
      viewer.setMode(viewerOptions?.mode ?? "continuous");
      viewer.setZoom(viewerOptions?.zoom ?? 1);
    }, [viewerOptions]);

    useEffect(
      () => () => {
        viewerRef.current?.destroy();
        viewerRef.current = undefined;
      },
      [],
    );

    const state: ImposiaDocumentState =
      viewerError === undefined ? lifecycle.state : { status: "error", error: viewerError };
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
