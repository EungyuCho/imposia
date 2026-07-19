import postcss, { type AtRule, type Declaration, type Root } from "postcss";

export type CssReferenceKind = "font" | "image" | "stylesheet";

export type CssUrlToken = {
  readonly start: number;
  readonly end: number;
  readonly url: string;
};

export type CssReference = {
  readonly kind: CssReferenceKind;
  readonly node: AtRule | Declaration;
  readonly token: CssUrlToken;
  readonly importRule: boolean;
};

function escapedCharacter(
  text: string,
  index: number,
): { readonly value: string; readonly end: number } {
  const next = text[index + 1];
  if (next === undefined) return { value: "", end: index + 1 };
  const hex = text.slice(index + 1).match(/^[0-9a-f]{1,6}/i)?.[0];
  if (hex !== undefined) {
    const end = index + 1 + hex.length;
    const codePoint = Number.parseInt(hex, 16);
    return { value: String.fromCodePoint(codePoint <= 0x10ffff ? codePoint : 0xfffd), end };
  }
  return { value: next, end: index + 2 };
}

function identifierAt(
  text: string,
  index: number,
): { readonly value: string; readonly end: number } {
  let end = index;
  let value = "";
  while (end < text.length) {
    const character = text[end];
    if (character === "\\") {
      const escaped = escapedCharacter(text, end);
      value += escaped.value;
      end = escaped.end;
      continue;
    }
    if (character === undefined || !/[a-z0-9_-]/i.test(character)) break;
    value += character;
    end += 1;
  }
  return { value, end };
}

function quotedEnd(text: string, start: number, quote: string): number {
  let index = start;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === quote) return index;
    index += 1;
  }
  return -1;
}

export function scanCssUrls(text: string): readonly CssUrlToken[] {
  const tokens: CssUrlToken[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      continue;
    }
    if (character === "'" || character === '"') {
      const end = quotedEnd(text, index + 1, character);
      index = end < 0 ? text.length : end + 1;
      continue;
    }
    const identifier = identifierAt(text, index);
    if (identifier.end === index) {
      index += 1;
      continue;
    }
    if (identifier.value.toLowerCase() !== "url") {
      index = identifier.end;
      continue;
    }
    let open = identifier.end;
    while (/\s/.test(text[open] ?? "")) open += 1;
    if (text[open] !== "(") {
      index = identifier.end;
      continue;
    }
    let content = open + 1;
    while (/\s/.test(text[content] ?? "")) content += 1;
    const quote = text[content] === "'" || text[content] === '"' ? text[content] : undefined;
    const start = quote === undefined ? content : content + 1;
    const end = quote === undefined ? text.indexOf(")", start) : quotedEnd(text, start, quote);
    if (end < 0) {
      index = text.length;
      continue;
    }
    const rawEnd = quote === undefined ? end : end;
    const raw = text.slice(start, rawEnd).trim();
    const leading = text.slice(start, rawEnd).search(/\S/);
    const tokenStart = leading < 0 ? start : start + leading;
    tokens.push({ start: tokenStart, end: tokenStart + raw.length, url: raw });
    index = quote === undefined ? end + 1 : end + 1;
  }
  return tokens;
}

export function hasUnsupportedCssResourceFunction(text: string): boolean {
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === "'" || character === '"') {
      const end = quotedEnd(text, index + 1, character);
      index = end < 0 ? text.length : end + 1;
      continue;
    }
    const identifier = identifierAt(text, index);
    if (identifier.end === index) {
      index += 1;
      continue;
    }
    let open = identifier.end;
    while (/\s/.test(text[open] ?? "")) open += 1;
    const functionName = identifier.value.toLowerCase();
    if (
      (functionName === "image" ||
        functionName === "src" ||
        functionName.endsWith("image-set") ||
        functionName.endsWith("cross-fade")) &&
      text[open] === "("
    ) {
      return true;
    }
    index = identifier.end;
  }
  return false;
}

function importToken(params: string): CssUrlToken | undefined {
  let start = 0;
  while (/\s/.test(params[start] ?? "")) start += 1;
  const quote = params[start] === "'" || params[start] === '"' ? params[start] : undefined;
  if (quote !== undefined) {
    const end = quotedEnd(params, start + 1, quote);
    if (end < 0) return undefined;
    return { start: start + 1, end, url: params.slice(start + 1, end) };
  }
  return scanCssUrls(params)[0];
}

export function cssReferences(root: Root): readonly CssReference[] {
  const references: CssReference[] = [];
  root.walk((node) => {
    if (node.type === "atrule") {
      const name = identifierAt(node.name, 0).value.toLowerCase();
      if (name === "import") {
        const token = importToken(node.params);
        if (token !== undefined) {
          references.push({ kind: "stylesheet", node, token, importRule: true });
        }
        return;
      }
      if (hasUnsupportedCssResourceFunction(node.params)) return;
      for (const token of scanCssUrls(node.params)) {
        references.push({ kind: "image", node, token, importRule: false });
      }
      return;
    }
    if (node.type !== "decl") return;
    if (node.prop.trim().toLowerCase() === "src") {
      node.value = node.value.replace(/\blocal\s*\([^)]*\)\s*,?/gi, "");
    }
    if (hasUnsupportedCssResourceFunction(node.value)) return;
    const kind: CssReferenceKind = node.prop.trim().toLowerCase() === "src" ? "font" : "image";
    for (const token of scanCssUrls(node.value)) {
      references.push({ kind, node, token, importRule: false });
    }
  });
  return references;
}

export function parseCss(css: string, inline: boolean): Root {
  return postcss.parse(inline ? `x{${css}}` : css);
}

export function inlineCss(root: Root): string {
  const first = root.first;
  if (first?.type !== "rule") return "";
  return first.nodes.map((node) => node.toString()).join(";");
}

export function replaceCssRange(text: string, token: CssUrlToken, replacement: string): string {
  return `${text.slice(0, token.start)}${replacement}${text.slice(token.end)}`;
}
