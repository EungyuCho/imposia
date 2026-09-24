import type { AtRule, Declaration, Root } from "postcss";
import { parseCss } from "./css-parse.js";
import { ImposiaError } from "./errors.js";
import { hasCssResource } from "./page-document-sanitize-css.js";
import type {
  PageContext,
  PageGeometry,
  PageMarginEdges,
  PageMargins,
  PageOptions,
  PageOrientation,
} from "./page-document-types.js";
import {
  A4_HEIGHT_CSS_PX,
  A4_WIDTH_CSS_PX,
  DEFAULT_PAGE_MARGIN_CSS_PX,
  LETTER_HEIGHT_CSS_PX,
  LETTER_WIDTH_CSS_PX,
} from "./page-units.js";
import type { WarningCollector } from "./warnings.js";

export {
  A4_HEIGHT_CSS_PX,
  A4_WIDTH_CSS_PX,
  cssPx,
  DEFAULT_PAGE_MARGIN_CSS_PX,
  LETTER_HEIGHT_CSS_PX,
  LETTER_WIDTH_CSS_PX,
} from "./page-units.js";

const MM = 96 / 25.4;

/**
 * The CSS Paged Media `<page-size>` keywords, portrait, in CSS pixels. Host
 * options spell them with the capitalization of {@link PageSizeKeyword};
 * authored `size` values match them case-insensitively.
 */
const PAGE_SIZE_KEYWORDS: ReadonlyMap<
  string,
  Readonly<{ widthCssPx: number; heightCssPx: number }>
> = new Map(
  (
    [
      ["A5", 148 * MM, 210 * MM],
      ["A4", A4_WIDTH_CSS_PX, A4_HEIGHT_CSS_PX],
      ["A3", 297 * MM, 420 * MM],
      ["B5", 176 * MM, 250 * MM],
      ["B4", 250 * MM, 353 * MM],
      ["Letter", LETTER_WIDTH_CSS_PX, LETTER_HEIGHT_CSS_PX],
      ["Legal", 8.5 * 96, 14 * 96],
      ["Ledger", 11 * 96, 17 * 96],
    ] as const
  ).map(([name, widthCssPx, heightCssPx]) => [name, Object.freeze({ widthCssPx, heightCssPx })]),
);

const AUTHORED_PAGE_SIZE_KEYWORDS = new Map(
  [...PAGE_SIZE_KEYWORDS].map(([name, size]) => [name.toLowerCase(), size]),
);

export const PAGE_MARGIN_BOX_NAMES = Object.freeze([
  "top-left-corner",
  "top-left",
  "top-center",
  "top-right",
  "top-right-corner",
  "right-top",
  "right-middle",
  "right-bottom",
  "bottom-right-corner",
  "bottom-right",
  "bottom-center",
  "bottom-left",
  "bottom-left-corner",
  "left-bottom",
  "left-middle",
  "left-top",
] as const);

export type PageMarginBoxName = (typeof PAGE_MARGIN_BOX_NAMES)[number];

export type NamedStringPosition = "first" | "start" | "last";

export type PageMarginContentPart =
  | Readonly<{ type: "text"; value: string }>
  | Readonly<{ type: "counter"; name: "page" | "pages" }>
  | Readonly<{
      type: "string";
      name: string;
      position: NamedStringPosition;
    }>;

/**
 * One margin box after the page cascade: its parsed `content` and the
 * allowlisted presentation declarations, in cascade order.
 */
export type ResolvedMarginBox = Readonly<{
  content: readonly PageMarginContentPart[];
  style: readonly (readonly [property: string, value: string])[];
}>;

type PagePseudo = "first" | "left" | "right" | "blank";

type PageSelector = Readonly<{
  name: string | undefined;
  pseudos: readonly PagePseudo[];
  nth: readonly (readonly [step: number, offset: number])[];
  specificity: readonly [number, number, number];
}>;

type AuthoredMarginBox = Readonly<{
  content: readonly PageMarginContentPart[] | undefined;
  style: readonly (readonly [property: string, value: string])[];
}>;

type PageGeometryDeclaration =
  | Readonly<{
      kind: "size";
      widthCssPx: number;
      heightCssPx: number;
      property: string;
      value: string;
      order: number;
    }>
  | Readonly<{
      kind: "orientation";
      orientation: PageOrientation;
      property: string;
      value: string;
      order: number;
    }>
  | Readonly<{
      kind: "margins";
      margins: PageMargins;
      property: string;
      value: string;
      order: number;
    }>
  | Readonly<{
      kind: "margin";
      edge: "top" | "right" | "bottom" | "left";
      valueCssPx: number;
      property: string;
      value: string;
      order: number;
    }>;

export type AuthoredPageRule = Readonly<{
  selector: PageSelector;
  declarations: readonly PageGeometryDeclaration[];
  marginBoxes: ReadonlyMap<PageMarginBoxName, AuthoredMarginBox>;
  order: number;
}>;

export type HostPageOverrides = Readonly<{
  size?: Readonly<{ widthCssPx: number; heightCssPx: number }>;
  orientation?: PageOrientation;
  margins?: PageMargins;
}>;

export interface ExtractedPageMediaCss {
  readonly css: string;
  readonly rules: readonly AuthoredPageRule[];
  readonly nextOrder: number;
}

export interface ResolvedPageMedia {
  readonly geometry: PageGeometry;
  readonly marginBoxes: ReadonlyMap<PageMarginBoxName, ResolvedMarginBox>;
}

const PAGE_PSEUDOS = new Set(["first", "left", "right", "blank"]);
const PAGE_MARGIN_BOX_SET = new Set<string>(PAGE_MARGIN_BOX_NAMES);

/**
 * Presentation properties a margin box may declare besides `content`. None of
 * them can carry an image or another fetchable resource, and none can move
 * the box out of its slot: geometry stays owned by the page margins.
 */
const MARGIN_BOX_STYLE_PROPERTY =
  /^(?:(?:background-)?color|font(?:-[a-z-]+)?|line-height|(?:letter|word)-spacing|white-space|vertical-align|text-(?:align|transform|overflow|decoration(?:-[a-z]+)?)|border(?:-(?:top|right|bottom|left))?(?:-(?:color|style|width))?|padding(?:-(?:top|right|bottom|left))?)$/;
const PAGE_DESCRIPTOR_PROPERTIES = new Set([
  "size",
  "orientation",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
]);
const CSS_IDENTIFIER = /^-?(?:[_a-z]|[^\0-\x7f])(?:[-_a-z0-9]|[^\0-\x7f])*$/i;
const ABSOLUTE_LENGTH = /^\+?(?:\d+(?:\.\d+)?|\.\d+)(px|mm|cm|in|pt|pc)$/i;

function absoluteLengthCssPx(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();
  const match = ABSOLUTE_LENGTH.exec(normalized);
  if (match === null) return undefined;
  const unit = match[1];
  if (unit === undefined) return undefined;
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const factor =
    unit === "px"
      ? 1
      : unit === "mm"
        ? 96 / 25.4
        : unit === "cm"
          ? 96 / 2.54
          : unit === "in"
            ? 96
            : unit === "pt"
              ? 96 / 72
              : 16;
  const result = amount * factor;
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

function pageRuleWarning(
  warnings: WarningCollector,
  property: string,
  value: string,
  order: number,
  message = "Unsupported page-rule value was ignored.",
): void {
  warnings.add(
    {
      code: "PAGE_RULE_UNSUPPORTED",
      message,
      feature: "css-page",
      property,
      value,
      recovery: "The prior valid page value or the default page value was retained.",
      sourceIndex: order,
    },
    order,
  );
}

function orientSize(
  widthCssPx: number,
  heightCssPx: number,
  orientation: PageOrientation,
): Readonly<{ widthCssPx: number; heightCssPx: number }> {
  if (orientation === "portrait" && widthCssPx > heightCssPx) {
    return { widthCssPx: heightCssPx, heightCssPx: widthCssPx };
  }
  if (orientation === "landscape" && widthCssPx < heightCssPx) {
    return { widthCssPx: heightCssPx, heightCssPx: widthCssPx };
  }
  return { widthCssPx, heightCssPx };
}

type ParsedPageSize = Readonly<{
  size: Readonly<{ widthCssPx: number; heightCssPx: number }> | undefined;
  orientation: PageOrientation | undefined;
}>;

function pageOrientationKeyword(value: string | undefined): PageOrientation | undefined {
  return value === "portrait" || value === "landscape" ? value : undefined;
}

/**
 * Parses a `size` descriptor: one or two absolute lengths, a `<page-size>`
 * keyword, an orientation, or a keyword and an orientation in either order.
 * An orientation alone rotates whatever size the cascade has chosen.
 */
function parsedPageSize(value: string): ParsedPageSize | undefined {
  const tokens = value.trim().toLowerCase().split(/\s+/);
  if (tokens.length === 0 || tokens.length > 2) return undefined;
  const first = tokens[0] ?? "";
  const second = tokens[1];
  const firstLength = absoluteLengthCssPx(first);
  if (firstLength !== undefined) {
    const secondLength = second === undefined ? firstLength : absoluteLengthCssPx(second);
    if (secondLength === undefined) return undefined;
    return { size: { widthCssPx: firstLength, heightCssPx: secondLength }, orientation: undefined };
  }
  const firstOrientation = pageOrientationKeyword(first);
  const keyword = firstOrientation === undefined ? first : second;
  const orientation = firstOrientation ?? pageOrientationKeyword(second);
  if (second !== undefined && orientation === undefined) return undefined;
  if (keyword === undefined) return { size: undefined, orientation };
  const size = AUTHORED_PAGE_SIZE_KEYWORDS.get(keyword);
  if (size === undefined || (firstOrientation !== undefined && second === undefined)) {
    return undefined;
  }
  return {
    size:
      orientation === undefined ? size : orientSize(size.widthCssPx, size.heightCssPx, orientation),
    orientation: undefined,
  };
}

function parsedMargins(value: string): PageMargins | undefined {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 1 || tokens.length > 4) return undefined;
  const values = tokens.map(absoluteLengthCssPx);
  if (values.some((item) => item === undefined)) return undefined;
  const first = values[0];
  if (first === undefined) return undefined;
  const second = values[1] ?? first;
  const third = values[2] ?? first;
  const fourth = values[3] ?? second;
  return Object.freeze({
    topCssPx: first,
    rightCssPx: second,
    bottomCssPx: third,
    leftCssPx: fourth,
  });
}

/** Parses the `An+B` argument of `:nth()`; `of <name>` page groups are not supported. */
function parseNth(argument: string): readonly [number, number] | undefined {
  const value = argument.replace(/\s+/g, "").toLowerCase();
  if (value === "odd") return [2, 1];
  if (value === "even") return [2, 0];
  if (/^[+-]?\d+$/.test(value)) return [0, Number.parseInt(value, 10)];
  const match = /^([+-]?\d*)n([+-]\d+)?$/.exec(value);
  if (match === null) return undefined;
  const coefficient = match[1] ?? "";
  const step =
    coefficient === "" || coefficient === "+"
      ? 1
      : coefficient === "-"
        ? -1
        : Number.parseInt(coefficient, 10);
  return [step, match[2] === undefined ? 0 : Number.parseInt(match[2], 10)];
}

function nthMatches([step, offset]: readonly [number, number], pageNumber: number): boolean {
  if (step === 0) return pageNumber === offset;
  const n = (pageNumber - offset) / step;
  return Number.isInteger(n) && n >= 0;
}

function parsePageSelector(value: string): PageSelector | undefined {
  const selector = value.trim();
  if (selector === "") {
    return Object.freeze({
      name: undefined,
      pseudos: Object.freeze([]),
      nth: Object.freeze([]),
      specificity: Object.freeze([0, 0, 0] as const),
    });
  }
  if (selector.includes(",")) return undefined;
  const nth: (readonly [number, number])[] = [];
  const withoutNth = selector.replace(/:nth\(([^()]*)\)/gi, (_match, argument: string) => {
    const parsed = parseNth(argument);
    if (parsed === undefined) return ":\u0000";
    nth.push(Object.freeze(parsed));
    return ":\u0001";
  });
  if (/\s/.test(withoutNth) || withoutNth.includes("\u0000")) return undefined;
  const components = withoutNth.split(":").filter((component) => component !== "\u0001");
  const possibleName = components.shift() ?? "";
  const name = possibleName === "" ? undefined : possibleName;
  if (name !== undefined && (!CSS_IDENTIFIER.test(name) || name.toLowerCase() === "auto")) {
    return undefined;
  }
  if (components.length === 0 && name === undefined && nth.length === 0) return undefined;
  const pseudos: PagePseudo[] = [];
  for (const component of components) {
    const normalized = component.toLowerCase();
    if (!PAGE_PSEUDOS.has(normalized)) return undefined;
    pseudos.push(normalized as PagePseudo);
  }
  const firstOrBlank = pseudos.filter((item) => item === "first" || item === "blank").length;
  const side = pseudos.filter((item) => item === "left" || item === "right").length;
  return Object.freeze({
    name,
    pseudos: Object.freeze(pseudos),
    nth: Object.freeze(nth),
    specificity: Object.freeze([
      name === undefined ? 0 : 1,
      firstOrBlank + nth.length,
      side,
    ] as const),
  });
}

function decodeCssEscape(value: string, index: number): Readonly<{ value: string; next: number }> {
  const next = value[index + 1];
  if (next === undefined) return { value: "", next: index + 1 };
  if (/[0-9a-f]/i.test(next)) {
    let end = index + 1;
    while (end < value.length && end < index + 7 && /[0-9a-f]/i.test(value[end] ?? "")) end += 1;
    const codePoint = Number.parseInt(value.slice(index + 1, end), 16);
    if (/[\t\n\r\f ]/.test(value[end] ?? "")) end += 1;
    return {
      value: codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "�",
      next: end,
    };
  }
  if (next === "\n" || next === "\r" || next === "\f") return { value: "", next: index + 2 };
  return { value: next, next: index + 2 };
}

export function parseMarginBoxContent(value: string): readonly PageMarginContentPart[] | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "none" || normalized === "normal") return Object.freeze([]);
  const parts: PageMarginContentPart[] = [];
  let index = 0;
  while (index < value.length) {
    while (/\s/.test(value[index] ?? "")) index += 1;
    if (index >= value.length) break;
    const quote = value[index];
    if (quote === '"' || quote === "'") {
      index += 1;
      let text = "";
      let closed = false;
      while (index < value.length) {
        const character = value[index];
        if (character === quote) {
          index += 1;
          closed = true;
          break;
        }
        if (character === "\\") {
          const decoded = decodeCssEscape(value, index);
          text += decoded.value;
          index = decoded.next;
          continue;
        }
        if (
          character === undefined ||
          character === "\n" ||
          character === "\r" ||
          character === "\f"
        ) {
          return undefined;
        }
        text += character;
        index += 1;
      }
      if (!closed) return undefined;
      parts.push(Object.freeze({ type: "text", value: text }));
      continue;
    }
    const counter = /^counter\(\s*(page|pages)\s*\)/i.exec(value.slice(index));
    if (counter !== null) {
      const name = counter[1]?.toLowerCase();
      if (name !== "page" && name !== "pages") return undefined;
      parts.push(Object.freeze({ type: "counter", name }));
      index += counter[0].length;
      continue;
    }
    const namedString = /^string\(\s*([^\s,)]+)\s*(?:,\s*(first|start|last)\s*)?\)/i.exec(
      value.slice(index),
    );
    if (namedString !== null) {
      const name = namedString[1];
      const position = (namedString[2]?.toLowerCase() ?? "first") as NamedStringPosition;
      if (name === undefined || !CSS_IDENTIFIER.test(name)) return undefined;
      parts.push(Object.freeze({ type: "string", name, position }));
      index += namedString[0].length;
      continue;
    }
    return undefined;
  }
  return parts.length === 0 ? undefined : Object.freeze(parts);
}

function declarationOrder(declaration: Declaration, baseOrder: number, fallback: number): number {
  return baseOrder + (declaration.source?.start?.offset ?? fallback);
}

function validPageDescriptor(declaration: Declaration): boolean {
  const property = declaration.prop.toLowerCase();
  const value = declaration.value.trim();
  if (property === "size") return parsedPageSize(value) !== undefined;
  if (property === "orientation") {
    const normalized = value.toLowerCase();
    return normalized === "portrait" || normalized === "landscape";
  }
  if (property === "margin") return parsedMargins(value) !== undefined;
  if (property.startsWith("margin-")) return absoluteLengthCssPx(value) !== undefined;
  return false;
}

function validMarginBoxStyle(property: string, value: string): boolean {
  return (
    MARGIN_BOX_STYLE_PROPERTY.test(property) &&
    value !== "" &&
    !/[;{}<]/.test(value) &&
    !hasCssResource(value)
  );
}

function normalizeMarginAtRule(rule: AtRule, warnings: WarningCollector, baseOrder: number): void {
  const name = rule.name.toLowerCase();
  const order = baseOrder + (rule.source?.start?.offset ?? 0);
  if (!PAGE_MARGIN_BOX_SET.has(name) || rule.params.trim() !== "") {
    pageRuleWarning(
      warnings,
      `@${name}`,
      rule.params.trim(),
      order,
      "Unsupported page margin box was ignored.",
    );
    rule.remove();
    return;
  }
  for (const node of [...(rule.nodes ?? [])]) {
    if (node.type === "comment") continue;
    if (node.type !== "decl") {
      pageRuleWarning(
        warnings,
        `@${name}`,
        node.toString(),
        order,
        "Unsupported margin-box rule was ignored.",
      );
      node.remove();
      continue;
    }
    const declaration = node;
    const declarationValue = declaration.value.trim();
    const declarationPosition = declarationOrder(declaration, baseOrder, order);
    const property = declaration.prop.toLowerCase();
    if (property !== "content" && validMarginBoxStyle(property, declarationValue)) continue;
    if (property !== "content" || parseMarginBoxContent(declarationValue) === undefined) {
      pageRuleWarning(
        warnings,
        declaration.prop.toLowerCase(),
        declarationValue,
        declarationPosition,
        "Unsupported margin-box content was ignored.",
      );
      declaration.remove();
    }
  }
}

export function normalizePageMediaCss(root: Root, warnings: WarningCollector, baseOrder = 0): void {
  root.walkAtRules("page", (rule) => {
    const ruleOrder = baseOrder + (rule.source?.start?.offset ?? 0);
    if (parsePageSelector(rule.params) === undefined) {
      pageRuleWarning(
        warnings,
        "@page",
        rule.params.trim(),
        ruleOrder,
        "Unsupported page selector was ignored.",
      );
      rule.remove();
      return;
    }
    for (const node of [...(rule.nodes ?? [])]) {
      if (node.type === "comment") continue;
      if (node.type === "atrule") {
        normalizeMarginAtRule(node, warnings, baseOrder);
        continue;
      }
      if (node.type !== "decl") {
        pageRuleWarning(
          warnings,
          "@page",
          node.toString(),
          ruleOrder,
          "Unsupported page rule was ignored.",
        );
        node.remove();
        continue;
      }
      const property = node.prop.toLowerCase();
      const value = node.value.trim();
      const order = declarationOrder(node, baseOrder, ruleOrder);
      if (!PAGE_DESCRIPTOR_PROPERTIES.has(property) || !validPageDescriptor(node)) {
        pageRuleWarning(warnings, property, value, order);
        node.remove();
      } else if (property === "orientation") {
        node.value = value.toLowerCase();
      }
    }
  });
}

export function normalizePageNameDeclaration(
  declaration: Declaration,
  warnings: WarningCollector,
  order: number,
): void {
  if (declaration.prop.toLowerCase() !== "page") return;
  const value = declaration.value.trim();
  if (value.toLowerCase() === "auto") {
    declaration.value = "auto";
    return;
  }
  if (!CSS_IDENTIFIER.test(value)) {
    pageRuleWarning(warnings, "page", value, order, "Unsupported named-page value was ignored.");
    declaration.remove();
  }
}

function geometryDeclaration(declaration: Declaration, order: number): PageGeometryDeclaration {
  const property = declaration.prop.toLowerCase();
  const value = declaration.value.trim();
  if (property === "size") {
    const parsed = parsedPageSize(value);
    if (parsed === undefined) throw new Error("Normalized page size became invalid.");
    if (parsed.size === undefined) {
      const orientation = parsed.orientation;
      if (orientation === undefined) throw new Error("Normalized page size became invalid.");
      return Object.freeze({ kind: "orientation", orientation, property, value, order });
    }
    return Object.freeze({ kind: "size", ...parsed.size, property, value, order });
  }
  if (property === "orientation") {
    const orientation = value as PageOrientation;
    return Object.freeze({ kind: "orientation", orientation, property, value, order });
  }
  if (property === "margin") {
    const margins = parsedMargins(value);
    if (margins === undefined) throw new Error("Normalized page margin became invalid.");
    return Object.freeze({ kind: "margins", margins, property, value, order });
  }
  const edge = property.slice("margin-".length) as "top" | "right" | "bottom" | "left";
  const valueCssPx = absoluteLengthCssPx(value);
  if (valueCssPx === undefined) throw new Error("Normalized page margin edge became invalid.");
  return Object.freeze({ kind: "margin", edge, valueCssPx, property, value, order });
}

function appendPageNameProjection(root: Root): void {
  root.walkDecls("page", (declaration) => {
    if (declaration.parent?.type === "atrule" && declaration.parent.name.toLowerCase() === "page") {
      return;
    }
    const value = declaration.value.trim();
    declaration.cloneAfter({
      prop: "--imposia-authored-page-name",
      value: value.toLowerCase() === "auto" ? "__imposia-auto__" : value,
    });
  });
}

export function extractPageMediaCss(css: string, startOrder = 0): ExtractedPageMediaCss {
  const root = parseCss(css);
  const rules: AuthoredPageRule[] = [];
  let nextOrder = startOrder;
  root.walkAtRules("page", (rule) => {
    const selector = parsePageSelector(rule.params);
    if (selector === undefined) {
      rule.remove();
      return;
    }
    const declarations: PageGeometryDeclaration[] = [];
    const marginBoxes = new Map<PageMarginBoxName, AuthoredMarginBox>();
    for (const node of rule.nodes ?? []) {
      if (node.type === "decl") {
        declarations.push(geometryDeclaration(node, nextOrder));
        nextOrder += 1;
        continue;
      }
      if (node.type !== "atrule" || !PAGE_MARGIN_BOX_SET.has(node.name.toLowerCase())) continue;
      let content: readonly PageMarginContentPart[] | undefined;
      const style: (readonly [string, string])[] = [];
      for (const candidate of node.nodes ?? []) {
        if (candidate.type !== "decl") continue;
        const property = candidate.prop.toLowerCase();
        const value = candidate.value.trim();
        if (property === "content") {
          content = parseMarginBoxContent(value) ?? content;
        } else if (validMarginBoxStyle(property, value)) {
          style.push(Object.freeze([property, value] as const));
        }
      }
      if (content === undefined && style.length === 0) continue;
      marginBoxes.set(
        node.name.toLowerCase() as PageMarginBoxName,
        Object.freeze({ content, style: Object.freeze(style) }),
      );
    }
    rules.push(
      Object.freeze({
        selector,
        declarations: Object.freeze(declarations),
        marginBoxes,
        order: nextOrder,
      }),
    );
    nextOrder += 1;
    rule.remove();
  });
  appendPageNameProjection(root);
  return Object.freeze({ css: root.toString(), rules: Object.freeze(rules), nextOrder });
}

function invalidPageGeometry(message: string): ImposiaError {
  return new ImposiaError("INVALID_PAGE_GEOMETRY", message);
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

function hostSize(value: unknown): Readonly<{ widthCssPx: number; heightCssPx: number }> {
  const keyword = typeof value === "string" ? PAGE_SIZE_KEYWORDS.get(value) : undefined;
  if (keyword !== undefined) return keyword;
  const record = recordValue(value);
  const widthCssPx =
    typeof record?.width === "string" ? absoluteLengthCssPx(record.width) : undefined;
  const heightCssPx =
    typeof record?.height === "string" ? absoluteLengthCssPx(record.height) : undefined;
  if (widthCssPx === undefined || heightCssPx === undefined) {
    throw invalidPageGeometry(
      `Page size must be ${[...PAGE_SIZE_KEYWORDS.keys()].join(", ")}, or two positive absolute lengths.`,
    );
  }
  return Object.freeze({ widthCssPx, heightCssPx });
}

function hostMarginEdges(value: unknown): PageMargins {
  if (typeof value === "string") {
    const parsed = parsedMargins(value);
    if (parsed === undefined || value.trim().split(/\s+/).length !== 1) {
      throw invalidPageGeometry(
        "Page margin must be one positive absolute length or four named edges.",
      );
    }
    return parsed;
  }
  const record = recordValue(value);
  if (record === undefined) {
    throw invalidPageGeometry(
      "Page margin must be one positive absolute length or four named edges.",
    );
  }
  const values: PageMarginEdges = {
    top: typeof record.top === "string" ? record.top : "",
    right: typeof record.right === "string" ? record.right : "",
    bottom: typeof record.bottom === "string" ? record.bottom : "",
    left: typeof record.left === "string" ? record.left : "",
  };
  const topCssPx = absoluteLengthCssPx(values.top);
  const rightCssPx = absoluteLengthCssPx(values.right);
  const bottomCssPx = absoluteLengthCssPx(values.bottom);
  const leftCssPx = absoluteLengthCssPx(values.left);
  if (
    topCssPx === undefined ||
    rightCssPx === undefined ||
    bottomCssPx === undefined ||
    leftCssPx === undefined
  ) {
    throw invalidPageGeometry("Every page margin edge must be a positive absolute length.");
  }
  return Object.freeze({ topCssPx, rightCssPx, bottomCssPx, leftCssPx });
}

function validGeometry(widthCssPx: number, heightCssPx: number, margins: PageMargins): boolean {
  return (
    Number.isFinite(widthCssPx) &&
    Number.isFinite(heightCssPx) &&
    widthCssPx > margins.leftCssPx + margins.rightCssPx &&
    heightCssPx > margins.topCssPx + margins.bottomCssPx
  );
}

export function normalizeHostPageOptions(value: PageOptions | undefined): HostPageOverrides {
  if (value === undefined) return Object.freeze({});
  const record = recordValue(value);
  if (record === undefined) throw invalidPageGeometry("Page options must be an object.");
  const orientation = record.orientation;
  if (orientation !== undefined && orientation !== "portrait" && orientation !== "landscape") {
    throw invalidPageGeometry("Page orientation must be portrait or landscape.");
  }
  const size = record.size === undefined ? undefined : hostSize(record.size);
  const margins = record.margin === undefined ? undefined : hostMarginEdges(record.margin);
  const result = Object.freeze({
    ...(size === undefined ? {} : { size }),
    ...(orientation === undefined ? {} : { orientation }),
    ...(margins === undefined ? {} : { margins }),
  });
  const baseSize = size ?? { widthCssPx: A4_WIDTH_CSS_PX, heightCssPx: A4_HEIGHT_CSS_PX };
  const oriented =
    orientation === undefined
      ? baseSize
      : orientSize(baseSize.widthCssPx, baseSize.heightCssPx, orientation);
  const checkedMargins = margins ?? defaultMargins();
  if (!validGeometry(oriented.widthCssPx, oriented.heightCssPx, checkedMargins)) {
    throw invalidPageGeometry("Page margins must leave a positive content box.");
  }
  return result;
}

function defaultMargins(): PageMargins {
  return Object.freeze({
    topCssPx: DEFAULT_PAGE_MARGIN_CSS_PX,
    rightCssPx: DEFAULT_PAGE_MARGIN_CSS_PX,
    bottomCssPx: DEFAULT_PAGE_MARGIN_CSS_PX,
    leftCssPx: DEFAULT_PAGE_MARGIN_CSS_PX,
  });
}

function selectorMatches(
  selector: PageSelector,
  context: PageContext,
  pageNumber: number,
): boolean {
  if (selector.name !== undefined && selector.name !== context.name) return false;
  for (const pseudo of selector.pseudos) {
    if (pseudo === "first" && pageNumber !== 1) return false;
    if (pseudo === "left" && context.side !== "left") return false;
    if (pseudo === "right" && context.side !== "right") return false;
    if (pseudo === "blank" && !context.blank) return false;
  }
  return selector.nth.every((nth) => nthMatches(nth, pageNumber));
}

function comparePageRules(left: AuthoredPageRule, right: AuthoredPageRule): number {
  for (let index = 0; index < 3; index += 1) {
    const difference =
      (left.selector.specificity[index] ?? 0) - (right.selector.specificity[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.order - right.order;
}

function freezeGeometry(
  widthCssPx: number,
  heightCssPx: number,
  margins: PageMargins,
): PageGeometry {
  const frozenMargins = Object.freeze({ ...margins });
  return Object.freeze({
    sheetWidthCssPx: widthCssPx,
    sheetHeightCssPx: heightCssPx,
    margins: frozenMargins,
    contentWidthCssPx: widthCssPx - frozenMargins.leftCssPx - frozenMargins.rightCssPx,
    contentHeightCssPx: heightCssPx - frozenMargins.topCssPx - frozenMargins.bottomCssPx,
  });
}

export function resolvePageMedia(
  rules: readonly AuthoredPageRule[],
  host: HostPageOverrides,
  context: PageContext,
  pageNumber: number,
  warnings: WarningCollector,
): ResolvedPageMedia {
  type GeometryState = Readonly<{
    baseWidthCssPx: number;
    baseHeightCssPx: number;
    orientation: PageOrientation | undefined;
    margins: PageMargins;
  }>;
  let state: GeometryState = {
    baseWidthCssPx: A4_WIDTH_CSS_PX,
    baseHeightCssPx: A4_HEIGHT_CSS_PX,
    orientation: undefined,
    margins: defaultMargins(),
  };
  const history: { declaration: PageGeometryDeclaration; before: GeometryState }[] = [];
  const boxContent = new Map<PageMarginBoxName, readonly PageMarginContentPart[]>();
  const boxStyle = new Map<PageMarginBoxName, Map<string, string>>();
  const matching = rules
    .filter((rule) => selectorMatches(rule.selector, context, pageNumber))
    .sort(comparePageRules);
  for (const rule of matching) {
    for (const declaration of rule.declarations) {
      const before = state;
      if (declaration.kind === "size") {
        state = {
          ...state,
          baseWidthCssPx: declaration.widthCssPx,
          baseHeightCssPx: declaration.heightCssPx,
        };
      } else if (declaration.kind === "orientation") {
        state = { ...state, orientation: declaration.orientation };
      } else if (declaration.kind === "margins") {
        state = { ...state, margins: declaration.margins };
      } else {
        state = {
          ...state,
          margins: Object.freeze({
            ...state.margins,
            [`${declaration.edge}CssPx`]: declaration.valueCssPx,
          }),
        };
      }
      history.push({ declaration, before });
    }
    for (const [name, box] of rule.marginBoxes) {
      if (box.content !== undefined) boxContent.set(name, box.content);
      if (box.style.length === 0) continue;
      const style = boxStyle.get(name) ?? new Map<string, string>();
      for (const [property, value] of box.style) {
        style.delete(property);
        style.set(property, value);
      }
      boxStyle.set(name, style);
    }
  }
  const marginBoxes = new Map<PageMarginBoxName, ResolvedMarginBox>();
  for (const [name, content] of boxContent) {
    if (content.length === 0) continue;
    marginBoxes.set(
      name,
      Object.freeze({
        content,
        style: Object.freeze([...(boxStyle.get(name) ?? [])].map((entry) => Object.freeze(entry))),
      }),
    );
  }

  const resolvedSize = (candidate: GeometryState) =>
    candidate.orientation === undefined
      ? {
          widthCssPx: candidate.baseWidthCssPx,
          heightCssPx: candidate.baseHeightCssPx,
        }
      : orientSize(candidate.baseWidthCssPx, candidate.baseHeightCssPx, candidate.orientation);
  let authoredSize = resolvedSize(state);
  while (!validGeometry(authoredSize.widthCssPx, authoredSize.heightCssPx, state.margins)) {
    const invalid = history.pop();
    if (invalid === undefined) break;
    pageRuleWarning(
      warnings,
      invalid.declaration.property,
      invalid.declaration.value,
      invalid.declaration.order,
    );
    state = invalid.before;
    authoredSize = resolvedSize(state);
  }

  let baseWidthCssPx = state.baseWidthCssPx;
  let baseHeightCssPx = state.baseHeightCssPx;
  if (host.size !== undefined) {
    baseWidthCssPx = host.size.widthCssPx;
    baseHeightCssPx = host.size.heightCssPx;
  }
  const orientation = host.orientation ?? state.orientation;
  const finalSize =
    orientation === undefined
      ? { widthCssPx: baseWidthCssPx, heightCssPx: baseHeightCssPx }
      : orientSize(baseWidthCssPx, baseHeightCssPx, orientation);
  const margins = host.margins ?? state.margins;
  if (!validGeometry(finalSize.widthCssPx, finalSize.heightCssPx, margins)) {
    throw invalidPageGeometry(
      "Host page options and authored page values must leave a positive content box.",
    );
  }
  return Object.freeze({
    geometry: freezeGeometry(finalSize.widthCssPx, finalSize.heightCssPx, margins),
    marginBoxes,
  });
}

export function authoredPageName(element: Element): string | undefined {
  const view = element.ownerDocument.defaultView;
  if (view === null) return undefined;
  const style = view.getComputedStyle(element);
  const projected = style.getPropertyValue("--imposia-authored-page-name").trim();
  const value = projected === "" ? style.getPropertyValue("page").trim() : projected;
  if (value === "" || value.toLowerCase() === "auto" || value === "__imposia-auto__")
    return undefined;
  return CSS_IDENTIFIER.test(value) ? value : undefined;
}

/** A box's offset from the start of the content edge and its width, in CSS px. */
export type MarginBoxSpan = readonly [offset: number, width: number];

/**
 * Splits one page edge between its start, center, and end margin boxes the
 * way CSS Paged Media resolves `auto` widths: space follows each box's
 * max-content width, and a center box stays centered by giving both side
 * boxes the width of the wider one. `undefined` marks an absent box.
 */
export function distributeMarginBoxWidths(
  available: number,
  start: number | undefined,
  center: number | undefined,
  end: number | undefined,
): readonly [MarginBoxSpan | undefined, MarginBoxSpan | undefined, MarginBoxSpan | undefined] {
  if (center !== undefined) {
    const side = Math.max(start ?? 0, end ?? 0);
    const total = center + 2 * side;
    const centerWidth = total > 0 ? (available * center) / total : available / 3;
    const sideWidth = (available - centerWidth) / 2;
    return [
      start === undefined ? undefined : [0, sideWidth],
      [sideWidth, centerWidth],
      end === undefined ? undefined : [sideWidth + centerWidth, sideWidth],
    ];
  }
  if (start !== undefined && end !== undefined) {
    const total = start + end;
    const startWidth = total > 0 ? (available * start) / total : available / 2;
    return [[0, startWidth], undefined, [startWidth, available - startWidth]];
  }
  return [
    start === undefined ? undefined : [0, available],
    undefined,
    end === undefined ? undefined : [0, available],
  ];
}

export function marginBoxText(
  content: readonly PageMarginContentPart[] | undefined,
  pageNumber: number,
  totalPages: number,
  namedString: (name: string, position: NamedStringPosition) => string = () => "",
): string {
  if (content === undefined) return "";
  return content
    .map((part) => {
      if (part.type === "text") return part.value;
      if (part.type === "counter") {
        return String(part.name === "page" ? pageNumber : totalPages);
      }
      return namedString(part.name, part.position);
    })
    .join("");
}
