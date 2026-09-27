import { expect, type Page } from "@playwright/test";

export interface TopicInput {
  html: string;
  css?: string;
  selectors?: Record<string, string>;
  options?: Record<string, unknown>;
  assets?: Record<string, string>;
  decorate?: boolean;
  freezeColumns?: boolean;
  media?: "screen" | "print";
  inspectPublishingOverlaps?: boolean;
}

export interface NodeView {
  text: string;
  page: number;
  tag: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
  before: string;
  after: string;
  width: number;
  height: number;
  top: number;
  left: number;
}

export interface TopicObservation {
  pages: {
    number: number;
    blank: boolean;
    side: string;
    text: string;
    width: number;
    height: number;
    overflow: number;
    boxes: Record<string, string>;
  }[];
  selected: Record<string, NodeView[]>;
  warnings: readonly { code: string; property?: string; value?: string }[];
  tokens: string[];
  publishingOverlaps: { page: number; kind: string; text: string }[];
  assetRequests: string[];
  scriptRan: boolean;
}

export interface PaginationTopic {
  id: string;
  title: string;
  input: TopicInput;
  check: (result: TopicObservation) => void;
  recovery?: boolean;
}

// Deliberately small sheets and fixed line metrics expose boundary failures
// without long documents, downloaded fonts, or machine-specific screenshots.
export const BASE_CSS = `
  @page { size: 320px 440px; margin: 20px; }
  body { margin: 0; font: 12px/20px monospace; }
  p, h1, h2, h3, pre, ol, ul { margin: 0; font: inherit; }
  p { widows: 1; orphans: 1; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { padding: 0; border: 0; font: inherit; vertical-align: top; }
`;

export const token = (index: number) => `K${String(index).padStart(4, "0")}`;
export const paragraphs = (count: number, height = 40, offset = 0) =>
  Array.from(
    { length: count },
    (_, index) => `<p style="height:${height}px">${token(index + offset)}</p>`,
  ).join("");
export const sheets = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `<p style="${index ? "break-before:page" : ""}">${token(index)}</p>`,
  ).join("");

export function nodes(result: TopicObservation, name = "probe"): NodeView[] {
  const selected = result.selected[name];
  if (selected === undefined) throw new Error(`Missing observation selector: ${name}`);
  return selected;
}

export function boxTexts(result: TopicObservation, name = "bottom-center") {
  return result.pages.map((page) => page.boxes[name] ?? "");
}

export function warning(result: TopicObservation, code: string, property?: string) {
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining(property === undefined ? { code } : { code, property }),
    ]),
  );
}

export async function observeTopic(page: Page, input: TopicInput): Promise<TopicObservation> {
  await page.emulateMedia({ media: input.media ?? "screen" });
  return page.evaluate(
    async ({ input, baseCss }) => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as typeof import("../../packages/core/src/index.js");
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const assetRequests: string[] = [];
      const options = {
        ...input.options,
        css: [baseCss, input.css ?? ""],
        assetResolver: async ({ url }: { url: string }) => {
          assetRequests.push(url);
          const text = input.assets?.[url];
          return text === undefined
            ? { status: "blocked" as const }
            : {
                status: "resolved" as const,
                bytes: new TextEncoder().encode(text),
                mimeType: "text/css",
              };
        },
        extensions: input.decorate
          ? [{ name: "test/page-label", decoratePage: () => ({ headerHtml: "Reviewed sheet" }) }]
          : input.freezeColumns
            ? [core.createTableColgroupExtension()]
            : [],
      };
      const controller = core.mountPageDocument(host, { html: input.html }, options);
      try {
        const ready = await controller.ready;
        const doc = ready.iframe.contentDocument;
        const win = doc?.defaultView;
        if (!doc || !win) throw new Error("Missing committed frame.");
        const pageElements = [...doc.querySelectorAll<HTMLElement>("[data-imposia-page]")];
        if (pageElements.length !== ready.pageCount) throw new Error("Metadata/DOM page mismatch.");
        const styleKeys = [
          "color",
          "background-color",
          "border-top-color",
          "font-size",
          "float",
          "font-weight",
          "text-align",
          "text-align-last",
          "vertical-align",
          "align-items",
          "justify-content",
          "white-space",
          "hyphens",
          "counter-reset",
          "counter-increment",
          "list-style-type",
          "display",
          "position",
          "padding-top",
          "padding-bottom",
          "border-top-width",
          "border-bottom-width",
        ];
        const selected = Object.fromEntries(
          Object.entries(input.selectors ?? {}).map(([name, selector]) => [
            name,
            [...doc.querySelectorAll<HTMLElement>(selector)].map((element) => {
              const rect = element.getBoundingClientRect();
              const owner = element.closest<HTMLElement>("[data-imposia-page]");
              const origin = owner?.getBoundingClientRect();
              const style = win.getComputedStyle(element);
              return {
                text: element.textContent ?? "",
                page: Number(owner?.dataset.imposiaPageNumber ?? 0),
                tag: element.localName,
                attrs: Object.fromEntries([...element.attributes].map((a) => [a.name, a.value])),
                style: Object.fromEntries(
                  styleKeys.map((key) => [key, style.getPropertyValue(key)]),
                ),
                before: win.getComputedStyle(element, "::before").content,
                after: win.getComputedStyle(element, "::after").content,
                width: rect.width,
                height: rect.height,
                top: rect.top - (origin?.top ?? 0),
                left: rect.left - (origin?.left ?? 0),
              };
            }),
          ]),
        );
        const pages = pageElements.map((element, index) => {
          const flow = element.querySelector<HTMLElement>("[data-imposia-page-flow]");
          const content = element.querySelector<HTMLElement>("[data-imposia-page-content]");
          const metadata = ready.pages[index];
          if (!flow || !content || !metadata) throw new Error("Incomplete committed page.");
          const rect = element.getBoundingClientRect();
          return {
            number: metadata.number,
            blank: metadata.blank,
            side: metadata.side,
            text: flow.textContent ?? "",
            width: rect.width,
            height: rect.height,
            overflow: flow.scrollHeight - content.clientHeight,
            boxes: Object.fromEntries(
              [...element.querySelectorAll<HTMLElement>("[data-imposia-margin-box]")].map((box) => [
                box.dataset.imposiaMarginBox ?? "",
                box.textContent?.trim() ?? "",
              ]),
            ),
          };
        });
        const publishingOverlaps: { page: number; kind: string; text: string }[] = [];
        if (input.inspectPublishingOverlaps)
          for (const [index, sheet] of pageElements.entries()) {
            const flow = sheet.querySelector("[data-imposia-page-flow]");
            if (!flow) throw new Error("Missing flow");
            const areas = [
              ...sheet.querySelectorAll<HTMLElement>(
                "[data-imposia-footnote-area], [data-imposia-page-float]",
              ),
            ];
            const walker = doc.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
            const range = doc.createRange();
            for (let text = walker.nextNode(); text; text = walker.nextNode()) {
              if (
                !(text.textContent ?? "").trim() ||
                text.parentElement?.closest("style,script,template")
              )
                continue;
              range.selectNodeContents(text);
              for (const rect of range.getClientRects())
                for (const area of areas) {
                  const box = area.getBoundingClientRect();
                  if (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    rect.right > box.left + 1 &&
                    rect.left < box.right - 1 &&
                    rect.bottom > box.top + 1 &&
                    rect.top < box.bottom - 1
                  )
                    publishingOverlaps.push({
                      page: index + 1,
                      kind: area.hasAttribute("data-imposia-footnote-area") ? "note" : "float",
                      text: text.textContent ?? "",
                    });
                }
            }
          }
        return {
          pages,
          selected,
          publishingOverlaps,
          warnings: ready.warnings,
          tokens: pages.flatMap((item) => item.text.match(/K\d{4}/g) ?? []),
          assetRequests,
          scriptRan: Reflect.get(win, "topicScriptRan") === true,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    },
    { input, baseCss: BASE_CSS },
  );
}
