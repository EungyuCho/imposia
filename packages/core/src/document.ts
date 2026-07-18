import { type DefaultTreeAdapterTypes, parse, serialize } from "parse5";
import { normalizeCss, normalizeInlineCss } from "./css-contracts.js";
import {
  attribute,
  enforceResourcePolicy,
  isTemplate,
  nodeOrder,
  removeNode,
  sanitizeMarkup,
  visitElements,
} from "./html-policy.js";

export { assertFileWithinRoot, validateRenderInput, withTimeout } from "./input-boundary.js";

import type { RenderWarning } from "./types.js";
import { createWarningCollector, type WarningCollector } from "./warnings.js";

type Document = DefaultTreeAdapterTypes.Document;
type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

export interface PrepareDocumentOptions {
  headerTemplate?: string;
  footerTemplate?: string;
  allowRemoteResources?: boolean;
}

export interface PreparedDocument {
  html: string;
  headerTemplate?: string;
  footerTemplate?: string;
  warnings: RenderWarning[];
}

function textContent(element: Element): string {
  return element.childNodes
    .filter((node): node is DefaultTreeAdapterTypes.TextNode => node.nodeName === "#text")
    .map((node) => node.value)
    .join("");
}

function setTextContent(element: Element, value: string): void {
  element.childNodes = [{ nodeName: "#text", value, parentNode: element }];
}

function decorationMarkup(
  markup: string,
  sourceIndex: number,
  order: number,
  warnings: WarningCollector,
): string {
  const knownTokens = new Map([
    ["{{pageNumber}}", '<span class="pageNumber"></span>'],
    ["{{totalPages}}", '<span class="totalPages"></span>'],
  ]);
  let output = markup;
  for (const [token, replacement] of knownTokens) output = output.split(token).join(replacement);
  for (const match of markup.matchAll(/{{[^{}]+}}/g)) {
    const token = match[0];
    if (knownTokens.has(token)) continue;
    warnings.add(
      {
        code: "UNSUPPORTED_DECORATION_TOKEN",
        message: "Unsupported decoration token was left unchanged.",
        feature: "page-decoration",
        value: token,
        sourceIndex,
      },
      order + (match.index ?? 0),
    );
  }
  return output;
}

interface EmbeddedDecoration {
  markup: string;
  order: number;
}

function renderDecoration(
  source: EmbeddedDecoration | undefined,
  sourceIndex: number,
  options: PrepareDocumentOptions,
  warnings: WarningCollector,
): string | undefined {
  if (source === undefined) return undefined;
  const sanitized = sanitizeMarkup(source.markup, options, warnings, source.order);
  return decorationMarkup(sanitized, sourceIndex, source.order, warnings);
}

function extractDecorations(
  document: Document,
  options: PrepareDocumentOptions,
  warnings: WarningCollector,
): Pick<PreparedDocument, "headerTemplate" | "footerTemplate"> {
  let embeddedHeader: EmbeddedDecoration | undefined;
  let embeddedFooter: EmbeddedDecoration | undefined;
  visitElements(document, (element, parent) => {
    if (!isTemplate(element)) return;
    const isHeader = attribute(element, "data-page-header") !== undefined;
    const isFooter = attribute(element, "data-page-footer") !== undefined;
    if (!isHeader && !isFooter) return;
    const decoration = { markup: serialize(element.content), order: nodeOrder(element) };
    if (isHeader && embeddedHeader === undefined) embeddedHeader = decoration;
    if (isFooter && embeddedFooter === undefined) embeddedFooter = decoration;
    removeNode(parent, element);
  });

  if (options.headerTemplate !== undefined && embeddedHeader !== undefined) {
    warnings.add(
      {
        code: "OVERRIDDEN_EMBEDDED_HEADER",
        message: "headerTemplate option overrides embedded header template.",
        feature: "page-decoration",
        sourceIndex: 0,
      },
      embeddedHeader.order,
    );
  }
  if (options.footerTemplate !== undefined && embeddedFooter !== undefined) {
    warnings.add(
      {
        code: "OVERRIDDEN_EMBEDDED_FOOTER",
        message: "footerTemplate option overrides embedded footer template.",
        feature: "page-decoration",
        sourceIndex: 1,
      },
      embeddedFooter.order,
    );
  }

  const apiOrder = Number.MAX_SAFE_INTEGER - 1000;
  const header =
    options.headerTemplate === undefined
      ? embeddedHeader
      : { markup: options.headerTemplate, order: apiOrder };
  const footer =
    options.footerTemplate === undefined
      ? embeddedFooter
      : { markup: options.footerTemplate, order: apiOrder + 1 };
  const headerTemplate = renderDecoration(header, 0, options, warnings);
  const footerTemplate = renderDecoration(footer, 1, options, warnings);
  return {
    ...(headerTemplate === undefined ? {} : { headerTemplate }),
    ...(footerTemplate === undefined ? {} : { footerTemplate }),
  };
}

function normalizeStyles(document: ParentNode, warnings: WarningCollector): void {
  visitElements(document, (element) => {
    const order = nodeOrder(element);
    if (element.tagName === "style") {
      setTextContent(element, normalizeCss(textContent(element), warnings, order));
    }
    const style = element.attrs.find((item) => item.name.toLowerCase() === "style");
    if (style !== undefined) style.value = normalizeInlineCss(style.value, warnings, order);
  });
}

export function prepareDocument(
  html: string,
  options: PrepareDocumentOptions = {},
): PreparedDocument {
  const warnings = createWarningCollector();
  const document = parse(html, { sourceCodeLocationInfo: true });
  const decorations = extractDecorations(document, options, warnings);
  normalizeStyles(document, warnings);
  enforceResourcePolicy(document, options, warnings);
  const serialized = serialize(document);
  const normalizedHtml = /^<!doctype html>/i.test(serialized)
    ? serialized
    : `<!DOCTYPE html>${serialized}`;
  return { html: normalizedHtml, ...decorations, warnings: warnings.finish() };
}
