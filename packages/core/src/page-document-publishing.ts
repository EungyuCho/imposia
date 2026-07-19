import postcss, { type Declaration, type Rule } from "postcss";
import { ImposiaError } from "./errors.js";
import type {
  EffectivePageLimits,
  ExperimentalPageFeatures,
  PageGeometry,
  PageWarning,
} from "./page-document-types.js";
import type { WarningCollector } from "./warnings.js";

const SOURCE_KEY = "data-imposia-publishing-source";
const GENERATED_KEY = "data-imposia-publishing-generated";
const FOOTNOTE_CALL_KEY = "data-imposia-publishing-footnote-call";
const CSS_IDENTIFIER = /^-?(?:[_a-z]|[^\0-\x7f])(?:[-_a-z0-9]|[^\0-\x7f])*$/i;

type TargetKind = "target-counter" | "target-text";
type TargetPosition = "before" | "after";
type StringPosition = "first" | "start" | "last";
type SelectorSpecificity = readonly [ids: number, classes: number, elements: number];
type StringSource =
  | Readonly<{ type: "content" }>
  | Readonly<{ type: "attribute"; name: string }>
  | Readonly<{ type: "literal"; value: string }>;

export type PublishingCssRule =
  | Readonly<{
      type: "target";
      selector: string;
      position: TargetPosition;
      kind: TargetKind;
      markerStyle: string;
      important: boolean;
      specificity: SelectorSpecificity;
      order: number;
    }>
  | Readonly<{
      type: "content";
      selector: string;
      position: TargetPosition;
      important: boolean;
      specificity: SelectorSpecificity;
      order: number;
      blocksTarget: boolean;
    }>
  | Readonly<{
      type: "string";
      selector: string;
      name: string;
      source: StringSource;
      order: number;
    }>
  | Readonly<{
      type: "placement";
      selector: string;
      float: "footnote" | "top" | "bottom" | undefined;
      pageReference: boolean | undefined;
      order: number;
    }>;

type ContentPublishingCssRule = Extract<PublishingCssRule, { readonly type: "target" | "content" }>;

export interface ExtractedPublishingCss {
  readonly css: string;
  readonly rules: readonly PublishingCssRule[];
  readonly nextOrder: number;
}

interface TargetBinding {
  readonly key: string;
  readonly hostKey: string;
  readonly sourceOrder: number;
  readonly position: TargetPosition;
  readonly kind: TargetKind;
  readonly targetId: string | undefined;
  readonly markerStyle: string;
}

interface StringBinding {
  readonly sourceKey: string;
  readonly sourceOrder: number;
  readonly name: string;
  readonly value: string;
}

interface FootnoteBinding {
  readonly key: string;
  readonly sourceKey: string;
  readonly sourceOrder: number;
  readonly value: string;
  readonly number: number;
}

interface PageFloatBinding {
  readonly key: string;
  readonly sourceKey: string;
  readonly sourceOrder: number;
  readonly kind: "top" | "bottom";
  readonly pageReference: boolean;
}

export interface PreparedPublishingContent {
  readonly targets: readonly TargetBinding[];
  readonly strings: readonly StringBinding[];
  readonly footnotes: readonly FootnoteBinding[];
  readonly pageFloats: readonly PageFloatBinding[];
  readonly duplicateIds: ReadonlyMap<string, number>;
  readonly requiresConvergence: boolean;
}

export interface PublishingPage {
  readonly page: HTMLElement;
  readonly flow: HTMLElement;
  readonly geometry: PageGeometry;
}

export interface FinalizedPublishingContent {
  readonly generatedValues: ReadonlyMap<string, string>;
  readonly namedStrings: readonly ReadonlyMap<string, string>[];
  readonly warnings: readonly PageWarning[];
  readonly signature: string;
}

function declarationOrder(declaration: Declaration, baseOrder: number, fallback: number): number {
  return baseOrder + (declaration.source?.start?.offset ?? fallback);
}

function targetKind(value: string): TargetKind | undefined {
  if (/^target-counter\(\s*attr\(\s*href\s*\)\s*,\s*page\s*\)$/i.test(value.trim())) {
    return "target-counter";
  }
  if (/^target-text\(\s*attr\(\s*href\s*\)\s*,\s*content\s*\)$/i.test(value.trim())) {
    return "target-text";
  }
  return undefined;
}

function selectorNameEnd(value: string, start: number): number {
  let index = start;
  while (index < value.length) {
    const character = value[index] ?? "";
    if (character === "\\") {
      index += Math.min(2, value.length - index);
      continue;
    }
    if (/[_a-z0-9\u0080-\uffff-]/iu.test(character)) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function skipSelectorBlock(value: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | undefined;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (quote !== undefined) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "/" && value[index + 1] === "*") {
      const commentEnd = value.indexOf("*/", index + 2);
      index = commentEnd === -1 ? value.length : commentEnd + 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return value.length;
}

function maxSpecificity(
  left: SelectorSpecificity,
  right: SelectorSpecificity,
): SelectorSpecificity {
  return compareSpecificity(left, right) >= 0 ? left : right;
}

function nthSelectorList(value: string): string | undefined {
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (quote !== undefined) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "/" && value[index + 1] === "*") {
      const commentEnd = value.indexOf("*/", index + 2);
      index = commentEnd === -1 ? value.length : commentEnd + 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "(" || character === "[") {
      depth += 1;
      continue;
    }
    if (character === ")" || character === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (
      depth === 0 &&
      value.slice(index, index + 2).toLowerCase() === "of" &&
      /\s/u.test(value[index - 1] ?? "") &&
      /\s/u.test(value[index + 2] ?? "")
    ) {
      const selectors = value.slice(index + 2).trim();
      return selectors === "" ? undefined : selectors;
    }
  }
  return undefined;
}

function selectorSpecificity(selector: string): SelectorSpecificity {
  let ids = 0;
  let classes = 0;
  let elements = 0;
  let index = 0;
  while (index < selector.length) {
    const character = selector[index] ?? "";
    if (character === "\\") {
      index += Math.min(2, selector.length - index);
      continue;
    }
    if (character === "/" && selector[index + 1] === "*") {
      const commentEnd = selector.indexOf("*/", index + 2);
      index = commentEnd === -1 ? selector.length : commentEnd + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      index = skipSelectorBlock(selector, index, character, character);
      continue;
    }
    if (character === "[") {
      classes += 1;
      index = skipSelectorBlock(selector, index, "[", "]");
      continue;
    }
    if (character === "#") {
      const end = selectorNameEnd(selector, index + 1);
      if (end > index + 1) ids += 1;
      index = end;
      continue;
    }
    if (character === ".") {
      const end = selectorNameEnd(selector, index + 1);
      if (end > index + 1) classes += 1;
      index = end;
      continue;
    }
    if (character === ":") {
      const pseudoElement = selector[index + 1] === ":";
      const nameStart = index + (pseudoElement ? 2 : 1);
      const nameEnd = selectorNameEnd(selector, nameStart);
      if (nameEnd > nameStart) {
        if (pseudoElement) {
          elements += 1;
        } else if (selector[nameEnd] === "(") {
          const end = skipSelectorBlock(selector, nameEnd, "(", ")");
          const argumentEnd = end > nameEnd && selector[end - 1] === ")" ? end - 1 : end;
          const name = selector.slice(nameStart, nameEnd).toLowerCase();
          if (name === "is" || name === "not" || name === "has") {
            let argumentSpecificity: SelectorSpecificity = Object.freeze([0, 0, 0]);
            for (const argument of splitSelectors(selector.slice(nameEnd + 1, argumentEnd))) {
              argumentSpecificity = maxSpecificity(
                argumentSpecificity,
                selectorSpecificity(argument),
              );
            }
            ids += argumentSpecificity[0];
            classes += argumentSpecificity[1];
            elements += argumentSpecificity[2];
          } else if (name === "nth-child" || name === "nth-last-child") {
            classes += 1;
            const selectorList = nthSelectorList(selector.slice(nameEnd + 1, argumentEnd));
            let argumentSpecificity: SelectorSpecificity = Object.freeze([0, 0, 0]);
            for (const argument of splitSelectors(selectorList ?? "")) {
              argumentSpecificity = maxSpecificity(
                argumentSpecificity,
                selectorSpecificity(argument),
              );
            }
            ids += argumentSpecificity[0];
            classes += argumentSpecificity[1];
            elements += argumentSpecificity[2];
          } else if (name !== "where") classes += 1;
          index = end;
          continue;
        } else {
          classes += 1;
        }
      }
      index = nameEnd;
      continue;
    }
    if (/[a-z_\u0080-\uffff]/iu.test(character)) {
      index = selectorNameEnd(selector, index);
      elements += 1;
      continue;
    }
    index += 1;
  }
  return Object.freeze([ids, classes, elements]);
}

function compareSpecificity(left: SelectorSpecificity, right: SelectorSpecificity): number {
  for (const [index, value] of left.entries()) {
    const other = right[index] ?? 0;
    if (value !== other) return value - other;
  }
  return 0;
}

function contentRuleWins(
  candidate: Pick<ContentPublishingCssRule, "important" | "specificity" | "order">,
  current: Pick<ContentPublishingCssRule, "important" | "specificity" | "order">,
): boolean {
  if (candidate.important !== current.important) return candidate.important;
  const specificity = compareSpecificity(candidate.specificity, current.specificity);
  if (specificity !== 0) return specificity > 0;
  return candidate.order >= current.order;
}

function splitSelectors(value: string): readonly string[] {
  const selectors: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== undefined) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "/" && value[index + 1] === "*") {
      const commentEnd = value.indexOf("*/", index + 2);
      index = commentEnd === -1 ? value.length : commentEnd + 1;
      continue;
    }
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      selectors.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(value.slice(start).trim());
  return selectors.filter((selector) => selector !== "");
}

function targetSelectors(value: string):
  | readonly Readonly<{
      selector: string;
      position: TargetPosition;
      specificity: SelectorSpecificity;
    }>[]
  | undefined {
  const result: Readonly<{
    selector: string;
    position: TargetPosition;
    specificity: SelectorSpecificity;
  }>[] = [];
  for (const selector of splitSelectors(value)) {
    const match = /^(.*)::(before|after)\s*$/i.exec(selector);
    const host = match?.[1]?.trim();
    const position = match?.[2]?.toLowerCase();
    if (host === undefined || host === "" || (position !== "before" && position !== "after")) {
      return undefined;
    }
    result.push(
      Object.freeze({
        selector: host,
        position,
        specificity: selectorSpecificity(host),
      }),
    );
  }
  return Object.freeze(result);
}

function decodeCssString(value: string): string | undefined {
  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value.at(-1) !== quote) return undefined;
  let output = "";
  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      if (character === "\n" || character === "\r" || character === "\f") return undefined;
      output += character ?? "";
      continue;
    }
    let end = index + 1;
    while (end < value.length - 1 && end < index + 7 && /[0-9a-f]/i.test(value[end] ?? "")) {
      end += 1;
    }
    if (end > index + 1) {
      const codePoint = Number.parseInt(value.slice(index + 1, end), 16);
      output += codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "�";
      if (/\s/.test(value[end] ?? "")) end += 1;
      index = end - 1;
      continue;
    }
    const escaped = value[index + 1];
    if (escaped === undefined) return undefined;
    output += escaped;
    index += 1;
  }
  return output;
}

function parseStringSet(
  value: string,
): Readonly<{ name: string; source: StringSource }> | undefined {
  const match = /^(\S+)\s+([\s\S]+)$/u.exec(value.trim());
  const name = match?.[1];
  const sourceValue = match?.[2]?.trim();
  if (name === undefined || sourceValue === undefined || !CSS_IDENTIFIER.test(name)) {
    return undefined;
  }
  if (/^content\(\s*\)$/i.test(sourceValue)) {
    return Object.freeze({ name, source: Object.freeze({ type: "content" }) });
  }
  const attribute = /^attr\(\s*([^\s)]+)\s*\)$/i.exec(sourceValue)?.[1];
  if (attribute !== undefined && CSS_IDENTIFIER.test(attribute)) {
    return Object.freeze({
      name,
      source: Object.freeze({ type: "attribute", name: attribute }),
    });
  }
  const literal = decodeCssString(sourceValue);
  return literal === undefined
    ? undefined
    : Object.freeze({ name, source: Object.freeze({ type: "literal", value: literal }) });
}

function placementFloat(value: string): "footnote" | "top" | "bottom" | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized === "footnote" || normalized === "top" || normalized === "bottom"
    ? normalized
    : undefined;
}

function targetMarkerStyle(rule: Rule, content: Declaration): string {
  return rule.nodes
    .filter(
      (node): node is Declaration =>
        node.type === "decl" && node.prop.toLowerCase() !== "content" && node !== content,
    )
    .map((declaration) => declaration.toString())
    .join(";");
}

function winningContentDeclaration(declarations: readonly Declaration[]): Declaration | undefined {
  let winner: Declaration | undefined;
  for (const declaration of declarations) {
    if (declaration.prop.toLowerCase() !== "content") continue;
    if (winner === undefined || declaration.important || !winner.important) winner = declaration;
  }
  return winner;
}

function unsupportedPublishingDeclaration(
  warnings: WarningCollector,
  declaration: Declaration,
  order: number,
): void {
  warnings.add(
    {
      code: "UNSUPPORTED_CSS_FEATURE",
      message: "Unsupported generated publishing syntax was ignored.",
      feature: "css-generated-publishing",
      property: declaration.prop.toLowerCase(),
      value: declaration.value.trim(),
      recovery: "The declaration was removed without approximation.",
      sourceIndex: order,
    },
    order,
  );
  declaration.remove();
}

function unsupportedConditionalContent(
  warnings: WarningCollector,
  declaration: Declaration,
  order: number,
): void {
  warnings.add(
    {
      code: "UNSUPPORTED_CSS_FEATURE",
      message:
        "Conditional pseudo-element content cannot be cascaded with generated publishing content.",
      feature: "css-generated-publishing",
      property: declaration.prop.toLowerCase(),
      value: declaration.value.trim(),
      recovery: "Generated publishing content was suppressed for matching pseudo-elements.",
      sourceIndex: order,
    },
    order,
  );
}

export function extractPublishingCss(
  css: string,
  startOrder: number,
  warnings: WarningCollector,
): ExtractedPublishingCss {
  const root = postcss.parse(css);
  const rules: PublishingCssRule[] = [];
  let nextOrder = startOrder;
  root.walkRules((rule) => {
    let declarations = rule.nodes.filter((node): node is Declaration => node.type === "decl");
    if (rule.parent?.type !== "root") {
      for (const declaration of declarations) {
        if (
          declaration.prop.toLowerCase() === "content" &&
          /\btarget-(?:counter|text)\s*\(/i.test(declaration.value)
        ) {
          unsupportedPublishingDeclaration(
            warnings,
            declaration,
            declarationOrder(declaration, startOrder, nextOrder),
          );
        }
      }
      declarations = rule.nodes.filter((node): node is Declaration => node.type === "decl");
    }
    const content = winningContentDeclaration(declarations);
    const generated = content === undefined ? undefined : targetKind(content.value);
    const selectors = content === undefined ? undefined : targetSelectors(rule.selector);
    if (
      content !== undefined &&
      generated === undefined &&
      selectors !== undefined &&
      rule.parent?.type !== "root"
    ) {
      unsupportedConditionalContent(
        warnings,
        content,
        declarationOrder(content, startOrder, nextOrder),
      );
      for (const target of selectors) {
        rules.push(
          Object.freeze({
            type: "content",
            selector: target.selector,
            position: target.position,
            important: content.important === true,
            specificity: target.specificity,
            order: declarationOrder(content, startOrder, nextOrder),
            blocksTarget: true,
          }),
        );
        nextOrder += 1;
      }
    }
    if (content !== undefined && generated !== undefined && selectors !== undefined) {
      const markerStyle = targetMarkerStyle(rule, content);
      for (const target of selectors) {
        rules.push(
          Object.freeze({
            type: "target",
            selector: target.selector,
            position: target.position,
            kind: generated,
            markerStyle,
            important: content.important === true,
            specificity: target.specificity,
            order: declarationOrder(content, startOrder, nextOrder),
          }),
        );
        nextOrder += 1;
      }
      for (const node of [...rule.nodes]) {
        if (node !== content) node.remove();
      }
      content.value = "none";
      return;
    }
    if (
      content !== undefined &&
      content.parent !== undefined &&
      /\btarget-(?:counter|text)\s*\(/i.test(content.value)
    ) {
      unsupportedPublishingDeclaration(
        warnings,
        content,
        declarationOrder(content, startOrder, nextOrder),
      );
    } else if (content !== undefined && selectors !== undefined && rule.parent?.type === "root") {
      for (const target of selectors) {
        rules.push(
          Object.freeze({
            type: "content",
            selector: target.selector,
            position: target.position,
            important: content.important === true,
            specificity: target.specificity,
            order: declarationOrder(content, startOrder, nextOrder),
            blocksTarget: false,
          }),
        );
        nextOrder += 1;
      }
    }

    let authoredFloat: "footnote" | "top" | "bottom" | undefined;
    let pageReference: boolean | undefined;
    for (const declaration of [...declarations]) {
      const property = declaration.prop.toLowerCase();
      if (property === "string-set") {
        const parsed = parseStringSet(declaration.value);
        if (parsed !== undefined) {
          rules.push(
            Object.freeze({
              type: "string",
              selector: rule.selector,
              name: parsed.name,
              source: parsed.source,
              order: declarationOrder(declaration, startOrder, nextOrder),
            }),
          );
          nextOrder += 1;
          declaration.remove();
        } else {
          unsupportedPublishingDeclaration(
            warnings,
            declaration,
            declarationOrder(declaration, startOrder, nextOrder),
          );
        }
        continue;
      }
      if (property === "float") {
        const parsed = placementFloat(declaration.value);
        if (parsed !== undefined) {
          authoredFloat = parsed;
          declaration.remove();
        }
        continue;
      }
      if (property === "float-reference" && declaration.value.trim().toLowerCase() === "page") {
        pageReference = true;
        declaration.remove();
      } else if (property === "float-reference") {
        unsupportedPublishingDeclaration(
          warnings,
          declaration,
          declarationOrder(declaration, startOrder, nextOrder),
        );
      }
    }
    if (authoredFloat !== undefined || pageReference !== undefined) {
      rules.push(
        Object.freeze({
          type: "placement",
          selector: rule.selector,
          float: authoredFloat,
          pageReference,
          order: nextOrder,
        }),
      );
      nextOrder += 1;
    }
    if (rule.nodes.length === 0) rule.remove();
  });
  return Object.freeze({ css: root.toString(), rules: Object.freeze(rules), nextOrder });
}

function matchingElements(root: ParentNode, selector: string): readonly Element[] {
  try {
    return Object.freeze([...root.querySelectorAll<Element>(selector)]);
  } catch {
    return Object.freeze([]);
  }
}

function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/gu, " ").trim();
}

function sourceValue(element: Element, source: StringSource): string {
  if (source.type === "content") return normalizedText(element);
  if (source.type === "attribute") return element.getAttribute(source.name) ?? "";
  return source.value;
}

function inlineDeclarations(element: Element): readonly Declaration[] {
  const style = element.getAttribute("style");
  if (style === null) return Object.freeze([]);
  try {
    const root = postcss.parse(`x{${style}}`);
    const rule = root.first;
    return Object.freeze(
      rule?.type === "rule"
        ? rule.nodes.filter((node): node is Declaration => node.type === "decl")
        : [],
    );
  } catch {
    return Object.freeze([]);
  }
}

function fragmentId(href: string): string | undefined {
  const trimmed = href.trim();
  if (!trimmed.startsWith("#") || trimmed.length <= 1) return undefined;
  try {
    return decodeURIComponent(trimmed.slice(1));
  } catch {
    return undefined;
  }
}

function anchorHref(element: Element): string | undefined {
  const anchor = element.matches("a[href]") ? element : element.querySelector("a[href]");
  const href = anchor?.getAttribute("href");
  return href === null || href === undefined ? undefined : fragmentId(href);
}

function generatedLimitError(kind: "record" | "fragment"): ImposiaError {
  return kind === "record"
    ? new ImposiaError("GENERATED_RECORD_LIMIT", "Generated publishing record limit exceeded.")
    : new ImposiaError("GENERATED_FRAGMENT_LIMIT", "Generated publishing fragment limit exceeded.");
}

export function preparePublishingContent(
  root: HTMLElement,
  rules: readonly PublishingCssRule[],
  limits: EffectivePageLimits,
): PreparedPublishingContent {
  const elements = [...root.querySelectorAll<Element>("*")];
  const sourceOrder = new Map<Element, number>();
  const byKey = new Map<string, Element>();
  for (const [index, element] of elements.entries()) {
    const order = index + 1;
    const key = String(order);
    sourceOrder.set(element, order);
    byKey.set(key, element);
    element.setAttribute(SOURCE_KEY, key);
  }

  const duplicateIds = new Map<string, number>();
  const firstIds = new Set<string>();
  for (const element of elements) {
    const id = element.getAttribute("id");
    if (id === null) continue;
    if (!firstIds.has(id)) {
      firstIds.add(id);
      continue;
    }
    duplicateIds.set(
      id,
      Math.min(duplicateIds.get(id) ?? Number.MAX_SAFE_INTEGER, sourceOrder.get(element) ?? 0),
    );
    element.removeAttribute("id");
  }

  interface ContentCandidate {
    readonly rule: ContentPublishingCssRule;
    readonly hostKey: string;
    readonly sourceOrder: number;
    readonly targetId: string | undefined;
  }
  const contentWinners = new Map<string, ContentCandidate>();
  const blockedContentSlots = new Set<string>();
  const stringByElementAndName = new Map<string, StringBinding>();
  type PlacementState = {
    float: "footnote" | "top" | "bottom" | undefined;
    pageReference: boolean | undefined;
  };
  const placements = new Map<Element, PlacementState>();
  for (const rule of [...rules].sort((left, right) => left.order - right.order)) {
    const matches = matchingElements(root, rule.selector);
    if (rule.type === "target" || rule.type === "content") {
      for (const element of matches) {
        const order = sourceOrder.get(element);
        if (order === undefined) continue;
        const slot = `${order}\u0000${rule.position}`;
        if (rule.type === "content" && rule.blocksTarget) {
          blockedContentSlots.add(slot);
          continue;
        }
        const candidate = Object.freeze({
          rule,
          hostKey: String(order),
          sourceOrder: order,
          targetId: anchorHref(element),
        });
        const current = contentWinners.get(slot);
        if (current === undefined || contentRuleWins(rule, current.rule)) {
          contentWinners.set(slot, candidate);
        }
      }
      continue;
    }
    if (rule.type === "string") {
      for (const element of matches) {
        const order = sourceOrder.get(element);
        if (order === undefined) continue;
        const binding = Object.freeze({
          sourceKey: String(order),
          sourceOrder: order,
          name: rule.name,
          value: sourceValue(element, rule.source),
        });
        stringByElementAndName.set(`${order}\u0000${rule.name}`, binding);
      }
      continue;
    }
    for (const element of matches) {
      const current = placements.get(element) ?? { float: undefined, pageReference: undefined };
      placements.set(element, {
        float: rule.float ?? current.float,
        pageReference: rule.pageReference ?? current.pageReference,
      });
    }
  }

  const targets: TargetBinding[] = [];
  for (const [slot, candidate] of contentWinners) {
    if (blockedContentSlots.has(slot)) continue;
    if (candidate.rule.type !== "target") continue;
    targets.push(
      Object.freeze({
        key: `target-${targets.length + 1}`,
        hostKey: candidate.hostKey,
        sourceOrder: candidate.sourceOrder,
        position: candidate.rule.position,
        kind: candidate.rule.kind,
        targetId: candidate.targetId,
        markerStyle: candidate.rule.markerStyle,
      }),
    );
  }

  for (const element of elements) {
    const order = sourceOrder.get(element);
    if (order === undefined) continue;
    let placement = placements.get(element) ?? { float: undefined, pageReference: undefined };
    for (const declaration of inlineDeclarations(element)) {
      const property = declaration.prop.toLowerCase();
      if (property === "float") {
        const parsed = placementFloat(declaration.value);
        if (parsed !== undefined) placement = { ...placement, float: parsed };
      } else if (property === "float-reference") {
        placement = {
          ...placement,
          pageReference: declaration.value.trim().toLowerCase() === "page",
        };
      } else if (property === "string-set") {
        const parsed = parseStringSet(declaration.value);
        if (parsed !== undefined) {
          stringByElementAndName.set(
            `${order}\u0000${parsed.name}`,
            Object.freeze({
              sourceKey: String(order),
              sourceOrder: order,
              name: parsed.name,
              value: sourceValue(element, parsed.source),
            }),
          );
        }
      }
    }
    placements.set(element, placement);
  }

  const footnotes: FootnoteBinding[] = [];
  const pageFloats: PageFloatBinding[] = [];
  for (const [key, element] of byKey) {
    const order = Number(key);
    const placement = placements.get(element);
    if (placement?.float === "footnote") {
      const value = element.getAttribute("data-footnote") ?? key;
      footnotes.push(
        Object.freeze({
          key: `footnote-${footnotes.length + 1}`,
          sourceKey: key,
          sourceOrder: order,
          value,
          number: footnotes.length + 1,
        }),
      );
    } else if (placement?.float === "top" || placement?.float === "bottom") {
      pageFloats.push(
        Object.freeze({
          key: `page-float-${pageFloats.length + 1}`,
          sourceKey: key,
          sourceOrder: order,
          kind: placement.float,
          pageReference: placement.pageReference === true,
        }),
      );
    }
  }

  const recordCount =
    targets.length + stringByElementAndName.size + footnotes.length + pageFloats.length;
  if (recordCount > limits.maxGeneratedRecords) throw generatedLimitError("record");
  return Object.freeze({
    targets: Object.freeze(targets),
    strings: Object.freeze([...stringByElementAndName.values()]),
    footnotes: Object.freeze(footnotes),
    pageFloats: Object.freeze(pageFloats),
    duplicateIds,
    requiresConvergence: recordCount > 0 || duplicateIds.size > 0,
  });
}

function elementBySourceKey(root: ParentNode, key: string): Element | undefined {
  return [...root.querySelectorAll<Element>(`[${SOURCE_KEY}]`)].find(
    (element) => element.getAttribute(SOURCE_KEY) === key,
  );
}

function footnoteAnchor(root: ParentNode, value: string): Element | undefined {
  return [...root.querySelectorAll<Element>("[data-footnote-anchor]")].find(
    (element) => element.getAttribute("data-footnote-anchor") === value,
  );
}

export function preparePublishingPass(
  root: HTMLElement,
  prepared: PreparedPublishingContent,
  previousValues: ReadonlyMap<string, string>,
  experimental: Readonly<ExperimentalPageFeatures>,
  limits: EffectivePageLimits,
): void {
  let generatedFragments = 0;
  const generated = () => {
    generatedFragments += 1;
    if (generatedFragments > limits.maxGeneratedFragments) throw generatedLimitError("fragment");
  };
  for (const binding of prepared.targets) {
    const host = elementBySourceKey(root, binding.hostKey);
    if (host === undefined) continue;
    const marker = root.ownerDocument.createElement("span");
    marker.setAttribute("data-imposia-generated", binding.kind);
    marker.setAttribute(GENERATED_KEY, binding.key);
    marker.textContent = previousValues.get(binding.key) ?? "";
    if (binding.markerStyle !== "") marker.setAttribute("style", binding.markerStyle);
    if (binding.position === "before") host.prepend(marker);
    else host.append(marker);
    generated();
  }
  if (experimental.footnotes !== true) return;
  for (const binding of prepared.footnotes) {
    const anchor = footnoteAnchor(root, binding.value);
    if (anchor === undefined) continue;
    const call = root.ownerDocument.createElement("sup");
    call.setAttribute("data-imposia-footnote-call", String(binding.number));
    call.setAttribute(FOOTNOTE_CALL_KEY, binding.key);
    call.textContent = String(binding.number);
    anchor.append(call);
    generated();
  }
}

function pagesElements(pages: readonly PublishingPage[]): readonly Element[] {
  return Object.freeze(pages.flatMap((page) => [...page.page.querySelectorAll<Element>("*")]));
}

function pageIndexFor(element: Element | undefined): number | undefined {
  if (element === undefined) return undefined;
  const value = element
    .closest<HTMLElement>("[data-imposia-page]")
    ?.getAttribute("data-imposia-page-number");
  const parsed = value === undefined || value === null ? Number.NaN : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed - 1 : undefined;
}

function targetText(element: Element): string {
  const values: string[] = [];
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const parent = node.parentElement;
    if (parent?.closest("[data-imposia-generated]") === null) {
      const value = (node.textContent ?? "").replace(/\s+/gu, " ").trim();
      if (value !== "") values.push(value);
    }
    node = walker.nextNode();
  }
  return values.join(" ");
}

function namedStringKey(name: string, position: StringPosition): string {
  return `${name}\u0000${position}`;
}

function pageFirstLeafOrder(page: PublishingPage): number | undefined {
  let first: number | undefined;
  for (const element of page.flow.querySelectorAll<Element>(`[${SOURCE_KEY}]`)) {
    if (element.querySelector(`[${SOURCE_KEY}]`) !== null || normalizedText(element) === "")
      continue;
    const order = Number(element.getAttribute(SOURCE_KEY));
    if (Number.isInteger(order) && (first === undefined || order < first)) first = order;
  }
  return first;
}

function resolveNamedStrings(
  pages: readonly PublishingPage[],
  prepared: PreparedPublishingContent,
): readonly ReadonlyMap<string, string>[] {
  const elements = pagesElements(pages);
  const assignments = prepared.strings
    .map((binding) => {
      const element = elements.find(
        (candidate) => candidate.getAttribute(SOURCE_KEY) === binding.sourceKey,
      );
      const pageIndex = pageIndexFor(element);
      return pageIndex === undefined ? undefined : { ...binding, pageIndex };
    })
    .filter(
      (binding): binding is StringBinding & Readonly<{ pageIndex: number }> =>
        binding !== undefined,
    )
    .sort((left, right) => left.sourceOrder - right.sourceOrder);
  const entry = new Map<string, string>();
  return Object.freeze(
    pages.map((page, pageIndex) => {
      const values = new Map<string, string>();
      const pageAssignments = assignments.filter((binding) => binding.pageIndex === pageIndex);
      const names = new Set([...entry.keys(), ...pageAssignments.map((binding) => binding.name)]);
      const firstLeaf = pageFirstLeafOrder(page);
      for (const name of names) {
        const named = pageAssignments.filter((binding) => binding.name === name);
        const first = named[0];
        const last = named.at(-1);
        const entryValue = entry.get(name) ?? "";
        const firstValue = first?.value ?? entryValue;
        const startValue =
          first !== undefined && first.sourceOrder === firstLeaf
            ? first.value
            : (entry.get(name) ?? first?.value ?? "");
        const lastValue = last?.value ?? entryValue;
        values.set(namedStringKey(name, "first"), firstValue);
        values.set(namedStringKey(name, "start"), startValue);
        values.set(namedStringKey(name, "last"), lastValue);
        entry.set(name, lastValue);
      }
      return values;
    }),
  );
}

function coreWarning(
  code: "REFERENCE_MISSING" | "REFERENCE_DUPLICATE" | "FOOTNOTE_DEFERRED" | "PAGE_FLOAT_FALLBACK",
  message: string,
  sourceIdentity: string,
  recovery: string,
): PageWarning {
  return Object.freeze({ code, message, sourceIdentity, recovery });
}

function footnoteArea(page: PublishingPage): HTMLElement {
  const existing = page.page.querySelector<HTMLElement>("[data-imposia-footnote-area]");
  if (existing !== null) return existing;
  const area = page.page.ownerDocument.createElement("div");
  area.setAttribute("data-imposia-footnote-area", "");
  area.style.position = "absolute";
  area.style.left = "var(--imposia-margin-left)";
  area.style.right = "var(--imposia-margin-right)";
  area.style.bottom = "var(--imposia-margin-bottom)";
  area.style.maxHeight = `${page.geometry.contentHeightCssPx / 3}px`;
  area.style.overflow = "hidden";
  area.style.boxSizing = "border-box";
  page.page.append(area);
  return area;
}

function placementHeight(element: HTMLElement): number {
  return Math.max(element.getBoundingClientRect().height, element.scrollHeight);
}

function htmlElement(element: Element | undefined): HTMLElement | undefined {
  return element?.namespaceURI === "http://www.w3.org/1999/xhtml"
    ? (element as HTMLElement)
    : undefined;
}

function placeFootnotes(
  pages: readonly PublishingPage[],
  prepared: PreparedPublishingContent,
  experimental: Readonly<ExperimentalPageFeatures>,
  warnings: { order: number; warning: PageWarning }[],
): void {
  const usedHeight = new Map<number, number>();
  for (const binding of prepared.footnotes) {
    const elements = pagesElements(pages).filter(
      (element) => element.getAttribute(SOURCE_KEY) === binding.sourceKey,
    );
    const calls = pagesElements(pages).filter(
      (element) => element.getAttribute(FOOTNOTE_CALL_KEY) === binding.key,
    );
    const note = elements.length === 1 ? htmlElement(elements[0]) : undefined;
    const callPage = pageIndexFor(calls[0]);
    const notePage = pageIndexFor(note);
    const page = notePage === undefined ? undefined : pages[notePage];
    const height = note === undefined ? Number.POSITIVE_INFINITY : placementHeight(note);
    const maximum =
      page?.geometry.contentHeightCssPx === undefined ? 0 : page.geometry.contentHeightCssPx / 3;
    const deferred =
      experimental.footnotes !== true ||
      note === undefined ||
      calls.length !== 1 ||
      callPage === undefined ||
      notePage === undefined ||
      notePage < callPage ||
      notePage - callPage > 2 ||
      height <= 0 ||
      height + (usedHeight.get(notePage) ?? 0) > maximum;
    if (deferred || page === undefined) {
      for (const call of calls) call.remove();
      warnings.push({
        order: binding.sourceOrder,
        warning: coreWarning(
          "FOOTNOTE_DEFERRED",
          "The authored footnote remained in normal flow.",
          `source-${binding.sourceOrder}`,
          "Footnotes require the opt-in and must fit within one third of the page content height within two pages of the anchor.",
        ),
      });
      continue;
    }
    const marker = note.ownerDocument.createElement("span");
    marker.setAttribute("data-imposia-footnote-marker", String(binding.number));
    marker.textContent = String(binding.number);
    note.prepend(marker);
    note.setAttribute("data-imposia-footnote", String(binding.number));
    footnoteArea(page).append(note);
    usedHeight.set(notePage, (usedHeight.get(notePage) ?? 0) + height);
  }
}

function placePageFloats(
  pages: readonly PublishingPage[],
  prepared: PreparedPublishingContent,
  experimental: Readonly<ExperimentalPageFeatures>,
  warnings: { order: number; warning: PageWarning }[],
): void {
  const usedHeight = new Map<string, number>();
  for (const binding of prepared.pageFloats) {
    const matches = pagesElements(pages).filter(
      (element) => element.getAttribute(SOURCE_KEY) === binding.sourceKey,
    );
    const element = matches.length === 1 ? htmlElement(matches[0]) : undefined;
    const pageIndex = pageIndexFor(element);
    const page = pageIndex === undefined ? undefined : pages[pageIndex];
    const height = element === undefined ? Number.POSITIVE_INFINITY : placementHeight(element);
    const maximum =
      page?.geometry.contentHeightCssPx === undefined ? 0 : page.geometry.contentHeightCssPx / 3;
    const usedKey = `${pageIndex ?? -1}\u0000${binding.kind}`;
    const fallback =
      experimental.pageFloats !== true ||
      !binding.pageReference ||
      element === undefined ||
      page === undefined ||
      height <= 0 ||
      height + (usedHeight.get(usedKey) ?? 0) > maximum;
    if (fallback) {
      warnings.push({
        order: binding.sourceOrder,
        warning: coreWarning(
          "PAGE_FLOAT_FALLBACK",
          "The authored page float remained in normal flow.",
          `source-${binding.sourceOrder}`,
          "Page floats require the opt-in, float-reference: page, and a bounded top or bottom placement.",
        ),
      });
      continue;
    }
    element.setAttribute("data-imposia-page-float", binding.kind);
    element.style.position = "absolute";
    element.style.left = "var(--imposia-margin-left)";
    element.style.right = "var(--imposia-margin-right)";
    if (binding.kind === "top") element.style.top = "var(--imposia-margin-top)";
    else element.style.bottom = "var(--imposia-margin-bottom)";
    element.style.maxHeight = `${maximum}px`;
    element.style.overflow = "hidden";
    page.page.append(element);
    usedHeight.set(usedKey, (usedHeight.get(usedKey) ?? 0) + height);
  }
}

function layoutSignature(
  pages: readonly PublishingPage[],
  generatedValues: ReadonlyMap<string, string>,
  namedStrings: readonly ReadonlyMap<string, string>[],
  prepared: PreparedPublishingContent,
): string {
  const membership = pages.flatMap((page, pageIndex) =>
    [...page.page.querySelectorAll<Element>(`[${SOURCE_KEY}]`)].map(
      (element) => `${element.getAttribute(SOURCE_KEY) ?? ""}@${pageIndex + 1}`,
    ),
  );
  const generated = [...generatedValues.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const strings = namedStrings.map((values) =>
    [...values.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const elements = pagesElements(pages);
  const placements = [
    ...prepared.footnotes.map((binding) => {
      const element = elements.find(
        (candidate) => candidate.getAttribute(SOURCE_KEY) === binding.sourceKey,
      );
      return `footnote:${binding.key}:${pageIndexFor(element) ?? -1}:${element?.hasAttribute("data-imposia-footnote") === true}`;
    }),
    ...prepared.pageFloats.map((binding) => {
      const element = elements.find(
        (candidate) => candidate.getAttribute(SOURCE_KEY) === binding.sourceKey,
      );
      return `page-float:${binding.key}:${pageIndexFor(element) ?? -1}:${element?.getAttribute("data-imposia-page-float") ?? "fallback"}`;
    }),
  ];
  return JSON.stringify({ membership, generated, strings, placements });
}

export function finalizePublishingPass(
  pages: readonly PublishingPage[],
  prepared: PreparedPublishingContent,
  experimental: Readonly<ExperimentalPageFeatures>,
): FinalizedPublishingContent {
  const elements = pagesElements(pages);
  const generatedValues = new Map<string, string>();
  const warnings: { order: number; warning: PageWarning }[] = [];
  for (const binding of prepared.targets) {
    const markers = elements.filter(
      (element) => element.getAttribute(GENERATED_KEY) === binding.key,
    );
    const target =
      binding.targetId === undefined
        ? undefined
        : elements.find((element) => element.getAttribute("id") === binding.targetId);
    const value =
      target === undefined
        ? ""
        : binding.kind === "target-counter"
          ? String((pageIndexFor(target) ?? -1) + 1)
          : targetText(target);
    generatedValues.set(binding.key, value);
    for (const marker of markers) marker.textContent = value;
    if (target === undefined) {
      warnings.push({
        order: binding.sourceOrder,
        warning: coreWarning(
          "REFERENCE_MISSING",
          "The local fragment target does not exist.",
          `source-${binding.sourceOrder}`,
          "The generated reference was left empty.",
        ),
      });
    }
  }
  for (const [id, order] of prepared.duplicateIds) {
    warnings.push({
      order,
      warning: coreWarning(
        "REFERENCE_DUPLICATE",
        `Duplicate id "${id}" was ignored after its first source occurrence.`,
        `source-${order}`,
        "The first source-order id remains the reference target.",
      ),
    });
  }

  const namedStrings = resolveNamedStrings(pages, prepared);
  placeFootnotes(pages, prepared, experimental, warnings);
  placePageFloats(pages, prepared, experimental, warnings);
  const signature = layoutSignature(pages, generatedValues, namedStrings, prepared);
  const deduplicatedWarnings = new Map<string, { order: number; warning: PageWarning }>();
  for (const item of warnings) {
    const key = `${item.warning.code}\u0000${item.warning.sourceIdentity ?? ""}`;
    if (!deduplicatedWarnings.has(key)) deduplicatedWarnings.set(key, item);
  }
  return Object.freeze({
    generatedValues,
    namedStrings,
    warnings: Object.freeze(
      [...deduplicatedWarnings.values()]
        .sort((left, right) => left.order - right.order)
        .map((item) => item.warning),
    ),
    signature,
  });
}

export function namedStringValue(
  values: ReadonlyMap<string, string> | undefined,
  name: string,
  position: StringPosition,
): string {
  return values?.get(namedStringKey(name, position)) ?? "";
}

export function cleanPublishingInternals(pages: readonly PublishingPage[]): void {
  for (const page of pages) {
    for (const anchor of page.page.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      anchor.addEventListener("click", (event) => {
        const href = anchor.getAttribute("href");
        if (href === null) return;
        const targetId = fragmentId(href);
        const targetExists =
          targetId !== undefined &&
          [...anchor.ownerDocument.querySelectorAll<Element>("[id]")].some(
            (element) => element.getAttribute("id") === targetId,
          );
        if (!targetExists) return;
        event.preventDefault();
        const view = anchor.ownerDocument.defaultView;
        if (view !== null) view.location.hash = href;
      });
    }
    for (const element of page.page.querySelectorAll<Element>(`[${SOURCE_KEY}]`)) {
      element.removeAttribute(SOURCE_KEY);
    }
    for (const marker of page.page.querySelectorAll<Element>(`[${GENERATED_KEY}]`)) {
      marker.removeAttribute(GENERATED_KEY);
    }
    for (const call of page.page.querySelectorAll<Element>(`[${FOOTNOTE_CALL_KEY}]`)) {
      call.removeAttribute(FOOTNOTE_CALL_KEY);
    }
  }
}
