import { scanCssUrls } from "./page-document-assets-css.js";
import { sameDocumentFragment } from "./page-document-assets-html.js";

const RESOLVER_UNSUPPORTED_ELEMENTS = new Set([
  "base",
  "embed",
  "frame",
  "iframe",
  "meta",
  "object",
  "portal",
  "script",
]);
const RESOLVER_UNSUPPORTED_SVG_ELEMENTS = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "discard",
  "set",
]);
const SVG_CSS_ATTRIBUTES = new Set([
  "clip-path",
  "cursor",
  "fill",
  "filter",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
  "style",
]);
const RESOLVER_RESOURCE_ATTRIBUTES = new Set([
  "action",
  "background",
  "dynsrc",
  "formaction",
  "href",
  "lowsrc",
  "ping",
  "poster",
  "src",
  "srcset",
  "xlink:href",
]);

function decodeCssEscapes(value: string): string {
  return value
    .replace(/\\([0-9a-f]{1,6})(?:[\t\n\r\f ]|(?=$))?/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "�";
    })
    .replace(/\\([^\r\n])/g, "$1");
}

function normalizedElementName(element: Element): string {
  return (element.localName || element.tagName).toLowerCase();
}

function isSvgElement(element: Element): boolean {
  return element.namespaceURI === "http://www.w3.org/2000/svg";
}

function isStylesheetLink(element: Element): boolean {
  return (
    normalizedElementName(element) === "link" &&
    /(?:^|\s)stylesheet(?:\s|$)/i.test(element.getAttribute("rel") ?? "")
  );
}

export function safeSemanticHyperlink(value: string): boolean {
  const trimmed = value.trim();
  if (sameDocumentFragment(trimmed)) return true;
  if (
    trimmed === "" ||
    [...trimmed].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  ) {
    return false;
  }
  try {
    const protocol = new URL(trimmed).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

function keepsResourceAttribute(element: Element, name: string): boolean {
  const localName = normalizedElementName(element);
  if (name === "src") {
    return (
      ["audio", "img", "source", "track", "video"].includes(localName) ||
      (localName === "input" && element.getAttribute("type")?.toLowerCase() === "image")
    );
  }
  if (name === "srcset") return localName === "img" || localName === "source";
  if (name === "poster") return localName === "video";
  if (name === "href" || name === "xlink:href") {
    if (name === "href" && (localName === "a" || localName === "area")) {
      return safeSemanticHyperlink(element.getAttribute(name) ?? "");
    }
    if (isStylesheetLink(element)) return true;
    if (isSvgElement(element)) {
      return (
        sameDocumentFragment(element.getAttribute(name) ?? "") ||
        ["feimage", "image"].includes(localName)
      );
    }
  }
  return false;
}

function hasExternalSvgCssUrl(value: string): boolean {
  return scanCssUrls(decodeCssEscapes(value)).some((token) => !sameDocumentFragment(token.url));
}

function removeResolverUnsupportedContexts(root: ParentNode): void {
  for (const element of [...root.querySelectorAll<Element>("*")]) {
    const localName = normalizedElementName(element);
    if (
      RESOLVER_UNSUPPORTED_ELEMENTS.has(localName) ||
      (isSvgElement(element) && RESOLVER_UNSUPPORTED_SVG_ELEMENTS.has(localName)) ||
      (localName === "link" && !isStylesheetLink(element))
    ) {
      element.remove();
      continue;
    }
    if (
      localName === "style" &&
      isSvgElement(element) &&
      hasExternalSvgCssUrl(element.textContent ?? "")
    ) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "target" ||
        (RESOLVER_RESOURCE_ATTRIBUTES.has(name) && !keepsResourceAttribute(element, name))
      ) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (
        isSvgElement(element) &&
        SVG_CSS_ATTRIBUTES.has(name) &&
        hasExternalSvgCssUrl(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  for (const form of [...root.querySelectorAll("form")]) {
    form.replaceWith(...[...form.childNodes]);
  }
  for (const template of root.querySelectorAll<HTMLTemplateElement>("template")) {
    removeResolverUnsupportedContexts(template.content);
  }
}

export function sanitizeAssetResolverInput(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  removeResolverUnsupportedContexts(parsed);
  return parsed.documentElement.outerHTML;
}
