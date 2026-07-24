export const PRINT_ROOT_ATTRIBUTE = "data-imposia-print-root";
export const PRINT_STYLE_ATTRIBUTE = "data-imposia-print-style";

const PRINT_ROOT_RETENTION_MS = 60_000;
const PRINT_ISOLATION_CSS = `@media print{body>:not([${PRINT_ROOT_ATTRIBUTE}]){display:none!important}[${PRINT_ROOT_ATTRIBUTE}]{display:block!important;position:static!important;inset:auto!important;margin:0!important;padding:0!important;border:0!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;transform:none!important;filter:none!important;opacity:1!important;visibility:visible!important;overflow:visible!important;contain:none!important;z-index:auto!important}html,body{margin:0!important;padding:0!important;background:#fff!important;width:auto!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}}`;
const PRINT_SHADOW_BASE_CSS = "[data-imposia-pages]{all:initial;display:block;color-scheme:light}";
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

export function collectHoistedPagedMediaRules(rules: CSSRuleList, hoisted: string[]): void {
  for (const rule of rules) {
    if (rule.type === CSSRule.PAGE_RULE || rule.type === CSSRule.FONT_FACE_RULE) {
      hoisted.push(rule.cssText);
      continue;
    }
    if (hasNestedRules(rule)) collectHoistedPagedMediaRules(rule.cssRules, hoisted);
  }
}

export function createPagesWrapper(topDocument: Document, sourceDocument: Document): HTMLElement {
  const wrapper = topDocument.createElement("div");
  wrapper.setAttribute("data-imposia-pages", "");
  const sourceWindow = sourceDocument.defaultView;
  if (sourceWindow !== null) {
    const bodyStyle = sourceWindow.getComputedStyle(sourceDocument.body);
    for (const property of INHERITED_BODY_PROPERTIES) {
      wrapper.style.setProperty(property, bodyStyle.getPropertyValue(property));
    }
  }
  for (const child of sourceDocument.body.childNodes) {
    wrapper.append(topDocument.importNode(child, true));
  }
  return wrapper;
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
