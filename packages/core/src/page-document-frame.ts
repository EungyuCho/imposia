export const A4_WIDTH_CSS_PX = (210 * 96) / 25.4;
export const A4_HEIGHT_CSS_PX = (297 * 96) / 25.4;
export const FRAME_CSP =
  "default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; media-src 'none'";
export const FRAME_DOCUMENT = `<!DOCTYPE html><html data-imposia-document="v1"><head><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"></head><body data-imposia-pages></body></html>`;
export const FRAME_STYLE = [
  "@page{size:A4;margin:0}",
  ":root{color-scheme:light}",
  "html,body{margin:0;padding:0}",
  "body[data-imposia-pages]{display:grid;gap:16px;justify-content:start;background:#f3f3f3;padding:16px}",
  "[data-imposia-page]{box-sizing:border-box;display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:210mm;height:297mm;padding:var(--imposia-page-margin,20mm);overflow:hidden;background:#fff;color:#111}",
  "[data-imposia-page-header],[data-imposia-page-footer]{min-height:0}",
  "[data-imposia-page-content]{min-height:0}",
  "[data-imposia-page-flow]{min-height:0}",
  "@media print{html,body{width:210mm;min-height:297mm;background:#fff}body[data-imposia-pages]{display:block;gap:0;padding:0;margin:0;background:#fff}[data-imposia-page]{break-after:page;page-break-after:always;margin:0}[data-imposia-page]:last-child{break-after:auto;page-break-after:auto}}",
].join("");

export function abortError(): DOMException {
  return new DOMException("The page document operation was aborted.", "AbortError");
}

export function destroyedError(): Error {
  return new Error("Page document controller has been destroyed.");
}

export function commitGeneration(
  frameDocument: Document,
  body: DocumentFragment,
  css: readonly string[],
): void {
  const styles = css.map((value) => {
    const style = frameDocument.createElement("style");
    style.textContent = value;
    return style;
  });
  frameDocument.documentElement.setAttribute("data-imposia-document", "v1");
  const meta = frameDocument.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = FRAME_CSP;
  frameDocument.head.replaceChildren(meta, ...styles);
  frameDocument.body.setAttribute("data-imposia-pages", "");
  frameDocument.body.replaceChildren(body);
}

export function frameReady(iframe: HTMLIFrameElement, signal: AbortSignal): Promise<Document> {
  const existing = iframe.contentDocument;
  if (
    existing !== null &&
    existing.documentElement.getAttribute("data-imposia-document") === "v1"
  ) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      iframe.removeEventListener("load", onLoad);
      signal.removeEventListener("abort", onAbort);
    };
    const onLoad = () => {
      cleanup();
      const frameDocument = iframe.contentDocument;
      if (frameDocument === null) {
        reject(new Error("The page document iframe has no content document."));
        return;
      }
      resolve(frameDocument);
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    iframe.addEventListener("load", onLoad, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export function linkSignal(
  signal: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (signal === undefined) return () => undefined;
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}
