import { type DefaultTreeAdapterTypes, parseFragment, serialize } from "parse5";
import type { PrepareDocumentOptions } from "./document.js";
import type { WarningCollector } from "./warnings.js";

type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;
type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type Template = DefaultTreeAdapterTypes.Template;

export function isElement(node: ChildNode): node is Element {
  return "tagName" in node;
}

export function isTemplate(node: Element): node is Template {
  return node.tagName === "template" && "content" in node;
}

export function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

export function removeNode(parent: ParentNode, node: ChildNode): void {
  parent.childNodes = parent.childNodes.filter((child) => child !== node);
}

export function visitElements(
  parent: ParentNode,
  visitor: (element: Element, parent: ParentNode) => void,
): void {
  for (const node of [...parent.childNodes]) {
    if (!isElement(node)) continue;
    visitor(node, parent);
    if (!parent.childNodes.includes(node)) continue;
    if (isTemplate(node)) visitElements(node.content, visitor);
    else visitElements(node, visitor);
  }
}

export function nodeOrder(element: Element, fallback = Number.MAX_SAFE_INTEGER): number {
  return element.sourceCodeLocation?.startOffset ?? fallback;
}

export function enforceResourcePolicy(
  root: ParentNode,
  options: PrepareDocumentOptions,
  warnings: WarningCollector,
  baseOrder = 0,
): void {
  let warningIndex = 0;
  visitElements(root, (element, parent) => {
    const order = baseOrder + nodeOrder(element, warningIndex);
    const refreshMeta =
      element.tagName === "meta" &&
      attribute(element, "http-equiv")?.trim().toLowerCase() === "refresh";
    if (["script", "iframe", "object", "embed"].includes(element.tagName) || refreshMeta) {
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
      removeNode(parent, element);
      return;
    }

    const retained = [];
    for (const item of element.attrs) {
      if (item.name.toLowerCase().startsWith("on")) {
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
        continue;
      }

      if (["href", "src", "poster", "action", "formaction"].includes(item.name.toLowerCase())) {
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
          continue;
        }
      }
      retained.push(item);
    }
    element.attrs = retained;
  });
}

export function sanitizeMarkup(
  markup: string,
  options: PrepareDocumentOptions,
  warnings: WarningCollector,
  baseOrder: number,
): string {
  const fragment = parseFragment(markup, { sourceCodeLocationInfo: true });
  enforceResourcePolicy(fragment, options, warnings, baseOrder);
  return serialize(fragment);
}
