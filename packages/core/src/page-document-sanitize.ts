import postcss from "postcss";
import { prepareDocument } from "./document.js";
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
  if (value === null || typeof value !== "object") return false;
  if (!("nodeType" in value)) return false;
  return value.nodeType === 1 || value.nodeType === 11;
}

export function serializeLightDom(source: Element | DocumentFragment): string {
  return new XMLSerializer().serializeToString(source);
}

export function sourceHtml(source: PageSource): string {
  if ("html" in source) {
    if (typeof source.html !== "string") throw new TypeError("Page source html must be a string.");
    if (source.baseUrl !== undefined) {
      throw new Error("Page source baseUrl is not implemented in the browser vertical slice.");
    }
    return source.html;
  }
  if ("lightDom" in source && isLightDomSource(source.lightDom)) {
    if (source.baseUrl !== undefined) {
      throw new Error("Page source baseUrl is not implemented in the browser vertical slice.");
    }
    return serializeLightDom(source.lightDom);
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

function hasCssResource(value: string): boolean {
  const decoded = decodeCssEscapes(value);
  return /\b(?:url|image-set|cross-fade|local)\s*\(/i.test(decoded);
}

function normalizedElementName(element: Element): string {
  return (element.localName || element.tagName).toLowerCase();
}

function isTemplateElement(element: Element): element is HTMLTemplateElement {
  return normalizedElementName(element) === "template" && "content" in element;
}

export function sanitizeCss(css: string): SanitizedCss {
  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(css);
  } catch {
    return { css: "", resourceBlocked: true };
  }

  let resourceBlocked = false;
  root.walkAtRules((rule) => {
    const name = decodeCssEscapes(rule.name).toLowerCase();
    if (["import", "font-face", "namespace"].includes(name) || hasCssResource(rule.toString())) {
      resourceBlocked = true;
      rule.remove();
    }
  });
  root.walkDecls((declaration) => {
    const property = decodeCssEscapes(declaration.prop).toLowerCase();
    if (property === "src" || hasCssResource(declaration.value)) {
      resourceBlocked = true;
      declaration.remove();
    }
  });
  return { css: root.toString(), resourceBlocked };
}

export function copyPreparedBody(frameDocument: Document, html: string): PreparedFragment {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const headResourceBlocked = sanitizeFrameContent(parsed.head);
  const bodyResourceBlocked = sanitizeFrameContent(parsed.body);
  const fragment = frameDocument.createDocumentFragment();
  for (const style of [...parsed.head.querySelectorAll("style")]) {
    fragment.append(frameDocument.importNode(style, true));
  }
  for (const child of [...parsed.body.childNodes]) {
    fragment.append(frameDocument.importNode(child, true));
  }
  return { fragment, resourceBlocked: headResourceBlocked || bodyResourceBlocked };
}

export function sanitizeFrameContent(root: ParentNode): boolean {
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
      const templateBlocked = sanitizeFrameContent(element.content);
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
      if (hasCssResource(attribute.value)) {
        resourceBlocked = true;
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name.startsWith("on") || RESOURCE_ATTRIBUTES.has(name) || name === "target") {
        if (RESOURCE_ATTRIBUTES.has(name)) {
          resourceBlocked = true;
        }
        element.removeAttribute(attribute.name);
      }
    }
    if (localName === "style") {
      const sanitized = sanitizeCss(element.textContent ?? "");
      resourceBlocked ||= sanitized.resourceBlocked;
      element.textContent = sanitized.css;
    }
    const style = element.getAttribute("style");
    if (style !== null) {
      const sanitized = sanitizeCss(style);
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

export { prepareDocument };
