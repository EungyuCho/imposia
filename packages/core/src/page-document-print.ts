export const PRINT_ROOT_ATTRIBUTE = "data-imposia-print-root";
export const PRINT_STYLE_ATTRIBUTE = "data-imposia-print-style";

const PRINT_ROOT_RETENTION_MS = 60_000;
const PRINT_ISOLATION_CSS = `@media print{body>:not([${PRINT_ROOT_ATTRIBUTE}]){display:none!important}[${PRINT_ROOT_ATTRIBUTE}]{display:block!important;position:static!important;inset:auto!important;margin:0!important;padding:0!important;border:0!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;transform:none!important;filter:none!important;opacity:1!important;visibility:visible!important;overflow:visible!important;contain:none!important;z-index:auto!important}html,body{margin:0!important;padding:0!important;background:#fff!important;width:auto!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}}`;
// `print-color-adjust: exact` keeps the printed sheet matching the composed page.
//
// Chromium's default is `economy`, which lets the engine drop backgrounds when printing --
// a shaded table header composes grey on screen and prints white unless the reader happens
// to tick "Background graphics" in the print dialog. For a library whose contract is that
// the pages you see are the pages you get, that silent divergence is a defect, not a
// preference, so fidelity is the default here.
//
// The property is inherited, and the `all: initial` above resets it on the host, so the
// longhand has to follow the shorthand to survive. WebKit still needs the prefix.
//
// Deliberately not `!important`: this rule is the first stylesheet in the shadow root and
// the generation's own styles are appended after it, so a consumer that genuinely wants
// ink-saving output can still set `print-color-adjust: economy` on their content.
const PRINT_SHADOW_BASE_CSS =
  ":host{all:initial;display:block;color-scheme:light;-webkit-print-color-adjust:exact;print-color-adjust:exact}";
const INHERITED_BODY_PROPERTIES = [
  "color",
  "direction",
  "font-family",
  "font-feature-settings",
  "font-kerning",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "line-height",
  "tab-size",
  "text-transform",
  "word-spacing",
  "writing-mode",
] as const;

function hasNestedRules(rule: CSSRule): rule is CSSGroupingRule {
  return "cssRules" in rule;
}

function copyPrintElementContext(source: Element, target: HTMLElement, sourceWindow: Window): void {
  for (const attribute of source.attributes) {
    target.setAttribute(attribute.name, attribute.value);
  }
  const computedStyle = sourceWindow.getComputedStyle(source);
  for (let index = 0; index < computedStyle.length; index += 1) {
    const property = computedStyle.item(index);
    if (!property.startsWith("--")) continue;
    target.style.setProperty(property, computedStyle.getPropertyValue(property));
  }
}

export function collectHoistedPagedMediaRules(rules: CSSRuleList, hoisted: string[]): void {
  for (const rule of rules) {
    if (rule.type === CSSRule.PAGE_RULE || rule.type === CSSRule.FONT_FACE_RULE) {
      hoisted.push(rule.cssText);
      continue;
    }
    if (hasNestedRules(rule)) collectHoistedPagedMediaRules(rule.cssRules, hoisted);
  }
}

/**
 * Counter behind the per-print family namespace.
 *
 * Only ever names a transient stylesheet in the top document, so it cannot reach pages or
 * warnings and does not weaken the determinism invariant the way a clock or RNG would.
 */
let printFamilyNamespace = 0;

function quoteFamily(name: string): string {
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Splits a `font-family` list into its entries, respecting quotes. */
function familyEntries(value: string): readonly string[] {
  const parts: string[] = [];
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== undefined) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === ",") {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function bareFamily(entry: string): string {
  const trimmed = entry.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.replace(/\\(.)/g, "$1");
}

// Not `instanceof CSSStyleRule`: the walked rules belong to the top document, and when the
// host application runs inside a same-origin iframe their constructors come from that
// realm, so every instanceof check would be false and no rule would be rewritten -- the
// faces would be renamed while their uses kept the old names, composing the whole shadow
// in fallback faces. Duck-typing keeps the walk realm-proof, like `hasNestedRules` above.
function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return "selectorText" in rule;
}

/**
 * Renames every hoisted `@font-face` family, and rewrites the cloned content to match.
 *
 * `@font-face` is ignored inside a shadow tree, so the composed document's faces have to be
 * hoisted into the top document to take effect at all. That puts them in the same namespace
 * as whatever the host application already declared, and font matching does not care which
 * stylesheet a face came from: a weight or unicode-range the composed document never loaded
 * can still be satisfied by a host face. The printed sheet then differs from the page that
 * was composed -- with a real bold where the preview synthesised one, say -- and nothing
 * says so.
 *
 * Namespacing closes that: the host's declarations can no longer match, so the print falls
 * back exactly where the composed document fell back.
 *
 * Families the hoisted faces do not declare are left alone, so generic keywords and system
 * fonts keep resolving normally.
 */
export function isolateHoistedFontFamilies(shadow: ShadowRoot, hoisted: string[]): void {
  printFamilyNamespace += 1;
  const prefix = `imposia-print-${printFamilyNamespace}--`;
  // Keyed on the lowercased family: CSS matches font-family case-insensitively, so a
  // declaration and a usage that differ only in case must land on the same rename.
  const renamed = new Map<string, string>();

  for (const [index, cssText] of hoisted.entries()) {
    const match = /@font-face\s*\{[^}]*?font-family\s*:\s*([^;}]+)/i.exec(cssText);
    const declared = match?.[1] === undefined ? undefined : bareFamily(match[1]);
    if (declared === undefined || declared === "") continue;

    const key = declared.toLowerCase();
    const namespaced = renamed.get(key) ?? `${prefix}${declared}`;
    renamed.set(key, namespaced);
    hoisted[index] = cssText.replace(
      /(@font-face\s*\{[^}]*?font-family\s*:\s*)([^;}]+)/i,
      (_whole, head: string) => `${head}${quoteFamily(namespaced)}`,
    );
  }

  if (renamed.size === 0) return;

  const rewrite = (style: CSSStyleDeclaration): void => {
    const value = style.getPropertyValue("font-family");
    if (value === "") return;
    const mapped = familyEntries(value)
      .map((entry) => {
        const replacement = renamed.get(bareFamily(entry).toLowerCase());
        return replacement === undefined ? entry.trim() : quoteFamily(replacement);
      })
      .join(", ");
    if (mapped !== value)
      style.setProperty("font-family", mapped, style.getPropertyPriority("font-family"));
  };

  const walkRules = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      if (isStyleRule(rule)) rewrite(rule.style);
      if (hasNestedRules(rule)) walkRules(rule.cssRules);
    }
  };

  for (const sheet of shadow.styleSheets) {
    try {
      walkRules(sheet.cssRules);
    } catch (_error: unknown) {
      // A sheet Core cannot read is one it did not author; leaving it alone is correct.
    }
  }
  for (const element of shadow.querySelectorAll<HTMLElement>("[style]")) rewrite(element.style);
}

export function createPagesWrapper(topDocument: Document, sourceDocument: Document): HTMLElement {
  const html = topDocument.createElement("html");
  const body = topDocument.createElement("body");
  body.setAttribute("data-imposia-pages", "");
  const sourceWindow = sourceDocument.defaultView;
  if (sourceWindow !== null) {
    copyPrintElementContext(sourceDocument.documentElement, html, sourceWindow);
    copyPrintElementContext(sourceDocument.body, body, sourceWindow);
    const bodyStyle = sourceWindow.getComputedStyle(sourceDocument.body);
    for (const property of INHERITED_BODY_PROPERTIES) {
      body.style.setProperty(property, bodyStyle.getPropertyValue(property));
    }
  }
  for (const child of sourceDocument.body.childNodes) {
    body.append(topDocument.importNode(child, true));
  }
  html.append(body);
  return html;
}

export function commitPrintRoot(
  topDocument: Document,
  sourceDocument: Document,
): Readonly<{
  root: HTMLElement;
  shadow: ShadowRoot;
  isolationStyle: HTMLStyleElement;
}> {
  const root = topDocument.createElement("div");
  root.setAttribute(PRINT_ROOT_ATTRIBUTE, "");
  root.setAttribute("aria-hidden", "true");
  root.style.display = "none";
  const language = sourceDocument.documentElement.lang;
  if (language !== "") root.lang = language;
  const shadow = root.attachShadow({ mode: "open" });
  const baseStyle = topDocument.createElement("style");
  baseStyle.textContent = PRINT_SHADOW_BASE_CSS;
  shadow.append(baseStyle);

  const hoisted: string[] = [];
  for (const sourceStyle of sourceDocument.head.querySelectorAll<HTMLStyleElement>("style")) {
    const sheet = sourceStyle.sheet;
    if (sheet !== null) collectHoistedPagedMediaRules(sheet.cssRules, hoisted);
    shadow.append(topDocument.importNode(sourceStyle, true));
  }
  shadow.append(createPagesWrapper(topDocument, sourceDocument));
  topDocument.body.append(root);
  // Must run after the pages are in the shadow: the rewrite also covers inline styles on
  // the cloned content, including the inherited body properties copied above.
  isolateHoistedFontFamilies(shadow, hoisted);

  const isolationStyle = topDocument.createElement("style");
  isolationStyle.setAttribute(PRINT_STYLE_ATTRIBUTE, "");
  isolationStyle.textContent = `${PRINT_ISOLATION_CSS}${hoisted.join("")}`;
  topDocument.head.append(isolationStyle);
  return Object.freeze({ root, shadow, isolationStyle });
}

function settleWithinDeadline(
  topWindow: Window,
  task: Promise<void>,
  deadlineMs: number,
): Promise<void> {
  if (deadlineMs <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = topWindow.setTimeout(resolve, deadlineMs);
    void task.then(
      () => {
        topWindow.clearTimeout(timeout);
        resolve();
      },
      () => {
        topWindow.clearTimeout(timeout);
        resolve();
      },
    );
  });
}

export async function settlePrintAssets(
  topDocument: Document,
  shadow: ShadowRoot,
  previousFonts: ReadonlySet<FontFace>,
  deadlineMs: number,
): Promise<void> {
  const topWindow = topDocument.defaultView;
  if (topWindow === null) return;
  const fonts = Array.from(topDocument.fonts)
    .filter((font) => !previousFonts.has(font))
    .map((font) =>
      font.load().then(
        () => undefined,
        () => undefined,
      ),
    );
  const images = Array.from(shadow.querySelectorAll<HTMLImageElement>("img")).map((image) =>
    image.decode().then(
      () => undefined,
      () => undefined,
    ),
  );
  await settleWithinDeadline(
    topWindow,
    Promise.all([...fonts, ...images]).then(() => undefined),
    deadlineMs,
  );
}

export async function printComposedPageDocument(
  sourceDocument: Document,
  assetDeadlineMs = 30_000,
): Promise<void> {
  const sourceWindow = sourceDocument.defaultView;
  const topWindow = sourceWindow?.top;
  if (topWindow === null || topWindow === undefined) {
    throw new Error("The page document has no top-level print window.");
  }
  const topDocument = topWindow.document;
  const previousFonts = new Set(Array.from(topDocument.fonts));
  const { root, shadow, isolationStyle } = commitPrintRoot(topDocument, sourceDocument);
  let removed = false;
  let retentionTimer: number | undefined;
  const removeRoot = () => {
    if (removed) return;
    removed = true;
    topWindow.removeEventListener("afterprint", removeRoot);
    if (retentionTimer !== undefined) topWindow.clearTimeout(retentionTimer);
    root.remove();
    isolationStyle.remove();
  };
  try {
    await settlePrintAssets(topDocument, shadow, previousFonts, assetDeadlineMs);
    topWindow.addEventListener("afterprint", removeRoot, { once: true });
    topWindow.print();
    if (!removed) retentionTimer = topWindow.setTimeout(removeRoot, PRINT_ROOT_RETENTION_MS);
  } catch (error: unknown) {
    removeRoot();
    throw error;
  }
}
