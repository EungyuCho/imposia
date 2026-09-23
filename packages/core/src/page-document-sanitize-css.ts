import postcss, { type AtRule } from "postcss";
import { hasUnsupportedCssResourceFunction, scanCssUrls } from "./page-document-assets-css.js";
import { sameDocumentFragment } from "./page-document-assets-html.js";

export interface SanitizedCss {
  css: string;
  resourceBlocked: boolean;
}

function decodeCssEscapes(value: string): string {
  return value
    .replace(/\\([0-9a-f]{1,6})(?:[\t\n\r\f ]|(?=$))?/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "�";
    })
    .replace(/\\([^\r\n])/g, "$1");
}

function hasUrlResourceIn(
  text: string,
  preserveResolvedResources: boolean,
  resolvedUrls: ReadonlySet<string> | undefined,
): boolean {
  const tokens = scanCssUrls(text).filter((token) => !sameDocumentFragment(token.url));
  if (tokens.length === 0) return false;
  if (!preserveResolvedResources || resolvedUrls === undefined) return true;
  return tokens.some((token) => !resolvedUrls.has(token.url.trim()));
}

// Each check reads both the authored text and its escape-decoded form. The scanners decode
// escapes inside identifiers, but decoding the whole text first can also turn an escaped
// identifier such as `\22` or `\2f\2a` into a quote or comment opener that hides a real
// url() from a scan of the decoded text alone.

/** Reports url() references only, for attribute values that no CSS parser reads. */
export function hasCssUrlResource(
  value: string,
  preserveResolvedResources = false,
  resolvedUrls?: ReadonlySet<string>,
): boolean {
  return (
    hasUrlResourceIn(value, preserveResolvedResources, resolvedUrls) ||
    hasUrlResourceIn(decodeCssEscapes(value), preserveResolvedResources, resolvedUrls)
  );
}

export function hasCssResource(
  value: string,
  preserveResolvedResources = false,
  resolvedUrls?: ReadonlySet<string>,
): boolean {
  // image-set() and cross-fade() can contain bare string URLs. The URL scanner
  // only handles url(), so none of their arguments can be trusted as resolved.
  if (
    hasUnsupportedCssResourceFunction(value) ||
    hasUnsupportedCssResourceFunction(decodeCssEscapes(value))
  ) {
    return true;
  }
  return hasCssUrlResource(value, preserveResolvedResources, resolvedUrls);
}

/**
 * The part of an at-rule that belongs to the rule itself. Nested rules and declarations are
 * checked on their own by the walks in sanitizeCss, so one unresolved declaration inside
 * `@media print` removes that declaration, not the whole block.
 */
function atRuleHeader(rule: AtRule): string {
  return `${rule.raws.afterName ?? " "}${rule.raws.params?.raw ?? rule.params}${rule.raws.between ?? ""}`;
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
    const resourceRule = hasCssResource(
      name === "font-face" ? rule.toString() : atRuleHeader(rule),
      preserveResolvedResources,
      resolvedUrls,
    );
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
