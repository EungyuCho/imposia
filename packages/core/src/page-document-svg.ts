import { type BlockedReason, svgRejectedReason } from "./page-document-blocked-reasons.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
// Elements that run code or embed a document of another kind. Rejected wherever they occur.
const FORBIDDEN_ELEMENTS = new Map<string, string>([
  ["script", "a script element"],
  ["foreignobject", "a foreignObject element"],
  ["iframe", "an embedded frame"],
  ["embed", "an embedded object"],
  ["object", "an embedded object"],
  ["audio", "an embedded media element"],
  ["video", "an embedded media element"],
  ["canvas", "an embedded canvas"],
]);
const URL_REFERENCE = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
// A reference stays inside the image: a fragment of the document or a raster that travels in
// the markup. Anything else is a request for another resource.
const INTERNAL_REFERENCE = /^(?:#|data:image\/(?:png|jpeg|gif|webp)[;,])/i;

function externalReference(value: string): boolean {
  return !INTERNAL_REFERENCE.test(value.trim());
}

function cssReason(css: string): string | undefined {
  if (/@import/i.test(css)) return "an @import rule";
  for (const match of css.matchAll(URL_REFERENCE)) {
    if (externalReference(match[2] ?? "")) return "an external resource reference";
  }
  return undefined;
}

/**
 * Checks SVG bytes before they may be shown as an image. The result is `undefined` when the
 * file is acceptable, or a Core-authored phrase naming why it is not. The policy is to
 * refuse, not to repair: scripts, event-handler attributes, embedded documents, and any
 * reference that would reach beyond the image itself make the whole file unusable, so what is
 * drawn is always exactly what the author supplied.
 */
export function svgRejection(bytes: Uint8Array): BlockedReason | undefined {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (_error: unknown) {
    return svgRejectedReason("is not valid UTF-8 text");
  }
  if (/<!ENTITY/i.test(source)) return svgRejectedReason("declares entities");
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = parsed.documentElement;
  if (
    root === null ||
    root.localName === "parsererror" ||
    parsed.getElementsByTagName("parsererror").length > 0
  ) {
    return svgRejectedReason("is not well-formed");
  }
  if (root.localName !== "svg" || root.namespaceURI !== SVG_NAMESPACE) {
    return svgRejectedReason("does not have an svg root element");
  }
  for (const element of [root, ...root.querySelectorAll("*")]) {
    const forbidden = FORBIDDEN_ELEMENTS.get(element.localName.toLowerCase());
    if (forbidden !== undefined) return svgRejectedReason(`contains ${forbidden}`);
    if (element.localName === "style") {
      const reason = cssReason(element.textContent ?? "");
      if (reason !== undefined) return svgRejectedReason(`contains ${reason}`);
    }
    const target = (element.getAttribute("attributeName") ?? "").toLowerCase();
    if (
      (element.localName === "set" || element.localName.startsWith("animate")) &&
      (target === "href" || target === "xlink:href")
    ) {
      return svgRejectedReason("animates a reference");
    }
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) return svgRejectedReason("contains an event-handler attribute");
      if (name === "href" || name === "xlink:href") {
        if (externalReference(attribute.value)) {
          return svgRejectedReason("contains an external resource reference");
        }
        continue;
      }
      const reason = cssReason(attribute.value);
      if (reason !== undefined) return svgRejectedReason(`contains ${reason}`);
    }
  }
  return undefined;
}
