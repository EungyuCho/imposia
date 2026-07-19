import {
  mountPageViewer,
  type PageDocument,
  type PageViewerOptions,
  validatePageViewerOptions,
} from "@imposia/client";
import { type RefObject, useEffect, useRef, useState } from "react";

export interface PageViewerBinding {
  readonly error: unknown;
  getViewer(): ReturnType<typeof mountPageViewer> | undefined;
}

function sameReaderOptions(
  left: PageViewerOptions["reader"] | undefined,
  right: PageViewerOptions["reader"] | undefined,
): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.controller === right.controller &&
      left.onDeepLinkChange === right.onDeepLinkChange)
  );
}

export function usePageViewerBinding(
  hostRef: RefObject<HTMLDivElement | null>,
  pageDocument: PageDocument | undefined,
  viewerOptions: PageViewerOptions | undefined,
  onError: ((error: unknown) => void) | undefined,
): PageViewerBinding {
  const viewerRef = useRef<ReturnType<typeof mountPageViewer> | undefined>(undefined);
  const viewerIframeRef = useRef<HTMLIFrameElement | undefined>(undefined);
  const viewerReaderRef = useRef<PageViewerOptions["reader"] | undefined>(undefined);
  const viewerInspectorRef = useRef(false);
  const onErrorRef = useRef(onError);
  const [viewerError, setViewerError] = useState<unknown>();
  onErrorRef.current = onError;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    if (pageDocument === undefined) {
      viewerRef.current?.destroy();
      viewerRef.current = undefined;
      viewerIframeRef.current = undefined;
      viewerReaderRef.current = undefined;
      viewerInspectorRef.current = false;
      return;
    }
    try {
      let viewer = viewerRef.current;
      const requiresRemount =
        viewer === undefined ||
        viewerIframeRef.current !== pageDocument.iframe ||
        !sameReaderOptions(viewerReaderRef.current, viewerOptions?.reader) ||
        viewerInspectorRef.current !== (viewerOptions?.inspector ?? false);
      if (requiresRemount) {
        validatePageViewerOptions(pageDocument, viewerOptions);
        const preservedPage =
          viewer !== undefined && viewerIframeRef.current === pageDocument.iframe
            ? viewer.state.page
            : undefined;
        viewer?.destroy();
        viewerRef.current = undefined;
        viewerIframeRef.current = undefined;
        viewerReaderRef.current = undefined;
        viewerInspectorRef.current = false;
        viewer = mountPageViewer(host, pageDocument, viewerOptions);
        viewerRef.current = viewer;
        viewerIframeRef.current = pageDocument.iframe;
        viewerReaderRef.current = viewerOptions?.reader;
        viewerInspectorRef.current = viewerOptions?.inspector ?? false;
        if (preservedPage !== undefined) viewer.goToPage(preservedPage);
      }
      const activeViewer = viewerRef.current;
      if (activeViewer === undefined) return;
      if (!requiresRemount && activeViewer.state.generation !== pageDocument.generation) {
        activeViewer.refresh(pageDocument);
      }
      activeViewer.setTheme(viewerOptions?.theme);
      activeViewer.setSpreadCover(viewerOptions?.spread?.cover ?? false);
      activeViewer.setMode(viewerOptions?.mode ?? "continuous");
      activeViewer.setZoom(viewerOptions?.zoom ?? 1);
      setViewerError(undefined);
    } catch (error: unknown) {
      setViewerError(error);
      onErrorRef.current?.(error);
    }
  }, [hostRef, pageDocument, viewerOptions]);

  useEffect(
    () => () => {
      viewerRef.current?.destroy();
      viewerRef.current = undefined;
      viewerIframeRef.current = undefined;
      viewerReaderRef.current = undefined;
      viewerInspectorRef.current = false;
    },
    [],
  );

  return {
    error: viewerError,
    getViewer() {
      return viewerRef.current;
    },
  };
}
