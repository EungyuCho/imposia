import { parseCss } from "./css-parse.js";
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
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
// A reference stays inside the image: a fragment of the document or a raster that travels in
// the markup. Anything else is a request for another resource.
const INTERNAL_REFERENCE = /^(?:#|data:image\/(?:png|jpeg|gif|webp)[;,])/i;
// Presentation attributes whose value is CSS and can name a resource. Other attributes
// (descriptions, labels, path data) are plain text and are never read as CSS.
const CSS_ATTRIBUTES = new Set([
  "style",
  "fill",
  "stroke",
  "filter",
  "mask",
  "clip-path",
  "clip",
  "marker-start",
  "marker-mid",
  "marker-end",
  "cursor",
]);
const CSS_ESCAPE = /\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\([\s\S])/g;
const CSS_URL = /(?:url|src)\(\s*(["']?)(.*?)\1\s*\)/gi;
// Functions that take a bare string as a resource.
const CSS_STRING_RESOURCE = /(?:image-set|image|cross-fade)\(/i;

function externalReference(value: string): boolean {
  return !INTERNAL_REFERENCE.test(value.trim());
}

/** The text a CSS parser would see: escapes such as `u\72l(` are resolved first. */
function unescapeCss(text: string): string {
  return text.replace(
    CSS_ESCAPE,
    (_match, hex: string | undefined, character: string | undefined) => {
      if (hex === undefined) return character ?? "";
      const code = Number.parseInt(hex, 16);
      return code === 0 || code > 0x10ffff ? "\ufffd" : String.fromCodePoint(code);
    },
  );
}

function valueReason(value: string): string | undefined {
  const text = unescapeCss(value);
  for (const match of text.matchAll(CSS_URL)) {
    if (externalReference(match[2] ?? "")) return "an external resource reference";
  }
  if (CSS_STRING_RESOURCE.test(text)) return "an external resource reference";
  return undefined;
}

/**
 * The reason a CSS text is refused, found by parsing it: rules and declarations are visited,
 * so a resource named through an escape, a comment, or an unusual layout is seen, and a mere
 * mention of "@import" in text is not mistaken for a rule.
 */
function cssReason(css: string, declarationsOnly: boolean): string | undefined {
  let root: ReturnType<typeof parseCss>;
  try {
    root = parseCss(declarationsOnly ? `x{${css}}` : css);
  } catch (_error: unknown) {
    return "CSS that could not be parsed";
  }
  let reason: string | undefined;
  root.walk((node) => {
    if (reason !== undefined) return;
    if (node.type === "atrule" && unescapeCss(node.name).toLowerCase() === "import") {
      reason = "an @import rule";
    } else if (node.type === "decl") {
      reason = valueReason(node.value);
    }
  });
  return reason;
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
      const reason = cssReason(element.textContent ?? "", false);
      if (reason !== undefined) return svgRejectedReason(`contains ${reason}`);
    }
    const target = (element.getAttribute("attributeName") ?? "").toLowerCase().split(":").pop();
    if (
      (element.localName === "set" || element.localName.startsWith("animate")) &&
      target === "href"
    ) {
      return svgRejectedReason("animates a reference");
    }
    for (const attribute of element.attributes) {
      const name = attribute.localName.toLowerCase();
      if (attribute.name.toLowerCase().startsWith("on")) {
        return svgRejectedReason("contains an event-handler attribute");
      }
      // `href` in no namespace, or in the XLink namespace under whatever prefix it was bound.
      if (
        name === "href" &&
        (attribute.namespaceURI === null || attribute.namespaceURI === XLINK_NAMESPACE)
      ) {
        if (externalReference(attribute.value)) {
          return svgRejectedReason("contains an external resource reference");
        }
        continue;
      }
      if (attribute.namespaceURI === null && CSS_ATTRIBUTES.has(name)) {
        const reason =
          name === "style" ? cssReason(attribute.value, true) : valueReason(attribute.value);
        if (reason !== undefined) return svgRejectedReason(`contains ${reason}`);
      }
    }
  }
  return undefined;
}
