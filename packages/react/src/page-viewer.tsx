import {
  mountPageViewer,
  type PageDocument,
  type PageDocumentOptions,
  type PageSource,
  type PageViewerOptions,
} from "@imposia/client";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  type ImposiaDocumentCallbacks,
  type ImposiaDocumentState,
  useImposiaDocument,
} from "./use-imposia-document.js";

export type ImposiaPageViewerProps = ImposiaDocumentCallbacks & {
  readonly source: PageSource;
  readonly documentOptions?: PageDocumentOptions;
  readonly viewerOptions?: PageViewerOptions;
  readonly className?: string;
  readonly style?: CSSProperties;
};

function sameViewerOptions(
  left: PageViewerOptions | undefined,
  right: PageViewerOptions | undefined,
): boolean {
  return left?.mode === right?.mode && left?.zoom === right?.zoom;
}

export function ImposiaPageViewer({
  source,
  documentOptions,
  viewerOptions,
  className,
  style,
  onReady,
  onError,
  onStateChange,
}: ImposiaPageViewerProps) {
  const lifecycle = useImposiaDocument({
    source,
    documentOptions,
    onReady,
    onError,
    onStateChange,
  });
  const viewerRef = useRef<ReturnType<typeof mountPageViewer> | undefined>(undefined);
  const viewerOptionsRef = useRef(viewerOptions);
  const onErrorRef = useRef(onError);
  const [viewerError, setViewerError] = useState<unknown>();
  viewerOptionsRef.current = viewerOptions;
  onErrorRef.current = onError;

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
}
