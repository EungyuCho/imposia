import postcss from "postcss";
import { scanCssUrls } from "./page-document-assets-css.js";
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

export function hasCssResource(
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
