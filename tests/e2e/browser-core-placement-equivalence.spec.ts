import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// Equivalence oracle for the chunked sibling placement fast path (ASA-424): the
// same document is composed with chunked placement enabled (default) and
// disabled (experimental.forceSequentialPlacement), and every observable output
// — page count, per-page markup, blank/name metadata, geometry, body text, the
// full warning array, and exported EPUB bytes — must match. The internal
// chunksPlaced counter proves the fast path actually engaged.

type PlacementObservation = Readonly<{
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
  chunked: PlacementObservation;
  sequential: PlacementObservation;
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

    const render = async (html: string, forceSequentialPlacement: boolean) => {
      const host = document.body.appendChild(document.createElement("div"));
      let counters: Readonly<Record<string, number>> = {};
      const controller = core.mountPageDocument(
        host,
        { html },
        {
          experimental: {
            forceSequentialPlacement,
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
            title: "Placement Equivalence",
            language: "en",
            identifier: "urn:imposia:placement-equivalence",
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
        chunked: await render(source.html, false),
        sequential: await render(source.html, true),
      });
    }
    return observations;
  }, fixtures);
};

const expectEquivalent = (observation: FixtureObservation): void => {
  const { id, chunked, sequential } = observation;
  expect(sequential.counters.chunksPlaced ?? 0, `${id}: sequential path must not chunk`).toBe(0);
  expect(chunked.pages.length, `${id}: page count`).toBe(sequential.pages.length);
  expect(chunked.pages, `${id}: pages`).toEqual(sequential.pages);
  expect(chunked.warnings, `${id}: warnings`).toEqual(sequential.warnings);
  expect(chunked.epubByteLength, `${id}: epub bytes`).toBe(sequential.epubByteLength);
  expect(chunked.epubDigest, `${id}: epub digest`).toBe(sequential.epubDigest);
};

const PAGE_CSS =
  "@page { size: 360px 480px; margin: 44px; } body { margin: 0; font: 13px/1.5 Arial, sans-serif; }";

const paragraphs = (count: number, prefix: string): string =>
  Array.from(
    { length: count },
    (_, index) =>
      `<p>${prefix} paragraph ${index + 1}: the harbour clerks compared the tide tables against the merchants' claims every spring.</p>`,
  ).join("");

test("keeps chunked placement structurally equivalent for volume documents", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observations = await renderMatrix(page, [
      {
        id: "prose-short",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style><article>${paragraphs(40, "Short")}</article>`,
      },
      {
        id: "prose-long",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style><article>${paragraphs(700, "Long")}</article>`,
      },
      {
        id: "many-small-divs",
        html: `<style>${PAGE_CSS}</style><article>${Array.from(
          { length: 1600 },
          (_, index) => `<div>Row ${index + 1} ledger entry</div>`,
        ).join("")}</article>`,
      },
      {
        id: "cjk-longform",
        html: `<style>${PAGE_CSS} p { margin: 0 0 8px; }</style><article lang="ja">${Array.from(
          { length: 90 },
          (_, index) =>
            `<p>第${index + 1}段落。静かな港町では帳簿をすべて手書きで管理しており、春になると書記たちは潮汐表と商人たちの申告を突き合わせて確認していた。</p>`,
        ).join("")}</article>`,
      },
      {
        id: "root-level-siblings",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style>${paragraphs(120, "Root")}`,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
      expect(
        observation.chunked.counters.chunksPlaced ?? 0,
        `${observation.id}: fast path engaged`,
      ).toBeGreaterThan(0);
      expect(observation.chunked.pages.length).toBeGreaterThan(3);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps chunked placement structurally equivalent across breaks, names, and excluded layouts", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observations = await renderMatrix(page, [
      {
        id: "forced-breaks-and-blanks",
        html: `
          <style>
            ${PAGE_CSS}
            section.page-break { break-before: page; }
            section.left-break { break-before: left; }
            section.right-break { break-before: right; }
          </style>
          <section>${paragraphs(6, "Opening")}</section>
          <section class="page-break">${paragraphs(6, "Second")}</section>
          <section class="left-break">${paragraphs(6, "Left")}</section>
          <section class="right-break">${paragraphs(6, "Right")}</section>
          <section class="page-break">${paragraphs(24, "Closing")}</section>
        `,
      },
      {
        id: "named-page-transitions",
        html: `
          <style>
            ${PAGE_CSS}
            @page chapter { size: 420px 360px; margin: 36px; }
            section.chapter { page: chapter; }
          </style>
          ${paragraphs(10, "Front")}
          <section class="chapter">${paragraphs(10, "Chapter")}</section>
          ${paragraphs(10, "Back")}
        `,
      },
      {
        id: "mixed-table-grid-multicol",
        html: `
          <style>
            ${PAGE_CSS}
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #888; padding: 2px 4px; }
            .grid { display: grid; grid-template-columns: 120px 120px; grid-template-rows: ${Array.from({ length: 12 }, () => "60px").join(" ")}; }
            .columns { columns: 2; column-gap: 12px; height: 240px; }
          </style>
          ${paragraphs(6, "Lead")}
          <table>
            <thead><tr><th>Id</th><th>Name</th></tr></thead>
            <tbody>${Array.from({ length: 60 }, (_, index) => `<tr><td>${index + 1}</td><td>Entry ${index + 1}</td></tr>`).join("")}</tbody>
          </table>
          <div class="grid">${Array.from({ length: 24 }, (_, index) => `<div>Cell ${index + 1}</div>`).join("")}</div>
          <div class="columns">${paragraphs(8, "Column")}</div>
          ${paragraphs(6, "Tail")}
        `,
      },
      {
        id: "break-inside-avoid",
        html: `
          <style>${PAGE_CSS} .keep { break-inside: avoid; } p { margin: 0 0 9px; }</style>
          <article>
            ${Array.from(
              { length: 24 },
              (_, index) => `<div class="keep">${paragraphs(3, `Block ${index + 1}`)}</div>`,
            ).join("")}
          </article>
        `,
      },
      {
        id: "line-blocks",
        html: `
          <style>${PAGE_CSS}</style>
          <article>
            ${paragraphs(4, "Before")}
            <p>${Array.from({ length: 80 }, (_, index) => `Line ${index + 1}<br>`).join("")}</p>
            ${paragraphs(4, "After")}
          </article>
        `,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
    }
    const engaged = observations.filter(
      (observation) => (observation.chunked.counters.chunksPlaced ?? 0) > 0,
    );
    expect(engaged.length).toBeGreaterThan(0);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps chunked placement structurally equivalent for inline overflow and text splitting", async ({
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
        id: "unbreakable-word",
        html: `
          <style>${PAGE_CSS} p { margin: 0 0 9px; }</style>
          <article>
            ${paragraphs(8, "Lead")}
            <p>${longWord}</p>
            ${paragraphs(8, "Tail")}
          </article>
        `,
      },
      {
        id: "nowrap-run",
        html: `
          <style>${PAGE_CSS} p { margin: 0 0 9px; } .nowrap { white-space: nowrap; }</style>
          <article>
            ${paragraphs(8, "Lead")}
            <p class="nowrap">nowrap ${longWord}</p>
            ${paragraphs(8, "Tail")}
          </article>
        `,
      },
      {
        id: "nowrap-in-hidden-wrapper",
        html: `
          <style>${PAGE_CSS} p { margin: 0 0 9px; } .clip { overflow: hidden; } .nowrap { white-space: nowrap; }</style>
          <article>
            ${paragraphs(8, "Lead")}
            <div class="clip"><p class="nowrap">clipped ${longWord}</p></div>
            ${paragraphs(8, "Tail")}
          </article>
        `,
      },
      {
        id: "widows-orphans-long-paragraph",
        html: `
          <style>${PAGE_CSS} p { margin: 0 0 9px; widows: 4; orphans: 4; }</style>
          <article>
            ${paragraphs(6, "Lead")}
            <p>${"The tide ledger kept every correction in the margin, and the clerks initialed each amended line before the harbourmaster countersigned it. ".repeat(60)}</p>
            ${paragraphs(6, "Tail")}
          </article>
        `,
      },
      {
        id: "page-spanning-paragraph",
        html: `
          <style>${PAGE_CSS} p { margin: 0 0 9px; }</style>
          <article>
            <p>${"A single paragraph larger than a page exercises the rendered-line splitting boundary between the chunked run and the text splitter. ".repeat(80)}</p>
          </article>
        `,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
    }
    const unbreakable = observations.find((observation) => observation.id === "unbreakable-word");
    expect(
      (unbreakable?.chunked.warnings ?? []).some(
        (warning) => (warning as { code?: string }).code === "UNBREAKABLE_CONTENT",
      ),
    ).toBe(true);
    const engaged = observations.filter(
      (observation) => (observation.chunked.counters.chunksPlaced ?? 0) > 0,
    );
    expect(engaged.length).toBeGreaterThan(0);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
