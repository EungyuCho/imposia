import {
  mountPageViewer,
  type PageDocument,
  type PageViewerOptions,
  type PageViewerState,
  validatePageViewerOptions,
} from "@imposia/client";
import { type RefObject, useEffect, useRef, useState } from "react";

export interface PageViewerBinding {
  readonly error: unknown;
  getViewer(): ReturnType<typeof mountPageViewer> | undefined;
}

type ViewerLayoutOptions = {
  readonly cover: boolean | undefined;
  readonly mode: PageViewerOptions["mode"];
  readonly zoom: number | undefined;
};

function viewerLayoutOptions(options: PageViewerOptions | undefined): ViewerLayoutOptions {
  return { cover: options?.spread?.cover, mode: options?.mode, zoom: options?.zoom };
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
  onStateChange?: ((state: PageViewerState) => void) | undefined,
): PageViewerBinding {
  const viewerRef = useRef<ReturnType<typeof mountPageViewer> | undefined>(undefined);
  const viewerIframeRef = useRef<HTMLIFrameElement | undefined>(undefined);
  const viewerReaderRef = useRef<PageViewerOptions["reader"] | undefined>(undefined);
  const viewerInspectorRef = useRef(false);
  const viewerControlsRef = useRef(true);
  const viewerLayoutRef = useRef<ViewerLayoutOptions>(viewerLayoutOptions(undefined));
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const onErrorRef = useRef(onError);
  const onStateChangeRef = useRef(onStateChange);
  const [viewerError, setViewerError] = useState<unknown>();
  onErrorRef.current = onError;
  onStateChangeRef.current = onStateChange;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    if (pageDocument === undefined) {
      unsubscribeRef.current?.();
      unsubscribeRef.current = undefined;
      viewerRef.current?.destroy();
      viewerRef.current = undefined;
      viewerIframeRef.current = undefined;
      viewerReaderRef.current = undefined;
      viewerInspectorRef.current = false;
      viewerControlsRef.current = true;
      return;
    }
    try {
      let viewer = viewerRef.current;
      const requiresRemount =
        viewer === undefined ||
        viewerIframeRef.current !== pageDocument.iframe ||
        !sameReaderOptions(viewerReaderRef.current, viewerOptions?.reader) ||
        viewerInspectorRef.current !== (viewerOptions?.inspector ?? false) ||
        viewerControlsRef.current !== (viewerOptions?.controls ?? true);
      if (requiresRemount) {
        validatePageViewerOptions(pageDocument, viewerOptions);
        const preservedPage =
          viewer !== undefined && viewerIframeRef.current === pageDocument.iframe
            ? viewer.state.page
            : undefined;
        unsubscribeRef.current?.();
        unsubscribeRef.current = undefined;
        viewer?.destroy();
        viewerRef.current = undefined;
        viewerIframeRef.current = undefined;
        viewerReaderRef.current = undefined;
        viewerInspectorRef.current = false;
        viewerControlsRef.current = true;
        viewer = mountPageViewer(host, pageDocument, viewerOptions);
        viewerRef.current = viewer;
        viewerIframeRef.current = pageDocument.iframe;
        viewerReaderRef.current = viewerOptions?.reader;
        viewerInspectorRef.current = viewerOptions?.inspector ?? false;
        viewerControlsRef.current = viewerOptions?.controls ?? true;
        viewerLayoutRef.current = viewerLayoutOptions(viewerOptions);
        if (preservedPage !== undefined) viewer.goToPage(preservedPage);
        unsubscribeRef.current = viewer.subscribe((state) => onStateChangeRef.current?.(state));
      }
      const activeViewer = viewerRef.current;
      if (activeViewer === undefined) return;
      if (!requiresRemount && activeViewer.state.generation !== pageDocument.generation) {
        activeViewer.refresh(pageDocument);
      }
      activeViewer.setTheme(viewerOptions?.theme);
      // Reapply a layout option only when the caller changes it, so a rerender with an
      // equal inline options object keeps what the reader chose with the viewer controls,
      // and dropping an option returns the viewer to its default.
      const layout = viewerLayoutOptions(viewerOptions);
      const appliedLayout = viewerLayoutRef.current;
      if (layout.cover !== appliedLayout.cover) activeViewer.setSpreadCover(layout.cover ?? false);
      if (layout.mode !== appliedLayout.mode) activeViewer.setMode(layout.mode ?? "continuous");
      if (layout.zoom !== appliedLayout.zoom) activeViewer.setZoom(layout.zoom ?? 1);
      viewerLayoutRef.current = layout;
      setViewerError(undefined);
    } catch (error: unknown) {
      const nextError = error instanceof Error ? error : new Error(String(error));
      setViewerError(nextError);
      onErrorRef.current?.(nextError);
    }
  }, [hostRef, pageDocument, viewerOptions]);

  useEffect(
    () => () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = undefined;
      viewerRef.current?.destroy();
      viewerRef.current = undefined;
      viewerIframeRef.current = undefined;
      viewerReaderRef.current = undefined;
      viewerInspectorRef.current = false;
      viewerControlsRef.current = true;
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
