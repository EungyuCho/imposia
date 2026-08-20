import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// Equivalence oracle for the atomic-subtree constraint-capture skip (ASA-426):
// the same document is composed with the interior skip enabled (default) and
// disabled (experimental.forceFullConstraintCapture), and every observable
// output — page count, per-page markup, blank/name metadata, geometry, body
// text, the full warning array, and exported EPUB bytes — must match. The
// internal atomicSubtreeSkips counter proves when the gate actually fired, and
// proves the mandatory fallback direction: documents whose CSS or inline
// styles declare fragmentation-sensitive properties inside atomic subtrees
// must silently take the full capture path.

type CaptureObservation = Readonly<{
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
  gated: CaptureObservation;
  full: CaptureObservation;
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

    const render = async (html: string, forceFullConstraintCapture: boolean) => {
      const host = document.body.appendChild(document.createElement("div"));
      let counters: Readonly<Record<string, number>> = {};
      const controller = core.mountPageDocument(
        host,
        { html },
        {
          experimental: {
            forceFullConstraintCapture,
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
            title: "Constraint Capture Equivalence",
            language: "en",
            identifier: "urn:imposia:constraint-capture-equivalence",
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
        gated: await render(source.html, false),
        full: await render(source.html, true),
      });
    }
    return observations;
  }, fixtures);
};

const expectEquivalent = (observation: FixtureObservation): void => {
  const { id, gated, full } = observation;
  expect(full.counters.atomicSubtreeSkips ?? 0, `${id}: forced full capture must not skip`).toBe(0);
  expect(gated.pages.length, `${id}: page count`).toBe(full.pages.length);
  expect(gated.pages, `${id}: pages`).toEqual(full.pages);
  expect(gated.warnings, `${id}: warnings`).toEqual(full.warnings);
  expect(gated.epubByteLength, `${id}: epub bytes`).toBe(full.epubByteLength);
  expect(gated.epubDigest, `${id}: epub digest`).toBe(full.epubDigest);
};

const PAGE_CSS =
  "@page { size: 360px 480px; margin: 44px; } body { margin: 0; font: 13px/1.5 Arial, sans-serif; }";

const paragraphs = (count: number, prefix: string): string =>
  Array.from(
    { length: count },
    (_, index) =>
      `<p>${prefix} paragraph ${index + 1}: the harbour clerks compared the tide tables against the merchants' claims every spring.</p>`,
  ).join("");

const svgFigure = (index: number, shapeCount: number): string => {
  const shapes = Array.from(
    { length: shapeCount },
    (_value, shapeIndex) =>
      `<g><circle cx="${(shapeIndex * 17) % 280}" cy="${(shapeIndex * 13) % 100}" r="4"></circle><text x="${(shapeIndex * 11) % 260}" y="${(shapeIndex * 7) % 90}">n${shapeIndex}</text></g>`,
  ).join("");
  return `<figure><svg viewBox="0 0 280 110" width="280" height="110">${shapes}</svg><figcaption>Figure ${index + 1}</figcaption></figure>`;
};

const mathExpression = (index: number): string =>
  `<math display="block"><mrow><msup><mi>x</mi><mn>${index}</mn></msup><mo>+</mo><mfrac><mrow><mi>a</mi><mo>&#x22c5;</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mn>${index + 1}</mn></mrow></mfrac><mo>=</mo><msqrt><mrow><mi>y</mi><mo>&#x2212;</mo><mn>${index + 2}</mn></mrow></msqrt></mrow></math>`;

test("keeps the atomic-subtree capture skip structurally equivalent where the gate fires", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observations = await renderMatrix(page, [
      {
        id: "svg-figures",
        html: `<style>${PAGE_CSS} figure { margin: 0 0 12px; } p { margin: 0 0 9px; }</style><article>${Array.from(
          { length: 14 },
          (_, index) => `${svgFigure(index, 30)}${paragraphs(2, `Figure ${index + 1} notes`)}`,
        ).join("")}</article>`,
      },
      {
        id: "mathml-formulas",
        html: `<style>${PAGE_CSS} math { margin: 0 0 10px; } p { margin: 0 0 9px; }</style><article>${Array.from(
          { length: 18 },
          (_, index) => `${mathExpression(index)}${paragraphs(2, `Derivation ${index + 1}`)}`,
        ).join("")}</article>`,
      },
      {
        id: "nested-atomic-foreign-object",
        html: `<style>${PAGE_CSS} figure { margin: 0 0 12px; } p { margin: 0 0 9px; }</style><article>
          ${paragraphs(4, "Lead")}
          ${Array.from(
            { length: 8 },
            (_, index) =>
              `<figure><svg viewBox="0 0 280 120" width="280" height="120"><rect x="2" y="2" width="276" height="116" fill="none" stroke="#555"></rect><foreignObject x="8" y="8" width="264" height="104"><div xmlns="http://www.w3.org/1999/xhtml"><p>Embedded annotation ${index + 1} keeps flowing text inside the atomic subtree.</p><ul><li>alpha</li><li>beta</li></ul></div></foreignObject></svg><figcaption>Nested ${index + 1}</figcaption></figure>${paragraphs(2, `Nested ${index + 1}`)}`,
          ).join("")}
          ${paragraphs(4, "Tail")}
        </article>`,
      },
      {
        id: "unsupported-flex-interior",
        html: `<style>${PAGE_CSS} .board { display: flex; flex-direction: row; gap: 8px; } .board div { border: 1px solid #999; padding: 4px; }</style><article>
          ${paragraphs(6, "Lead")}
          ${Array.from(
            { length: 6 },
            (_, index) =>
              `<div class="board">${Array.from(
                { length: 4 },
                (_value, cell) =>
                  `<div><span>Cell ${index + 1}.${cell + 1}</span><em>detail</em></div>`,
              ).join("")}</div>${paragraphs(2, `Board ${index + 1}`)}`,
          ).join("")}
          ${paragraphs(6, "Tail")}
        </article>`,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
      expect(
        observation.gated.counters.atomicSubtreeSkips ?? 0,
        `${observation.id}: skip gate engaged`,
      ).toBeGreaterThan(0);
      expect(observation.gated.pages.length, `${observation.id}: multi-page`).toBeGreaterThan(1);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("falls back silently when break declarations can reach atomic interiors", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observations = await renderMatrix(page, [
      {
        // The stylesheet declares a forced break that matches an element
        // inside an unsupported-flex (atomic) subtree: today that still sets
        // the ancestor's forced-descendant flag (observable through the
        // AVOID_RELAXED warning on the break-inside: avoid wrapper), so the
        // whole generation must fall back to the full sweep.
        id: "css-break-inside-atomic",
        html: `<style>${PAGE_CSS} .board { display: flex; flex-direction: row; gap: 8px; } .forced { break-before: page; } .keep { break-inside: avoid; }</style><article>
          ${paragraphs(6, "Lead")}
          <div class="keep"><div class="board"><div>plain cell</div><div class="forced">forced cell</div></div></div>
          ${svgFigure(0, 24)}
          ${paragraphs(6, "Tail")}
        </article>`,
      },
      {
        // Same forced break expressed through the legacy page-break alias in
        // an inline style inside the atomic subtree: the per-subtree inline
        // scan must reject the skip.
        id: "inline-page-break-inside-atomic",
        html: `<style>${PAGE_CSS} .board { display: flex; flex-direction: row; gap: 8px; }</style><article>
          ${paragraphs(6, "Lead")}
          <div class="board"><div>plain cell</div><div style="page-break-before: always;">forced cell</div></div>
          ${paragraphs(6, "Tail")}
        </article>`,
      },
      {
        // A forced break inside a td: tables are not atomic, so the interior
        // is never skip-eligible, and the break keeps its current semantics.
        id: "break-inside-td",
        html: `<style>${PAGE_CSS} table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #888; padding: 2px 4px; }</style>
          ${paragraphs(4, "Lead")}
          <table><tbody>${Array.from(
            { length: 40 },
            (_, index) =>
              `<tr><td${index === 20 ? ' style="break-before: page;"' : ""}>${index + 1}</td><td>Entry ${index + 1}</td></tr>`,
          ).join("")}</tbody></table>
          ${paragraphs(4, "Tail")}`,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
      expect(
        observation.gated.counters.atomicSubtreeSkips ?? 0,
        `${observation.id}: gate must fall back to the full sweep`,
      ).toBe(0);
    }
    const cssBreak = observations.find(
      (observation) => observation.id === "css-break-inside-atomic",
    );
    expect(
      (cssBreak?.gated.warnings ?? []).some(
        (warning) => (warning as { code?: string }).code === "AVOID_RELAXED",
      ),
      "forced break inside the atomic subtree still relaxes the avoid wrapper",
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps typography fallbacks and convergent capture equivalent", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observations = await renderMatrix(page, [
      {
        // Inline widows/orphans constraints: the inline ancestor walk now runs
        // only when the computed value is unavailable, and the fallback
        // warning plus split positions must be unchanged.
        id: "inline-widows-orphans",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; }</style><article>
          ${paragraphs(6, "Lead")}
          <p style="widows: 4; orphans: 4;">${"The tide ledger kept every correction in the margin, and the clerks initialed each amended line before the harbourmaster countersigned it. ".repeat(60)}</p>
          ${paragraphs(6, "Tail")}
        </article>`,
      },
      {
        // hyphens: auto without a content language: the hyphenation decision
        // now happens during capture, and the fallback warning plus the
        // inline hyphens mutation must be unchanged. The hyphens declaration
        // also disables the skip gate for the whole generation.
        id: "hyphens-auto-without-language",
        html: `<style>${PAGE_CSS} p { margin: 0 0 9px; hyphens: auto; }</style><article>
          ${paragraphs(10, "Unhyphenated")}
          ${svgFigure(0, 24)}
          ${paragraphs(10, "Trailing")}
        </article>`,
      },
      {
        // A convergence-requiring document (string-set into a margin box)
        // captures constraints on every layout pass; the skip must produce
        // identical results across passes.
        id: "convergent-string-set",
        html: `<style>
            @page { size: 360px 480px; margin: 44px; @top-left { content: string(chapter, first); } }
            body { margin: 0; font: 13px/1.5 Arial, sans-serif; }
            h2 { string-set: chapter content(); margin: 0 0 10px; }
            p { margin: 0 0 9px; }
          </style>
          <article>
            <h2>Chapter One</h2>
            ${paragraphs(8, "One")}
            ${svgFigure(0, 30)}
            <h2>Chapter Two</h2>
            ${paragraphs(8, "Two")}
            ${svgFigure(1, 30)}
            <h2>Chapter Three</h2>
            ${paragraphs(8, "Three")}
          </article>`,
      },
    ]);

    for (const observation of observations) {
      expectEquivalent(observation);
    }
    const byId = new Map(observations.map((observation) => [observation.id, observation]));
    const hyphens = byId.get("hyphens-auto-without-language");
    expect(
      (hyphens?.gated.warnings ?? []).some(
        (warning) => (warning as { code?: string }).code === "HYPHENATION_FALLBACK",
      ),
      "hyphenation fallback warning is preserved",
    ).toBe(true);
    expect(
      hyphens?.gated.counters.atomicSubtreeSkips ?? 0,
      "hyphens declaration disables the skip gate",
    ).toBe(0);
    const convergent = byId.get("convergent-string-set");
    expect(
      convergent?.gated.counters.atomicSubtreeSkips ?? 0,
      "convergent capture keeps skipping",
    ).toBeGreaterThan(0);
    expect(
      convergent?.gated.pages.some((pageResult) =>
        JSON.stringify(pageResult.html).includes("Chapter"),
      ),
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
