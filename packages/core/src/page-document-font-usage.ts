import type { Root } from "postcss";

/** Conservative unicode-range filtering; unknown generated text keeps every face. */
export function unusedFontRange(range: string, text: string, roots: readonly Root[]): boolean {
  if (range.trim() === "") return false;
  let generated = "•◦▪–—";
  let unknown = false;
  let quoteContent = false;
  let quotesDeclared = false;
  for (const root of roots) {
    root.walkAtRules("counter-style", () => {
      unknown = true;
    });
    root.walkDecls((decl) => {
      if (/^quotes$/i.test(decl.prop)) {
        // Quote marks come from `quotes`, or from the language when it is auto or inherited.
        quotesDeclared = true;
        if (/^(auto|initial|inherit|unset|revert)/i.test(decl.value.trim())) unknown = true;
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
          (/^list-style/i.test(decl.prop) &&
            !/^(none|disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-latin|upper-latin|lower-roman|upper-roman)$/.test(
              decl.value,
            ))
        )
          unknown = true;
        generated += decl.value.replace(/\\([a-f\d]{1,6})\s?/gi, (_, hex: string) =>
          String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)),
        );
      }
    });
  }
  if (unknown || (quoteContent && !quotesDeclared)) return false;
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
