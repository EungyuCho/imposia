import { ImposiaError } from "./errors.js";
import { pageSemanticSnapshot } from "./page-document-semantic.js";
import type { PageDocument } from "./page-document-types.js";

export interface HtmlExportOptions {
  /** Title of the exported document; omit to keep the document's own title. */
  title?: string;
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
  const snapshot = pageSemanticSnapshot(document);
  const source = document.iframe.contentDocument;
  if (snapshot === undefined || source === null) {
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
