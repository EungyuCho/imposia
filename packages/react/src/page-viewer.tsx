import {
  mountPageDocument,
  mountPageViewer,
  type PageDocumentOptions,
  type PageSource,
  type PageViewerOptions,
} from "@imposia/client";
import { type CSSProperties, useEffect, useRef } from "react";

export type ImposiaPageViewerProps = {
  readonly source: PageSource;
  readonly documentOptions?: PageDocumentOptions;
  readonly viewerOptions?: PageViewerOptions;
  readonly className?: string;
  readonly style?: CSSProperties;
};

export function ImposiaPageViewer({
  source,
  documentOptions,
  viewerOptions,
  className,
  style,
}: ImposiaPageViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const controller = mountPageDocument(host, source, documentOptions);
    let viewer: ReturnType<typeof mountPageViewer> | undefined;
    let cancelled = false;
    void controller.ready.then((document) => {
      if (!cancelled) viewer = mountPageViewer(host, document, viewerOptions);
    });
    return () => {
      cancelled = true;
      viewer?.destroy();
      void controller.destroy();
    };
  }, [source, documentOptions, viewerOptions]);
  return <div ref={hostRef} className={className} style={style} />;
}
