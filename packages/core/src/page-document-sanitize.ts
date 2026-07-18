import postcss from "postcss";
import { scanCssUrls } from "./page-document-assets-css.js";
import { sameDocumentFragment, srcsetCandidates } from "./page-document-assets-html.js";
import type { PageLimits, PageSource, PageWarning } from "./page-document-types.js";
import type { DocumentWarning } from "./warnings.js";

export const DEFAULT_MAX_INPUT_BYTES = 5 * 1024 * 1024;

export interface SanitizedCss {
  css: string;
  resourceBlocked: boolean;
}

export interface PreparedFragment {
  fragment: DocumentFragment;
  resourceBlocked: boolean;
}

export { prepareDocument } from "./document.js";

const RESOURCE_ATTRIBUTES = new Set([
  "href",
  "src",
  "srcset",
  "poster",
  "action",
  "formaction",
  "xlink:href",
  "ping",
  "background",
  "lowsrc",
  "dynsrc",
]);
const DYNAMIC_ELEMENTS = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "discard",
  "set",
]);
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

export function isLightDomSource(value: unknown): value is Element | DocumentFragment {
  if (value === null || typeof value !== "object" || !("nodeType" in value)) return false;
  return value.nodeType === 1 || value.nodeType === 11;
}

export function sourceHtml(source: PageSource): string {
  if ("html" in source) {
    if (typeof source.html !== "string") throw new TypeError("Page source html must be a string.");
    return source.html;
  }
  if ("lightDom" in source && isLightDomSource(source.lightDom)) {
    return new XMLSerializer().serializeToString(source.lightDom);
  }
  throw new TypeError("Page source must provide html or lightDom.");
}

export function ensureInputLimit(html: string, limits: PageLimits | undefined): void {
  const maxInputBytes = limits?.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  if (new TextEncoder().encode(html).byteLength > maxInputBytes) {
    throw new Error(`Page source exceeds the ${maxInputBytes}-byte input limit.`);
  }
}

function decodeCssEscapes(value: string): string {
  return value
    .replace(/\\([0-9a-f]{1,6})(?:[\t\n\r\f ]|(?=$))?/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "�";
    })
    .replace(/\\([^\r\n])/g, "$1");
}

function hasCssResource(
  value: string,
  preserveResolvedResources = false,
  resolvedUrls?: ReadonlySet<string>,
): boolean {
  const decoded = decodeCssEscapes(value);
  if (!/\b(?:url|image-set|cross-fade|local)\s*\(/i.test(decoded)) return false;
  const tokens = scanCssUrls(decoded).filter((token) => !sameDocumentFragment(token.url));
  if (tokens.length === 0) return false;
  if (!preserveResolvedResources || resolvedUrls === undefined) return true;
  return tokens.some((token) => !resolvedUrls.has(token.url.trim()));
}

function normalizedElementName(element: Element): string {
  return (element.localName || element.tagName).toLowerCase();
}

function isTemplateElement(element: Element): element is HTMLTemplateElement {
  return normalizedElementName(element) === "template" && "content" in element;
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

export function sanitizeCss(
  css: string,
  preserveResolvedResources = false,
  resolvedUrls?: ReadonlySet<string>,
): SanitizedCss {
  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(css);
  } catch {
    return { css: "", resourceBlocked: true };
  }

  let resourceBlocked = false;
  root.walkAtRules((rule) => {
    const name = decodeCssEscapes(rule.name).toLowerCase();
    const resourceRule = hasCssResource(rule.toString(), preserveResolvedResources, resolvedUrls);
    if (name === "font-face" && preserveResolvedResources && !resourceRule) return;
    if (["import", "font-face", "namespace"].includes(name) || resourceRule) {
      resourceBlocked = true;
      rule.remove();
    }
  });
  root.walkDecls((declaration) => {
    const property = decodeCssEscapes(declaration.prop).toLowerCase();
    const resourceDeclaration = hasCssResource(
      declaration.value,
      preserveResolvedResources,
      resolvedUrls,
    );
    if (
      (property === "src" && (!preserveResolvedResources || resourceDeclaration)) ||
      resourceDeclaration
    ) {
      resourceBlocked = true;
      declaration.remove();
    }
  });
  return { css: root.toString(), resourceBlocked };
}

export function copyPreparedBody(
  frameDocument: Document,
  html: string,
  preserveResolvedResources = false,
  resolvedUrls?: ReadonlySet<string>,
): PreparedFragment {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const headResourceBlocked = sanitizeFrameContent(
    parsed.head,
    preserveResolvedResources,
    resolvedUrls,
  );
  const bodyResourceBlocked = sanitizeFrameContent(
    parsed.body,
    preserveResolvedResources,
    resolvedUrls,
  );
  const fragment = frameDocument.createDocumentFragment();
  for (const style of [...parsed.head.querySelectorAll("style")]) {
    fragment.append(frameDocument.importNode(style, true));
  }
  for (const child of [...parsed.body.childNodes]) {
    fragment.append(frameDocument.importNode(child, true));
  }
  return { fragment, resourceBlocked: headResourceBlocked || bodyResourceBlocked };
}

function resolvedAttribute(
  _element: Element,
  name: string,
  value: string,
  resolvedUrls: ReadonlySet<string> | undefined,
): boolean {
  if (resolvedUrls === undefined) return false;
  if (name === "srcset") {
    const candidates = srcsetCandidates(value);
    return (
      candidates.length > 0 && candidates.every((candidate) => resolvedUrls.has(candidate.url))
    );
  }
  return resolvedUrls.has(value.trim());
}

export function sanitizeFrameContent(
  root: ParentNode,
  preserveResolvedResources = false,
  resolvedUrls?: ReadonlySet<string>,
): boolean {
  let resourceBlocked = false;
  for (const element of root.querySelectorAll(
    "base,iframe,object,embed,script,meta,link,frame,portal",
  )) {
    element.remove();
  }
  for (const form of root.querySelectorAll("form")) form.replaceWith(...[...form.childNodes]);
  for (const element of root.querySelectorAll<Element>("*")) {
    const localName = normalizedElementName(element);
    if (isTemplateElement(element)) {
      const templateBlocked = sanitizeFrameContent(
        element.content,
        preserveResolvedResources,
        resolvedUrls,
      );
      resourceBlocked ||= templateBlocked;
    }
    if (DYNAMIC_ELEMENTS.has(localName)) {
      resourceBlocked = true;
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("shadowroot")) {
        resourceBlocked = true;
        element.removeAttribute(attribute.name);
        continue;
      }
      const svgFragment =
        (name === "href" || name === "xlink:href") &&
        element.namespaceURI === "http://www.w3.org/2000/svg" &&
        sameDocumentFragment(attribute.value);
      if (svgFragment) element.setAttribute(attribute.name, attribute.value.trim());
      const resolved =
        preserveResolvedResources &&
        resolvedAttribute(element, name, attribute.value, resolvedUrls);
      if (hasCssResource(attribute.value, preserveResolvedResources, resolvedUrls)) {
        resourceBlocked = true;
        element.removeAttribute(attribute.name);
        continue;
      }
      if (
        name.startsWith("on") ||
        (RESOURCE_ATTRIBUTES.has(name) && !resolved && !svgFragment) ||
        name === "target"
      ) {
        if (RESOURCE_ATTRIBUTES.has(name)) {
          resourceBlocked = true;
        }
        element.removeAttribute(attribute.name);
      }
    }
    if (localName === "style") {
      const sanitized = sanitizeCss(
        element.textContent ?? "",
        preserveResolvedResources && element.namespaceURI === "http://www.w3.org/1999/xhtml",
        resolvedUrls,
      );
      resourceBlocked ||= sanitized.resourceBlocked;
      element.textContent = sanitized.css;
    }
    const style = element.getAttribute("style");
    if (style !== null) {
      const sanitized = sanitizeCss(style, preserveResolvedResources, resolvedUrls);
      resourceBlocked ||= sanitized.resourceBlocked;
      element.setAttribute("style", sanitized.css);
    }
  }
  return resourceBlocked;
}

export function bodyText(flow: HTMLElement): readonly string[] {
  const values: string[] = [];
  const walker = flow.ownerDocument.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const parent = node.parentElement;
    if (parent?.closest("style,script,template") === null) {
      const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (value !== "") values.push(value);
    }
    node = walker.nextNode();
  }
  return Object.freeze(values);
}

export function pageWarnings(warnings: readonly DocumentWarning[]): readonly PageWarning[] {
  const mapped = new Map<string, PageWarning>();
  for (const warning of warnings) {
    const code =
      warning.code === "RESOURCE_BLOCKED"
        ? "RESOURCE_BLOCKED"
        : warning.code === "UNSUPPORTED_DECORATION_TOKEN"
          ? "UNSUPPORTED_DECORATION_TOKEN"
          : warning.code === "UNSUPPORTED_BREAK_VALUE"
            ? "UNSUPPORTED_LAYOUT"
            : undefined;
    if (code === undefined || mapped.has(code)) continue;
    mapped.set(
      code,
      Object.freeze({
        code,
        message:
          code === "UNSUPPORTED_LAYOUT"
            ? "Unsupported layout declaration was ignored."
            : warning.message,
        sourceIdentity: undefined,
      }),
    );
  }
  return Object.freeze([...mapped.values()]);
}

export function appendDecoration(
  frameDocument: Document,
  target: HTMLElement,
  markup: string | undefined,
): boolean {
  if (markup === undefined) return false;
  const prepared = copyPreparedBody(frameDocument, markup);
  const holder = frameDocument.createElement("div");
  holder.append(prepared.fragment);
  const resourceBlocked = prepared.resourceBlocked || sanitizeFrameContent(holder);
  target.replaceChildren(...[...holder.childNodes]);
  return resourceBlocked;
}

export function resolveDecorationTokens(
  page: HTMLElement,
  pageNumber: number,
  totalPages: number,
): void {
  for (const token of page.querySelectorAll<HTMLElement>(".pageNumber")) {
    token.textContent = String(pageNumber);
  }
  for (const token of page.querySelectorAll<HTMLElement>(".totalPages")) {
    token.textContent = String(totalPages);
  }
}
