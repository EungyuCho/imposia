import { sameDocumentFragment, srcsetCandidates } from "./page-document-assets-html.js";
import { hasCssResource, sanitizeCss } from "./page-document-sanitize-css.js";
import { safeSemanticHyperlink } from "./page-document-sanitize-resolver-input.js";

export { sanitizeCss } from "./page-document-sanitize-css.js";
export { sanitizeAssetResolverInput } from "./page-document-sanitize-resolver-input.js";

import type { PageLimits, PageSource, PageWarning } from "./page-document-types.js";
import type { DocumentWarning } from "./warnings.js";

export const DEFAULT_MAX_INPUT_BYTES = 5 * 1024 * 1024;

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

function normalizedElementName(element: Element): string {
  return (element.localName || element.tagName).toLowerCase();
}

function isTemplateElement(element: Element): element is HTMLTemplateElement {
  return normalizedElementName(element) === "template" && "content" in element;
}

export function copyPreparedBody(
  frameDocument: Document,
  html: string,
  preserveResolvedResources = false,
  resolvedUrls?: ReadonlySet<string>,
  preserveSafeHyperlinks = false,
): PreparedFragment {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const headResourceBlocked = sanitizeFrameContent(
    parsed.head,
    preserveResolvedResources,
    resolvedUrls,
    preserveSafeHyperlinks,
  );
  const bodyResourceBlocked = sanitizeFrameContent(
    parsed.body,
    preserveResolvedResources,
    resolvedUrls,
    preserveSafeHyperlinks,
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
  preserveSafeHyperlinks = false,
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
        preserveSafeHyperlinks,
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
      const safeFragment =
        (name === "href" || name === "xlink:href") && sameDocumentFragment(attribute.value);
      if (safeFragment) element.setAttribute(attribute.name, attribute.value.trim());
      const safeHyperlink =
        preserveSafeHyperlinks &&
        name === "href" &&
        (localName === "a" || localName === "area") &&
        safeSemanticHyperlink(attribute.value);
      if (safeHyperlink) element.setAttribute(attribute.name, attribute.value.trim());
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
        (RESOURCE_ATTRIBUTES.has(name) && !resolved && !safeFragment && !safeHyperlink) ||
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
    if (localName === "img" && !element.hasAttribute("src") && !element.hasAttribute("srcset")) {
      element.remove();
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
          : warning.code === "UNSUPPORTED_BREAK_VALUE" || warning.code === "UNSUPPORTED_CSS_FEATURE"
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
  append = false,
): boolean {
  if (markup === undefined) return false;
  const prepared = copyPreparedBody(frameDocument, markup);
  const holder = frameDocument.createElement("div");
  holder.append(prepared.fragment);
  const resourceBlocked = prepared.resourceBlocked || sanitizeFrameContent(holder);
  const nodes = [...holder.childNodes];
  if (append) target.append(...nodes);
  else target.replaceChildren(...nodes);
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
