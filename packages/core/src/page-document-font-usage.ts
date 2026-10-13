import type { Root } from "postcss";

const PREDEFINED_LIST_TYPES = new Set([
  "none",
  "disc",
  "circle",
  "square",
  "decimal",
  "decimal-leading-zero",
  "lower-alpha",
  "upper-alpha",
  "lower-latin",
  "upper-latin",
  "lower-roman",
  "upper-roman",
]);

function knownListStyle(property: string, value: string): boolean {
  const tokens = value.trim().toLowerCase().split(/\s+/);
  if (property.toLowerCase() === "list-style-type") {
    return tokens.length === 1 && PREDEFINED_LIST_TYPES.has(tokens[0] ?? "");
  }
  if (tokens.length > 2) return false;
  let types = 0;
  let positions = 0;
  for (const token of tokens) {
    if (PREDEFINED_LIST_TYPES.has(token)) types += 1;
    else if (token === "inside" || token === "outside") positions += 1;
    else return false;
  }
  return types <= 1 && positions <= 1;
}

/** Conservative unicode-range filtering; unknown generated text keeps every face. */
export function unusedFontRange(range: string, text: string, roots: readonly Root[]): boolean {
  if (range.trim() === "") return false;
  let generated = "•◦▪–—";
  let unknown = false;
  let quoteContent = false;
  for (const root of roots) {
    root.walkAtRules("counter-style", () => {
      unknown = true;
    });
    root.walkDecls((decl) => {
      // Case mapping depends on language and can introduce code points absent from
      // the authored text (Greek alpha -> capital alpha, Turkish i -> dotted I).
      // Full-width and kana transforms also need the browser's shaping context.
      if (/^text-transform$/i.test(decl.prop) && decl.value.trim().toLowerCase() !== "none") {
        unknown = true;
      }
      if (/^quotes$/i.test(decl.prop)) {
        // Kept for the characters it names; whether it applies to a given element is
        // decided below, because selectors, inheritance, and variables are not resolved.
        generated += decl.value.replace(/\\([a-f\d]{1,6})\s?/gi, (_, hex: string) =>
          String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)),
        );
      }
      if (/^content$/i.test(decl.prop) && /\b(?:open|close)-quote\b/i.test(decl.value)) {
        quoteContent = true;
      }
      if (/^(content|list-style|list-style-type)$/i.test(decl.prop)) {
        if (
          /\b(attr|var|counters)\s*\(/i.test(decl.value) ||
          /counter\([^)]*,\s*(?!(?:decimal|lower-roman|upper-roman|lower-alpha|upper-alpha)\s*\))[^)]*\)/i.test(
            decl.value,
          ) ||
          (/^list-style/i.test(decl.prop) && !knownListStyle(decl.prop, decl.value))
        )
          unknown = true;
        generated += decl.value.replace(/\\([a-f\d]{1,6})\s?/gi, (_, hex: string) =>
          String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)),
        );
      }
    });
  }
  if (unknown || quoteContent) return false;
  const points = [...(text + generated)].map((char) => char.codePointAt(0) ?? 0);
  for (let code = 32; code <= 126; code++) points.push(code);
  for (const part of range.split(",")) {
    const match = /^U\+([\dA-F?]{1,6})(?:-([\dA-F]{1,6}))?$/i.exec(part.trim());
    if (match === null) return false;
    const start = Number.parseInt((match[1] ?? "").replaceAll("?", "0"), 16);
    const end = Number.parseInt(match[2] ?? (match[1] ?? "").replaceAll("?", "F"), 16);
    if (start > end || end > 0x10ffff || points.some((point) => start <= point && point <= end))
      return false;
  }
  return true;
}
