import { ImposiaError } from "./errors.js";
import { committedFrameGeneration } from "./page-document-frame.js";
import { pageSemanticSnapshot } from "./page-document-semantic.js";
import type { PageDocument } from "./page-document-types.js";

export interface HtmlExportOptions {
  /** Title of the exported document; omit to keep the document's own title. */
  title?: string;
  /**
   * Device pixel ratio of the renderer that will lay the exported HTML out, for example a
   * PDF engine. Cell borders that this renderer would round up to a whole device pixel are
   * widened in the exported copy only, and the cell's padding gives up the same room, so the
   * content width and the line breaks stay as in the preview. Omit it to export unchanged.
   */
  targetDevicePixelRatio?: number;
}

const SIDES = ["top", "right", "bottom", "left"] as const;

function cssLength(value: number): string {
  return `${Number(value.toFixed(6))}px`;
}

/**
 * Writes the border and padding of every side of a table cell that the target pixel ratio
 * would thicken into `!important` inline styles on the copy. Values are read from the
 * committed document, so the preview itself is never modified.
 */
function adjustCellBorders(source: Document, clone: Element, targetDevicePixelRatio: number): void {
  const view = source.defaultView;
  if (view === null) return;
  const originals = [...source.querySelectorAll("td, th")];
  const copies = [...clone.querySelectorAll<HTMLElement>("td, th")];
  for (const [index, original] of originals.entries()) {
    const copy = copies[index];
    if (copy === undefined) continue;
    const style = view.getComputedStyle(original);
    const collapsed = style.borderCollapse === "collapse";
    for (const side of SIDES) {
      const border = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
      const padding = Number.parseFloat(style.getPropertyValue(`padding-${side}`));
      if (!Number.isFinite(border) || border <= 0 || !Number.isFinite(padding)) continue;
      const targetBorder =
        Math.max(1, Math.floor(border * targetDevicePixelRatio + 0.000001)) /
        targetDevicePixelRatio;
      const adjustment = (targetBorder - border) / (collapsed ? 2 : 1);
      if (!Number.isFinite(adjustment) || adjustment === 0) continue;
      // Without enough padding to give up, the side is left as authored rather than
      // squeezing the content below zero.
      if (padding < adjustment) continue;
      // Left and right edges get a little extra room, so that fractional
      // coordinates rounding in the target renderer cannot wrap a line that just fits.
      const inlineGuard = side === "left" || side === "right" ? 1 / 64 : 0;
      const targetPadding = Math.max(0, padding - adjustment - inlineGuard);
      copy.style.setProperty(`border-${side}-width`, cssLength(targetBorder), "important");
      copy.style.setProperty(`padding-${side}`, cssLength(targetPadding), "important");
    }
  }
}

const URL_ATTRIBUTES = new Set(["src", "href", "xlink:href", "srcset", "poster", "style"]);

async function blobDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/**
 * Serializes the committed pages as one standalone HTML document. Resolved asset bytes
 * are inlined as data URLs. Everything that reads the live document happens before the
 * first await, so destroying the controller mid-export cannot invalidate the result.
 */
export async function exportPageDocumentHtml(
  document: PageDocument,
  options: HtmlExportOptions = {},
): Promise<string> {
  const targetRatio = options.targetDevicePixelRatio;
  if (
    targetRatio !== undefined &&
    (typeof targetRatio !== "number" || !Number.isFinite(targetRatio) || targetRatio <= 0)
  ) {
    throw new TypeError("targetDevicePixelRatio must be a positive finite number.");
  }
  const snapshot = pageSemanticSnapshot(document);
  const source = document.iframe.contentDocument;
  if (
    snapshot === undefined ||
    source === null ||
    committedFrameGeneration(source) !== document.generation
  ) {
    throw new ImposiaError("DOCUMENT_UNAVAILABLE", "The document is no longer committed.");
  }
  // The copy lives in an inert document: attributes rewritten to data URLs on a copy owned
  // by the frame would be fetched, and the frame's CSP refuses them.
  const inert = source.implementation.createHTMLDocument("");
  const clone = inert.importNode(source.documentElement, true) as HTMLElement;
  for (const element of clone.querySelectorAll(
    "meta[http-equiv], style[data-imposia-viewer-style]",
  )) {
    element.remove();
  }
  // The frame has no charset declaration, and the CSP meta was removed above; without one a
  // consumer saving the string as UTF-8 can have non-ASCII text decoded with another encoding.
  if (clone.querySelector("meta[charset]") === null) {
    const charset = inert.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    clone.querySelector("head")?.prepend(charset);
  }
  clone.removeAttribute("data-imposia-viewer-presentation");
  clone.removeAttribute("data-imposia-viewer-cover");
  if (options.title !== undefined) {
    const title = inert.createElement("title");
    title.textContent = options.title;
    clone.querySelector("title")?.remove();
    clone.querySelector("head")?.append(title);
  }

  // Anchor positioning is resolved by the browser and does not survive serialization,
  // so freeze each anchored element at its measured page coordinate.
  const originals = [...source.querySelectorAll<HTMLElement>('[style*="position-anchor"]')];
  const copies = [...clone.querySelectorAll<HTMLElement>('[style*="position-anchor"]')];
  for (const [index, original] of originals.entries()) {
    const copy = copies[index];
    const page = original.closest<HTMLElement>("[data-imposia-page]");
    if (copy === undefined || page === null) continue;
    const rect = original.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    copy.style.left = `${(rect.left - pageRect.left) / (pageRect.width / page.offsetWidth || 1)}px`;
    copy.style.top = `${(rect.top - pageRect.top) / (pageRect.height / page.offsetHeight || 1)}px`;
    copy.style.removeProperty("position-anchor");
  }

  if (targetRatio !== undefined) adjustCellBorders(source, clone, targetRatio);

  const attributes: Attr[] = [];
  for (const element of clone.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      if (URL_ATTRIBUTES.has(attribute.name)) attributes.push(attribute);
    }
  }
  const styles = [...clone.querySelectorAll("style")];
  const blobs = new Map<string, Blob>();
  for (const asset of snapshot.assets) {
    if (asset.blobUrl !== undefined) blobs.set(asset.blobUrl, asset.bytes);
  }

  const dataUrls = await Promise.all(
    [...blobs].map(async ([url, blob]) => [url, await blobDataUrl(blob)] as const),
  );
  for (const [url, dataUrl] of dataUrls) {
    for (const attribute of attributes) attribute.value = attribute.value.replaceAll(url, dataUrl);
    for (const style of styles) {
      style.textContent = (style.textContent ?? "").replaceAll(url, dataUrl);
    }
  }
  return `<!DOCTYPE html>${clone.outerHTML}`;
}
