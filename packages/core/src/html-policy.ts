import type { PrepareDocumentOptions } from "./document.js";
import type { WarningCollector } from "./warnings.js";

const ELEMENT_NODE = 1;

/**
 * Spacing between consecutive element orders. Warning orders interleave an
 * element's document-order slot with intra-element character offsets (CSS
 * declaration offsets, decoration token offsets), so the stride must exceed
 * any intra-element offset. It comfortably exceeds the 5 MiB default input
 * ceiling while keeping the largest composed order far below
 * Number.MAX_SAFE_INTEGER.
 */
const NODE_ORDER_STRIDE = 2 ** 24;

const nodeOrders = new WeakMap<Element, number>();

let cachedInertDocument: Document | undefined;

/**
 * A parser-created document without a browsing context: scripts never execute
 * and subresources are never fetched while markup lives in it.
 */
function inertDocument(): Document {
  cachedInertDocument ??= new DOMParser().parseFromString("", "text/html");
  return cachedInertDocument;
}

export function parseHtmlDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * Parses markup in a `<template>` context (matching how fragments were parsed
 * before: parse5's context-free parseFragment also used a template context),
 * so table fragments such as `<tr>`/`<td>` survive.
 */
export function parseInertFragment(markup: string): HTMLTemplateElement {
  const template = inertDocument().createElement("template");
  template.innerHTML = markup;
  return template;
}

export function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

export function isTemplate(element: Element): element is HTMLTemplateElement {
  return element.localName === "template" && "content" in element;
}

export function attribute(element: Element, name: string): string | undefined {
  return element.getAttribute(name) ?? undefined;
}

export function visitElements(
  parent: ParentNode,
  visitor: (element: Element, parent: ParentNode) => void,
): void {
  for (const node of [...parent.childNodes]) {
    if (!isElement(node)) continue;
    visitor(node, parent);
    if (node.parentNode !== parent) continue;
    if (isTemplate(node)) visitElements(node.content, visitor);
    else visitElements(node, visitor);
  }
}

/**
 * Assigns every element under the root (template contents included) its
 * document-order slot. Orders survive later tree mutations, so they keep
 * reflecting the authored order even after nodes move or leave the tree.
 */
export function assignNodeOrders(root: ParentNode): void {
  let index = 0;
  visitElements(root, (element) => {
    nodeOrders.set(element, index * NODE_ORDER_STRIDE);
    index += 1;
  });
}

/**
 * The element's authored document-order slot. Before the parse5 removal this
 * was the element's source character offset; both keys produce the same
 * ordering except for parser error-recovery moves (for example
 * foster-parented table content), where document order after recovery wins.
 */
export function nodeOrder(element: Element, fallback = Number.MAX_SAFE_INTEGER): number {
  return nodeOrders.get(element) ?? fallback;
}

export function enforceResourcePolicy(
  root: ParentNode,
  options: PrepareDocumentOptions,
  warnings: WarningCollector,
  baseOrder = 0,
): void {
  let warningIndex = 0;
  visitElements(root, (element) => {
    const order = baseOrder + nodeOrder(element, warningIndex);
    const refreshMeta =
      element.localName === "meta" &&
      attribute(element, "http-equiv")?.trim().toLowerCase() === "refresh";
    if (["script", "iframe", "object", "embed"].includes(element.localName) || refreshMeta) {
      if (
        warnings.add(
          {
            code: "SCRIPT_REMOVED",
            message: "Executable content was removed.",
            feature: "security",
            sourceIndex: warningIndex,
          },
          order,
        )
      ) {
        warningIndex += 1;
      }
      element.remove();
      return;
    }

    for (const item of [...element.attributes]) {
      const name = item.name.toLowerCase();
      if (name.startsWith("on")) {
        if (
          warnings.add(
            {
              code: "SCRIPT_REMOVED",
              message: "Executable content was removed.",
              feature: "security",
              sourceIndex: warningIndex,
            },
            order,
          )
        ) {
          warningIndex += 1;
        }
        element.removeAttribute(item.name);
        continue;
      }

      if (["href", "src", "poster", "action", "formaction"].includes(name)) {
        const value = item.value.trim();
        const unsafe = /^javascript:/i.test(value) || /^data:text\/html/i.test(value);
        const remote = /^https?:\/\//i.test(value);
        if (unsafe || (remote && !options.allowRemoteResources)) {
          if (
            warnings.add(
              {
                code: "RESOURCE_BLOCKED",
                message: "Resource was blocked by the loading policy.",
                feature: "resource-policy",
                value,
                sourceIndex: warningIndex,
              },
              order,
            )
          ) {
            warningIndex += 1;
          }
          element.removeAttribute(item.name);
        }
      }
    }
  });
}

export function sanitizeMarkup(
  markup: string,
  options: PrepareDocumentOptions,
  warnings: WarningCollector,
  baseOrder: number,
): string {
  const template = parseInertFragment(markup);
  assignNodeOrders(template.content);
  enforceResourcePolicy(template.content, options, warnings, baseOrder);
  return template.innerHTML;
}
