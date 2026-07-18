import {
  mountPageDocument,
  mountPageViewer,
  type PageDocumentOptions,
  type PageSource,
  type PageViewerOptions,
} from "@imposia/client";
import { useEffect, useRef } from "react";

export type ImposiaDocumentProps = {
  readonly source: PageSource;
  readonly documentOptions?: PageDocumentOptions;
  readonly viewerOptions?: PageViewerOptions;
  readonly className?: string;
};

export function ImposiaDocument({
  source,
  documentOptions,
  viewerOptions,
  className,
}: ImposiaDocumentProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const controller = mountPageDocument(host, source, documentOptions);
    let viewer: ReturnType<typeof mountPageViewer> | undefined;
    let disposed = false;
    controller.ready.then((page) => {
      if (!disposed) viewer = mountPageViewer(host, page, viewerOptions);
    });
    return () => {
      disposed = true;
      viewer?.destroy();
      void controller.destroy();
    };
  }, [source, documentOptions, viewerOptions]);
  return <div ref={hostRef} className={className} />;
}
