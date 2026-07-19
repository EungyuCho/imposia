import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type PageDocument = Readonly<{
  iframe: HTMLIFrameElement;
  pageCount: number;
  pages: readonly Readonly<{
    geometry: Readonly<{
      contentWidthCssPx: number;
      contentHeightCssPx: number;
    }>;
  }>[];
  warnings: readonly Readonly<{
    code: string;
    sourceIdentity?: string;
    property?: string;
    value?: string;
    recovery?: string;
  }>[];
}>;

type Controller = Readonly<{
  ready: Promise<PageDocument>;
  destroy(): Promise<void>;
}>;

type CoreModule = Readonly<{
  mountPageDocument(container: HTMLElement, source: { html: string }): Controller;
}>;

const CJK_SOURCES = {
  ko: `CJK-KO-START ${"한글 문장의 자연스러운 줄바꿈과 페이지 흐름을 확인합니다. ".repeat(120)}CJK-KO-END`,
  ja: `CJK-JA-START ${"日本語の自然な改行とページの流れを確認します。".repeat(120)} CJK-JA-END`,
  zh: `CJK-ZH-START ${"中文段落的自然换行与分页顺序保持稳定。".repeat(120)} CJK-ZH-END`,
} as const;

test("preserves CJK paragraphs and legal widow/orphan boundaries deterministically", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(
      async ({ sources }) => {
        const core = (await import("/packages/core/dist/index.js")) as CoreModule;
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const html = `
          <style>
            .cjk-paragraph {
              box-sizing: border-box;
              width: 520px;
              margin: 0;
              font: 20px/32px Arial, sans-serif;
              line-break: auto;
              word-break: normal;
              widows: 4;
              orphans: 4;
            }
            .cjk-ko { word-break: keep-all; }
          </style>
          <p class="cjk-paragraph cjk-ko" lang="ko" style="widows: 4; orphans: 4" data-cjk="ko">${sources.ko}</p>
          <p class="cjk-paragraph" lang="ja" style="widows: 4; orphans: 4" data-cjk="ja">${sources.ja}</p>
          <p class="cjk-paragraph" lang="zh-Hans" style="widows: 4; orphans: 4" data-cjk="zh">${sources.zh}</p>
        `;
        const run = async () => {
          const controller = core.mountPageDocument(host, { html });
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
            const paragraphs = Object.fromEntries(
              Object.keys(sources).map((id) => {
                const fragments = pages.flatMap((pageElement, pageIndex) =>
                  [...pageElement.querySelectorAll<HTMLElement>(`[data-cjk="${id}"]`)].map(
                    (element) => {
                      const range = frameDocument.createRange();
                      range.selectNodeContents(element);
                      const lineTops = new Set(
                        [...range.getClientRects()]
                          .filter((rect) => rect.width > 0 && rect.height > 0)
                          .map((rect) => Math.round(rect.top)),
                      );
                      range.detach();
                      const style = getComputedStyle(element);
                      return {
                        pageIndex,
                        text: element.textContent ?? "",
                        lineCount: lineTops.size,
                        lang: element.lang,
                        lineBreak: style.lineBreak,
                        wordBreak: style.wordBreak,
                        authoredConstraints: element.getAttribute("style"),
                      };
                    },
                  ),
                );
                return [id, fragments];
              }),
            );
            return {
              pageCount: ready.pageCount,
              paragraphs,
              cssSupportsWidows: CSS.supports("widows", "4"),
              warningCodes: ready.warnings.map((warning) => warning.code),
            };
          } finally {
            await controller.destroy();
          }
        };
        const first = await run();
        const second = await run();
        host.remove();
        return { first, second };
      },
      { sources: CJK_SOURCES },
    );

    expect(observation.second).toEqual(observation.first);
    expect(observation.first.pageCount).toBeGreaterThanOrEqual(6);
    for (const [id, source] of Object.entries(CJK_SOURCES)) {
      const fragments = observation.first.paragraphs[id] ?? [];
      expect(fragments.length, id).toBeGreaterThanOrEqual(2);
      expect(fragments.map((fragment) => fragment.text).join(""), id).toBe(source);
      expect(
        fragments.every((fragment) => fragment.lineCount >= 4),
        id,
      ).toBe(true);
      expect(
        fragments.every((fragment) => fragment.authoredConstraints?.includes("widows: 4")),
      ).toBe(true);
      expect(fragments.map((fragment) => fragment.pageIndex)).toEqual(
        [...fragments.map((fragment) => fragment.pageIndex)].sort((left, right) => left - right),
      );
    }
    expect(observation.first.paragraphs.ko?.every((fragment) => fragment.lang === "ko")).toBe(true);
    expect(
      observation.first.paragraphs.ko?.every((fragment) => fragment.wordBreak === "keep-all"),
    ).toBe(true);
    expect(observation.first.paragraphs.ja?.every((fragment) => fragment.lang === "ja")).toBe(true);
    expect(observation.first.paragraphs.zh?.every((fragment) => fragment.lang === "zh-Hans")).toBe(
      true,
    );
    expect(observation.first.warningCodes).not.toContain("WIDOW_ORPHAN_RELAXED");
    expect(observation.first.warningCodes).not.toContain("PAGE_OVERFLOW");
    expect(
      observation.first.warningCodes.filter((code) => code === "WIDOW_ORPHAN_FALLBACK"),
    ).toHaveLength(observation.first.cssSupportsWidows ? 0 : 3);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("preserves language-aware auto hyphenation and diagnoses an untagged fallback", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as CoreModule;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const taggedText = `HYPHEN-TAGGED ${"characteristically internationalization representation ".repeat(20)}`;
      const rootTaggedText = `HYPHEN-ROOT ${"characteristically internationalization representation ".repeat(20)}`;
      const untaggedText = `HYPHEN-UNTAGGED ${"characteristically internationalization representation ".repeat(20)}`;
      const html = `<!doctype html><html lang="en"><head>
        <style>
          .hyphenation { width: 190px; margin: 0; font: 18px/28px serif; hyphens: auto; }
        </style>
        </head><body>
        <section style="hyphens: auto">
          <p class="hyphenation" lang="en" data-hyphenation="tagged">${taggedText}</p>
        </section>
        <p class="hyphenation" data-hyphenation="root">${rootTaggedText}</p>
        <section lang="en">
          <p class="hyphenation" lang="" data-hyphenation="untagged">${untaggedText}</p>
        </section>
        </body></html>`;
      const run = async () => {
        const controller = core.mountPageDocument(host, { html });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const inspect = (id: string) => {
            const fragments = [
              ...frameDocument.querySelectorAll<HTMLElement>(`[data-hyphenation="${id}"]`),
            ];
            return {
              text: fragments.map((element) => element.textContent ?? "").join(""),
              hyphens: fragments.map((element) => getComputedStyle(element).hyphens),
            };
          };
          return {
            cssSupportsAuto: CSS.supports("hyphens", "auto"),
            rootLanguage: frameDocument.documentElement.getAttribute("lang"),
            tagged: inspect("tagged"),
            rootTagged: inspect("root"),
            untagged: inspect("untagged"),
            warnings: ready.warnings.map((warning) => ({
              code: warning.code,
              sourceIdentity: warning.sourceIdentity,
              property: warning.property,
              value: warning.value,
              recovery: warning.recovery,
            })),
          };
        } finally {
          await controller.destroy();
        }
      };
      const first = await run();
      const second = await run();
      host.remove();
      return { first, second, taggedText, rootTaggedText, untaggedText };
    });

    expect(observation.second).toEqual(observation.first);
    expect(observation.first.cssSupportsAuto).toBe(true);
    expect(observation.first.rootLanguage).toBe("en");
    expect(observation.first.tagged.text).toBe(observation.taggedText);
    expect(observation.first.tagged.hyphens.every((value) => value === "auto")).toBe(true);
    expect(observation.first.rootTagged.text).toBe(observation.rootTaggedText);
    expect(observation.first.rootTagged.hyphens.every((value) => value === "auto")).toBe(true);
    expect(observation.first.untagged.text).toBe(observation.untaggedText);
    expect(observation.first.untagged.hyphens.every((value) => value === "manual")).toBe(true);
    const fallbackWarnings = observation.first.warnings.filter(
      (warning) => warning.code === "HYPHENATION_FALLBACK",
    );
    expect(fallbackWarnings).toHaveLength(1);
    expect(fallbackWarnings[0]).toMatchObject({
      property: "hyphens",
      value: "auto",
      recovery: "Used manual hyphenation because the content language is unknown.",
    });
    expect(fallbackWarnings[0]?.sourceIdentity).toMatch(/^source-\d+:p$/u);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("recovers long tokens when wrapping is allowed and diagnoses nowrap overflow", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as CoreModule;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const recoverableToken = `https://example.test/${"recoverable".repeat(80)}`;
      const nowrapToken = `UNBREAKABLE-${"nowrap".repeat(100)}`;
      const html = `
        <style>
          .prelude { height: 900px; margin: 0; }
          .long-token { box-sizing: border-box; margin: 0; font: 16px/24px monospace; }
          .recoverable-token { width: 220px; }
          .nowrap-token { white-space: nowrap; }
        </style>
        <div class="prelude">TOKEN-PRELUDE</div>
        <section>
          <p class="long-token recoverable-token" data-token="recoverable">${recoverableToken}</p>
          <p class="long-token nowrap-token" data-token="nowrap">${nowrapToken}</p>
        </section>
      `;
      const run = async () => {
        const controller = core.mountPageDocument(host, { html });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const contentWidth = ready.pages[0]?.geometry.contentWidthCssPx ?? 0;
          const inspect = (id: string) => {
            const fragments = [
              ...frameDocument.querySelectorAll<HTMLElement>(`[data-token="${id}"]`),
            ];
            return {
              text: fragments.map((element) => element.textContent ?? "").join(""),
              fragmentCount: fragments.length,
              overflowWrap: fragments.map((element) => getComputedStyle(element).overflowWrap),
              whiteSpace: fragments.map((element) => getComputedStyle(element).whiteSpace),
              inlineFits: fragments.map((element) => {
                const bounds = element.getBoundingClientRect();
                return Math.max(element.scrollWidth, bounds.width) <= contentWidth + 1;
              }),
            };
          };
          return {
            pageCount: ready.pageCount,
            recoverable: inspect("recoverable"),
            nowrap: inspect("nowrap"),
            warnings: ready.warnings.map((warning) => ({
              code: warning.code,
              sourceIdentity: warning.sourceIdentity,
              property: warning.property,
              value: warning.value,
              recovery: warning.recovery,
            })),
          };
        } finally {
          await controller.destroy();
        }
      };
      const first = await run();
      const second = await run();
      host.remove();
      return { first, second, recoverableToken, nowrapToken };
    });

    expect(observation.second).toEqual(observation.first);
    expect(observation.first.pageCount).toBeGreaterThanOrEqual(2);
    expect(observation.first.recoverable.text).toBe(observation.recoverableToken);
    expect(observation.first.recoverable.overflowWrap.every((value) => value === "anywhere")).toBe(
      true,
    );
    expect(observation.first.recoverable.inlineFits.every(Boolean)).toBe(true);
    expect(observation.first.nowrap.text).toBe(observation.nowrapToken);
    expect(observation.first.nowrap.whiteSpace.every((value) => value === "nowrap")).toBe(true);
    expect(observation.first.nowrap.inlineFits).toContain(false);
    const tokenWarnings = observation.first.warnings.filter(
      (warning) => warning.code === "UNBREAKABLE_CONTENT",
    );
    expect(tokenWarnings).toHaveLength(2);
    expect(tokenWarnings.every((warning) => warning.sourceIdentity?.match(/^source-\d+:p$/u))).toBe(
      true,
    );
    expect(tokenWarnings.map((warning) => warning.recovery).sort()).toEqual([
      "Applied overflow-wrap: anywhere.",
      "Kept authored white-space and reported page overflow.",
    ]);
    expect(
      observation.first.warnings.filter((warning) => warning.code === "PAGE_OVERFLOW"),
    ).toHaveLength(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps overflowing vertical CJK atomic with explicit diagnostics", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as CoreModule;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const sourceText = `VERTICAL-JA ${"縦書きの長い文章を安全に診断します。".repeat(160)}`;
      const html = `
        <style>
          .vertical-overflow {
            height: 480px;
            margin: 0;
            font: 20px/32px serif;
            writing-mode: vertical-rl;
          }
        </style>
        <p class="vertical-overflow" lang="ja" data-vertical-overflow>${sourceText}</p>
      `;
      const run = async () => {
        const controller = core.mountPageDocument(host, { html });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const geometry = ready.pages[0]?.geometry;
          const fragments = [
            ...frameDocument.querySelectorAll<HTMLElement>("[data-vertical-overflow]"),
          ];
          return {
            pageCount: ready.pageCount,
            fragmentCount: fragments.length,
            text: fragments.map((element) => element.textContent ?? "").join(""),
            inlineFits: fragments.map((element) => {
              const bounds = element.getBoundingClientRect();
              return (
                Math.max(element.scrollHeight, bounds.height) <=
                  (geometry?.contentHeightCssPx ?? 0) + 1 &&
                Math.max(element.scrollWidth, bounds.width) <=
                  (geometry?.contentWidthCssPx ?? 0) + 1
              );
            }),
            warnings: ready.warnings.map((warning) => ({
              code: warning.code,
              sourceIdentity: warning.sourceIdentity,
              property: warning.property,
              value: warning.value,
              recovery: warning.recovery,
            })),
          };
        } finally {
          await controller.destroy();
        }
      };
      const first = await run();
      const second = await run();
      host.remove();
      return { first, second, sourceText };
    });

    expect(observation.second).toEqual(observation.first);
    expect(observation.first.fragmentCount).toBe(1);
    expect(observation.first.text).toBe(observation.sourceText);
    expect(observation.first.inlineFits).toContain(false);
    expect(
      observation.first.warnings.filter(
        (warning) => warning.code === "UNSUPPORTED_FRAGMENTATION_CONTEXT",
      ),
    ).toEqual([
      expect.objectContaining({
        property: "writing-mode",
        value: "vertical-rl",
        recovery: "Kept vertical writing atomic and reported page overflow.",
      }),
    ]);
    expect(
      observation.first.warnings.filter((warning) => warning.code === "PAGE_OVERFLOW"),
    ).toHaveLength(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
