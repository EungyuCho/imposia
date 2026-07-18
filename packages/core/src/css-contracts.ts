import postcss, { type Declaration, type Rule } from "postcss";
import { normalizePageMediaCss, normalizePageNameDeclaration } from "./page-media.js";
import type { WarningCollector } from "./warnings.js";

const BEFORE_AFTER_VALUES = new Set(["auto", "avoid", "page", "left", "right"]);
const INSIDE_VALUES = new Set(["auto", "avoid"]);
const LEGACY_TO_MODERN = new Map([
  ["page-break-before", "break-before"],
  ["page-break-after", "break-after"],
  ["page-break-inside", "break-inside"],
]);

function declarationOrder(declaration: Declaration, baseOrder: number, fallback: number): number {
  return baseOrder + (declaration.source?.start?.offset ?? fallback);
}

function normalizeRule(
  rule: Rule,
  declarationIndexes: Map<Declaration, number>,
  baseOrder: number,
  warnings: WarningCollector,
): void {
  const declarations = rule.nodes.filter((node): node is Declaration => node.type === "decl");
  const modernProperties = new Set(
    declarations
      .map((declaration) => declaration.prop.toLowerCase())
      .filter((property) => property.startsWith("break-")),
  );

  for (const declaration of declarations) {
    const declarationIndex = declarationIndexes.get(declaration) ?? 0;
    const originalProperty = declaration.prop.toLowerCase();
    if (originalProperty === "page") {
      normalizePageNameDeclaration(
        declaration,
        warnings,
        declarationOrder(declaration, baseOrder, declarationIndex),
      );
      continue;
    }
    const modernProperty = LEGACY_TO_MODERN.get(originalProperty);
    if (modernProperty && modernProperties.has(modernProperty)) {
      warnings.add(
        {
          code: "OVERRIDDEN_LEGACY_BREAK",
          message: "Modern break declaration overrides legacy page-break alias.",
          feature: "css-break",
          property: originalProperty,
          value: declaration.value.trim().toLowerCase(),
          sourceIndex: declarationIndex,
        },
        declarationOrder(declaration, baseOrder, declarationIndex),
      );
      declaration.remove();
      continue;
    }

    if (modernProperty) declaration.prop = modernProperty;
    const property = modernProperty ?? originalProperty;
    if (!property.startsWith("break-")) continue;

    const rawValue = declaration.value.trim().toLowerCase();
    const value = rawValue === "always" && modernProperty ? "page" : rawValue;
    const supported = property === "break-inside" ? INSIDE_VALUES : BEFORE_AFTER_VALUES;
    if (!supported.has(value)) {
      warnings.add(
        {
          code: "UNSUPPORTED_BREAK_VALUE",
          message: "Unsupported break value was ignored.",
          feature: "css-break",
          property,
          value: rawValue,
          sourceIndex: declarationIndex,
        },
        declarationOrder(declaration, baseOrder, declarationIndex),
      );
      declaration.remove();
      continue;
    }
    declaration.value = value;
  }
}

export function normalizeCss(css: string, warnings: WarningCollector, baseOrder = 0): string {
  const root = postcss.parse(css);
  normalizePageMediaCss(root, warnings, baseOrder);
  const declarationIndexes = new Map<Declaration, number>();
  let declarationIndex = 0;
  root.walkDecls((declaration) => {
    declarationIndexes.set(declaration, declarationIndex);
    declarationIndex += 1;
  });
  root.walkRules((rule) => normalizeRule(rule, declarationIndexes, baseOrder, warnings));
  return root.toString();
}

export function normalizeInlineCss(
  css: string,
  warnings: WarningCollector,
  baseOrder: number,
): string {
  const root = postcss.parse(`x{${css}}`);
  root.walkRules((rule) => normalizeRule(rule, new Map(), baseOrder, warnings));
  const rule = root.first;
  return rule?.type === "rule" ? rule.nodes.map((node) => node.toString()).join(";") : css;
}
