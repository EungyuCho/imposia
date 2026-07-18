import type { PageGeometry } from "./page-document-types.js";
import {
  A4_HEIGHT_CSS_PX,
  A4_WIDTH_CSS_PX,
  cssPx,
  DEFAULT_PAGE_MARGIN_CSS_PX,
} from "./page-media.js";

export { A4_HEIGHT_CSS_PX, A4_WIDTH_CSS_PX } from "./page-media.js";
export const FRAME_CSP =
  "default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; media-src 'none'";
export const FRAME_BLOB_CSP =
  "default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; style-src 'unsafe-inline'; img-src blob:; font-src blob:; media-src blob:";
export const FRAME_DOCUMENT = `<!DOCTYPE html><html data-imposia-document="v1"><head><meta http-equiv="Content-Security-Policy" content="${FRAME_BLOB_CSP}"></head><body data-imposia-pages></body></html>`;
const DEFAULT_GEOMETRY: PageGeometry = Object.freeze({
  sheetWidthCssPx: A4_WIDTH_CSS_PX,
  sheetHeightCssPx: A4_HEIGHT_CSS_PX,
  margins: Object.freeze({
    topCssPx: DEFAULT_PAGE_MARGIN_CSS_PX,
    rightCssPx: DEFAULT_PAGE_MARGIN_CSS_PX,
    bottomCssPx: DEFAULT_PAGE_MARGIN_CSS_PX,
    leftCssPx: DEFAULT_PAGE_MARGIN_CSS_PX,
  }),
  contentWidthCssPx: A4_WIDTH_CSS_PX - 2 * DEFAULT_PAGE_MARGIN_CSS_PX,
  contentHeightCssPx: A4_HEIGHT_CSS_PX - 2 * DEFAULT_PAGE_MARGIN_CSS_PX,
});

export function frameStyle(geometries: readonly PageGeometry[]): string {
  const first = geometries[0] ?? DEFAULT_GEOMETRY;
  const namedSheets = geometries
    .map(
      (geometry, index) =>
        `@page imposia-sheet-${index + 1}{size:${cssPx(geometry.sheetWidthCssPx)} ${cssPx(geometry.sheetHeightCssPx)};margin:0}` +
        `[data-imposia-page-number="${index + 1}"]{page:imposia-sheet-${index + 1}!important}`,
    )
    .join("");
  return [
    `@page{size:${cssPx(first.sheetWidthCssPx)} ${cssPx(first.sheetHeightCssPx)};margin:0}`,
    namedSheets,
    ":root{color-scheme:light}",
    "html,body{margin:0;padding:0}",
    "body[data-imposia-pages]{display:grid;gap:16px;justify-content:start;background:#f3f3f3;padding:16px}",
    "[data-imposia-page]{box-sizing:border-box;position:relative;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:#fff;color:#111}",
    "[data-imposia-page-header],[data-imposia-page-footer]{min-height:0}",
    "[data-imposia-page-content],[data-imposia-page-flow]{min-height:0}",
    "[data-imposia-margin-box]{position:absolute;box-sizing:border-box;display:flex;align-items:center;overflow:hidden;pointer-events:none;white-space:nowrap}",
    '[data-imposia-margin-box^="top-"]{top:0;height:var(--imposia-margin-top)}',
    '[data-imposia-margin-box^="bottom-"]{bottom:0;height:var(--imposia-margin-bottom)}',
    '[data-imposia-margin-box$="-left"]{left:var(--imposia-margin-left);width:calc(var(--imposia-content-width)/3);justify-content:flex-start;text-align:left}',
    '[data-imposia-margin-box$="-center"]{left:calc(var(--imposia-margin-left) + var(--imposia-content-width)/3);width:calc(var(--imposia-content-width)/3);justify-content:center;text-align:center}',
    '[data-imposia-margin-box$="-right"]{right:var(--imposia-margin-right);width:calc(var(--imposia-content-width)/3);justify-content:flex-end;text-align:right}',
    `@media print{html,body{width:${cssPx(first.sheetWidthCssPx)};min-height:${cssPx(first.sheetHeightCssPx)};background:#fff}body[data-imposia-pages]{display:block;gap:0;padding:0;margin:0;background:#fff}[data-imposia-page]{break-after:page;page-break-after:always;margin:0}[data-imposia-page]:last-child{break-after:auto;page-break-after:auto}}`,
  ].join("");
}

export const FRAME_STYLE = frameStyle([]);

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
  meta.content = FRAME_BLOB_CSP;
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
