import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// Equivalence oracle for the rendered-line-ends fast path (ASA-425): the same
// document is composed with the fast line-boundary scan enabled (default) and
// disabled (experimental.forceLegacyLineEnds), and every observable output —
// page count, per-page markup, blank/name metadata, geometry, body text, the
// full warning array, and exported EPUB bytes — must match. The internal
// lineEndsFastPath counter proves the fast path actually engaged, and the
// ordinary-document fixture proves non-overflowing paragraphs never enter the
// page-crossing text split path at all.

type LineEndsObservation = Readonly<{
  pages: readonly Readonly<{
    blank: boolean;
    bodyText: unknown;
    name?: string;
    geometry: unknown;
    html: string;
  }>[];
  warnings: readonly unknown[];
  epubByteLength: number;
  epubDigest: string;
  counters: Readonly<Record<string, number>>;
}>;

type FixtureObservation = Readonly<{
  id: string;
  fast: LineEndsObservation;
  legacy: LineEndsObservation;
}>;

const renderMatrix = async (
  page: import("@playwright/test").Page,
  fixtures: readonly Readonly<{ id: string; html: string }>[],
): Promise<readonly FixtureObservation[]> => {
  return await page.evaluate(async (sources) => {
    type PageWarningView = Readonly<Record<string, unknown>>;
    type PageDocument = Readonly<{
      readonly iframe: HTMLIFrameElement;
      readonly pages: readonly Readonly<{
        readonly blank: boolean;
        readonly bodyText: unknown;
        readonly name?: string;
        readonly geometry: unknown;
      }>[];
      readonly warnings: readonly PageWarningView[];
      exportEpub(options: Readonly<{ metadata: Record<string, string> }>): Promise<Blob>;
    }>;
    type Controller = Readonly<{
      readonly ready: Promise<PageDocument>;
      destroy(): Promise<void>;
    }>;
    type Core = Readonly<{
      mountPageDocument(
        host: HTMLElement,
        source: Readonly<{ html: string }>,
        options?: Record<string, unknown>,
      ): Controller;
    }>;

    const core = (await import("/packages/core/dist/index.js")) as Core;

    const render = async (html: string, forceLegacyLineEnds: boolean) => {
      const host = document.body.appendChild(document.createElement("div"));
      let counters: Readonly<Record<string, number>> = {};
      const controller = core.mountPageDocument(
        host,
        { html },
        {
          experimental: {
            forceLegacyLineEnds,
            onDebugCounters: (value: Readonly<Record<string, number>>) => {
              counters = value;
            },
          },
        },
      );
      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const elements = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
        const epub = await ready.exportEpub({
          metadata: {
            title: "Line Ends Equivalence",
            language: "en",
            identifier: "urn:imposia:line-ends-equivalence",
            modified: "2026-01-01T00:00:00Z",
          },
        });
        const epubBytes = new Uint8Array(await epub.arrayBuffer());
        const digest = await crypto.subtle.digest("SHA-256", epubBytes);
        return {
          pages: ready.pages.map((pageResult, index) => ({
            blank: pageResult.blank,
            bodyText: pageResult.bodyText,
            ...(pageResult.name === undefined ? {} : { name: pageResult.name }),
            geometry: pageResult.geometry,
            html: elements[index]?.innerHTML ?? "",
          })),
          warnings: ready.warnings.map((warning) => JSON.parse(JSON.stringify(warning))),
          epubByteLength: epubBytes.byteLength,
          epubDigest: [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
          counters,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    };

    const observations = [];
    for (const source of sources) {
      observations.push({
        id: source.id,
        fast: await render(source.html, false),
        legacy: await render(source.html, true),
      });
    }
    return observations;
  }, fixtures);
};

const expectEquivalent = (observation: FixtureObservation): void => {
  const { id, fast, legacy } = observation;
  expect(legacy.counters.lineEndsFastPath ?? 0, `${id}: legacy path must not fast-scan`).toBe(0);
  expect(fast.pages.length, `${id}: page count`).toBe(legacy.pages.length);
  expect(fast.pages, `${id}: pages`).toEqual(legacy.pages);
  expect(fast.warnings, `${id}: warnings`).toEqual(legacy.warnings);
  expect(fast.epubByteLength, `${id}: epub bytes`).toBe(legacy.epubByteLength);
  expect(fast.epubDigest, `${id}: epub digest`).toBe(legacy.epubDigest);
};

const PAGE_CSS =
  "@page { size: 720px 480px; margin: 40px; } body { margin: 0; font: 13px/1.5 Arial, sans-serif; }";

const SENTENCE =
  "The harbour clerks compared the tide tables against the merchants' claims every spring, and the ledger kept every correction in the margin. ";
const CJK_SENTENCE =
  "静かな港町では帳簿をすべて手書きで管理しており、春になると書記たちは潮汐表と商人たちの申告を突き合わせて確認していた。";
const EMOJI_SENTENCE = `crew 🧑‍🚀 and family 👩‍👩‍👧‍👦 with flags 🇰🇷🇯🇵🇺🇸 met the keeper 👨‍🌾 at dawn. ${SENTENCE}`;

const paragraphs = (count: number, prefix: string): string =>
  Array.from(
    { length: count },
    (_, index) => `<p>${prefix} paragraph ${index + 1}: ${SENTENCE}</p>`,
  ).join("");

test("keeps the fast line-ends scan structurally equivalent for page-crossing text", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observations = await renderMatrix(page, [
      {
        id: "long-english-paragraph",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style><article><p>${SENTENCE.repeat(120)}</p></article>`,
      },
      {
        id: "long-cjk-paragraph",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style><article lang="ja"><p>${CJK_SENTENCE.repeat(120)}</p></article>`,
      },
      {
        id: "long-emoji-paragraph",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style><article><p>${EMOJI_SENTENCE.repeat(40)}</p></article>`,
      },
      {
        id: "single-text-node-multi-page",
        html: `<style>${PAGE_CSS}</style>${SENTENCE.repeat(120)}`,
      },
      {
        id: "widows-orphans-long-paragraph",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; widows: 4; orphans: 4; }</style><article>${paragraphs(3, "Lead")}<p>${SENTENCE.repeat(90)}</p>${paragraphs(3, "Tail")}</article>`,
      },
      {
        id: "widows-orphans-relaxed",
        html: `<style>${PAGE_CSS} p.strict { widows: 30; orphans: 30; } p { margin: 0 0 9px; }</style><article>${paragraphs(6, "Lead")}<p class="strict">${SENTENCE.repeat(90)}</p></article>`,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
      if (observation.id !== "single-text-node-multi-page") {
        // A bare root-level text node is split through splitTextToFit alone
        // (exercising the segmentation cache), so only element-wrapped text
        // engages the rendered-line-ends fast path.
        expect(
          observation.fast.counters.lineEndsFastPath ?? 0,
          `${observation.id}: fast path engaged`,
        ).toBeGreaterThan(0);
      }
      expect(observation.fast.pages.length, `${observation.id}: spans pages`).toBeGreaterThan(1);
    }
    const relaxed = observations.find((observation) => observation.id === "widows-orphans-relaxed");
    expect(
      (relaxed?.fast.warnings ?? []).some(
        (warning) => (warning as { code?: string }).code === "WIDOW_ORPHAN_RELAXED",
      ),
      "widows-orphans-relaxed: exercises the WIDOW_ORPHAN_RELAXED warning",
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps the fast line-ends scan equivalent across path branching and overflow", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const longWord = "unbreakable".repeat(24);
    const observations = await renderMatrix(page, [
      {
        id: "br-line-block",
        html: `<style>${PAGE_CSS}</style><article><p>${Array.from({ length: 120 }, (_, index) => `Line ${index + 1} of the ledger<br>`).join("")}</p></article>`,
      },
      {
        id: "mixed-inline-content",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style><article><p>${`${SENTENCE}<em>${SENTENCE.trim()}</em> `.repeat(30)}</p></article>`,
      },
      {
        id: "nowrap-overflow",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; } .nowrap { white-space: nowrap; }</style><article>${paragraphs(4, "Lead")}<p class="nowrap">nowrap ${longWord}</p>${paragraphs(4, "Tail")}</article>`,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("ordinary documents never enter the page-crossing text split path", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observations = await renderMatrix(page, [
      {
        id: "ordinary-single-page",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style><article>${paragraphs(3, "Ordinary")}</article>`,
      },
      {
        id: "ordinary-avoided-blocks",
        html: `<style>${PAGE_CSS} .keep { break-inside: avoid; } p { margin: 0 0 9px; }</style><article>${Array.from(
          { length: 18 },
          (_, index) => `<div class="keep">${paragraphs(2, `Block ${index + 1}`)}</div>`,
        ).join("")}</article>`,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
      for (const mode of ["fast", "legacy"] as const) {
        expect(
          observation[mode].counters.lineEndsFastPath ?? 0,
          `${observation.id}: ${mode} render must not fast-scan`,
        ).toBe(0);
        expect(
          observation[mode].counters.lineEndsFallbacks ?? 0,
          `${observation.id}: ${mode} render must not sequential-scan`,
        ).toBe(0);
      }
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
