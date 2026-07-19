import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type PageDocument = Readonly<{
  iframe: HTMLIFrameElement;
  pageCount: number;
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

const SUPPORTED_MARKERS = [
  "FLEX-CARD-01",
  "FLEX-CARD-02",
  "FLEX-BREAK-AFTER",
  "FLEX-AFTER-BREAK",
  "FLEX-AVOID-PRELUDE",
  "FLEX-AVOID-FIRST",
  "FLEX-AVOID-SECOND",
] as const;

const OVERSIZED_AVOID_MARKERS = Array.from(
  { length: 10 },
  (_value, index) => `FLEX-OVERSIZED-${String(index + 1).padStart(2, "0")}`,
);

const UNSUPPORTED_SCENARIOS = [
  {
    id: "reordered",
    css: ".unsupported-flex > :first-child { order: 2; } .unsupported-flex > :last-child { order: 1; }",
    content:
      '<p data-flex-marker="reordered-FIRST">reordered-FIRST</p><p data-flex-marker="reordered-SECOND">reordered-SECOND</p>',
    flexDirection: "column",
    flexWrap: "nowrap",
  },
  {
    id: "wrapped",
    css: ".unsupported-flex { flex-wrap: wrap; }",
    content:
      '<p data-flex-marker="wrapped-FIRST">wrapped-FIRST</p><p data-flex-marker="wrapped-SECOND">wrapped-SECOND</p>',
    flexDirection: "column",
    flexWrap: "wrap",
  },
  {
    id: "reversed",
    css: ".unsupported-flex { flex-direction: column-reverse; }",
    content:
      '<p data-flex-marker="reversed-FIRST">reversed-FIRST</p><p data-flex-marker="reversed-SECOND">reversed-SECOND</p>',
    flexDirection: "column-reverse",
    flexWrap: "nowrap",
  },
  {
    id: "anonymous-text-reordered",
    css: ".unsupported-flex > p { order: -1; }",
    content:
      'anonymous-text-reordered-FIRST<p data-flex-marker="anonymous-text-reordered-SECOND">anonymous-text-reordered-SECOND</p>',
    flexDirection: "column",
    flexWrap: "nowrap",
  },
  {
    id: "generated-pseudo-item",
    css: '.unsupported-flex::before { content: "GENERATED-FLEX-ITEM"; order: 1; }',
    content:
      '<p data-flex-marker="generated-pseudo-item-FIRST">generated-pseudo-item-FIRST</p><p data-flex-marker="generated-pseudo-item-SECOND">generated-pseudo-item-SECOND</p>',
    flexDirection: "column",
    flexWrap: "nowrap",
  },
] as const;

test("fragments source-ordered nested column Flex cards while honoring break and avoid", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(
      async ({ markers }) => {
        const modulePath = "/packages/core/dist/index.js";
        const core = (await import(modulePath)) as CoreModule;
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const controller = core.mountPageDocument(host, {
          html: `
          <style>
            .flex-report { display: flex; flex-direction: column; flex-wrap: nowrap; gap: 12px; margin: 0; }
            .flex-card { position: relative; display: flex; flex-direction: column; flex-wrap: nowrap; box-sizing: border-box; min-height: 260px; margin: 0; padding: 8px; }
            .flex-card > * { margin: 0; }
            .break-after { break-after: page; }
            .avoid-prelude { break-before: page; height: 760px; }
            .avoid-card { break-inside: avoid; min-height: 0; }
            .avoid-card > p { height: 150px; }
          </style>
          <main class="flex-report">
            <section class="flex-card" style="order:-1"><p data-flex-marker="FLEX-CARD-01">FLEX-CARD-01</p></section>
            <section class="flex-card" style="order:-1"><p data-flex-marker="FLEX-CARD-02">FLEX-CARD-02</p></section>
            <section class="flex-card break-after" style="order:0"><p data-flex-marker="FLEX-BREAK-AFTER">FLEX-BREAK-AFTER</p></section>
            <section class="flex-card" style="order:0"><p data-flex-marker="FLEX-AFTER-BREAK">FLEX-AFTER-BREAK</p></section>
            <section class="flex-card avoid-prelude" style="order:1"><p data-flex-marker="FLEX-AVOID-PRELUDE">FLEX-AVOID-PRELUDE</p></section>
            <section class="flex-card avoid-card" style="order:1">
              <p data-flex-marker="FLEX-AVOID-FIRST">FLEX-AVOID-FIRST</p>
              <p data-flex-marker="FLEX-AVOID-SECOND">FLEX-AVOID-SECOND</p>
            </section>
          </main>
        `,
        });

        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
          const pageTexts = pages.map(
            (pageElement) =>
              pageElement.querySelector<HTMLElement>("[data-imposia-page-flow]")?.textContent ?? "",
          );
          const actualOrder = pages.flatMap((pageElement) =>
            [...pageElement.querySelectorAll<HTMLElement>("[data-flex-marker]")].map(
              (element) => element.dataset.flexMarker ?? "",
            ),
          );
          const pageFor = Object.fromEntries(
            markers.map((marker) => [
              marker,
              pageTexts.findIndex((pageText) => pageText.includes(marker)),
            ]),
          );
          const allText = pageTexts.join("\n");
          return {
            pageCount: ready.pageCount,
            actualOrder,
            markerCounts: Object.fromEntries(
              markers.map((marker) => [marker, allText.split(marker).length - 1]),
            ),
            pageFor,
            warningCodes: ready.warnings.map((warning) => warning.code),
            computed: {
              reportDisplay: getComputedStyle(
                frameDocument.querySelector<HTMLElement>(".flex-report") as HTMLElement,
              ).display,
              cardDisplay: getComputedStyle(
                frameDocument.querySelector<HTMLElement>(".flex-card") as HTMLElement,
              ).display,
              cardPosition: getComputedStyle(
                frameDocument.querySelector<HTMLElement>(".flex-card") as HTMLElement,
              ).position,
            },
          };
        } finally {
          await controller.destroy();
          host.remove();
        }
      },
      { markers: SUPPORTED_MARKERS },
    );

    expect(observation.pageCount).toBeGreaterThanOrEqual(4);
    expect(observation.actualOrder).toEqual(SUPPORTED_MARKERS);
    expect(observation.markerCounts).toEqual(
      Object.fromEntries(SUPPORTED_MARKERS.map((marker) => [marker, 1])),
    );
    expect(Object.values(observation.pageFor).every((pageNumber) => pageNumber >= 0)).toBe(true);
    expect(observation.pageFor["FLEX-BREAK-AFTER"]).toBeLessThan(
      observation.pageFor["FLEX-AFTER-BREAK"] ?? -1,
    );
    expect(observation.pageFor["FLEX-AVOID-PRELUDE"]).toBeLessThan(
      observation.pageFor["FLEX-AVOID-FIRST"] ?? -1,
    );
    expect(observation.pageFor["FLEX-AVOID-FIRST"]).toBe(observation.pageFor["FLEX-AVOID-SECOND"]);
    expect(observation.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
    expect(observation.warningCodes).not.toContain("AVOID_RELAXED");
    expect(observation.computed).toEqual({
      reportDisplay: "flex",
      cardDisplay: "flex",
      cardPosition: "relative",
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("relaxes an impossible Flex card avoid once without losing or duplicating content", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(
      async ({ markers }) => {
        const modulePath = "/packages/core/dist/index.js";
        const core = (await import(modulePath)) as CoreModule;
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const html = `
        <style>
          .flex-report { display: flex; flex-direction: column; flex-wrap: nowrap; margin: 0; }
          .oversized-card { position: relative; display: flex; flex-direction: column; flex-wrap: nowrap; break-inside: avoid; margin: 0; }
          .oversized-card > p { box-sizing: border-box; height: 180px; margin: 0; }
        </style>
        <main class="flex-report">
          <section class="oversized-card">
            ${markers.map((marker) => `<p data-flex-marker="${marker}">${marker}</p>`).join("")}
          </section>
        </main>
      `;
        const run = async () => {
          const controller = core.mountPageDocument(host, { html });
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
            const actualOrder = pages.flatMap((pageElement) =>
              [...pageElement.querySelectorAll<HTMLElement>("[data-flex-marker]")].map(
                (element) => element.dataset.flexMarker ?? "",
              ),
            );
            const allText = pages
              .map(
                (pageElement) =>
                  pageElement.querySelector<HTMLElement>("[data-imposia-page-flow]")?.textContent ??
                  "",
              )
              .join("\n");
            const pageFor = Object.fromEntries(
              markers.map((marker) => [
                marker,
                pages.findIndex((pageElement) =>
                  [...pageElement.querySelectorAll<HTMLElement>("[data-flex-marker]")].some(
                    (element) => element.dataset.flexMarker === marker,
                  ),
                ),
              ]),
            );
            return {
              pageCount: ready.pageCount,
              actualOrder,
              pageFor,
              markerCounts: Object.fromEntries(
                markers.map((marker) => [marker, allText.split(marker).length - 1]),
              ),
              avoidWarnings: ready.warnings
                .filter((warning) => warning.code === "AVOID_RELAXED")
                .map((warning) => ({
                  code: warning.code,
                  sourceIdentity: warning.sourceIdentity,
                  property: warning.property,
                  value: warning.value,
                  recovery: warning.recovery,
                })),
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
      { markers: OVERSIZED_AVOID_MARKERS },
    );

    expect(observation.first.pageCount).toBeGreaterThan(1);
    expect(observation.first.actualOrder).toEqual(OVERSIZED_AVOID_MARKERS);
    expect(observation.first.markerCounts).toEqual(
      Object.fromEntries(OVERSIZED_AVOID_MARKERS.map((marker) => [marker, 1])),
    );
    expect(Object.values(observation.first.pageFor).every((pageNumber) => pageNumber >= 0)).toBe(
      true,
    );
    expect(new Set(Object.values(observation.first.pageFor)).size).toBeGreaterThan(1);
    expect(observation.first.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
    expect(observation.first.avoidWarnings).toHaveLength(1);
    expect(observation.first.avoidWarnings).toEqual(observation.second.avoidWarnings);
    expect(observation.first.avoidWarnings[0]).toMatchObject({
      code: "AVOID_RELAXED",
      property: "break-inside",
      value: "avoid",
      recovery: "Fragmented the source content deterministically.",
    });
    expect(observation.first.avoidWarnings[0]?.sourceIdentity).toMatch(/^source-\d+:section$/u);
    expect(observation.first.pageCount).toBe(observation.second.pageCount);
    expect(observation.first.actualOrder).toEqual(observation.second.actualOrder);
    expect(observation.first.pageFor).toEqual(observation.second.pageFor);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps unsupported Flex patterns atomic with deterministic located warnings", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(
      async ({ scenarios }) => {
        const modulePath = "/packages/core/dist/index.js";
        const core = (await import(modulePath)) as CoreModule;
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const run = async (scenario: (typeof scenarios)[number]) => {
          const controller = core.mountPageDocument(host, {
            html: `
              <style>
                .fallback-prelude { box-sizing: border-box; height: 820px; margin: 0; }
                .unsupported-flex { display: flex; flex-direction: column; flex-wrap: nowrap; box-sizing: border-box; height: 280px; margin: 0; }
                .unsupported-flex > p { box-sizing: border-box; height: 120px; margin: 0; }
                ${scenario.css}
              </style>
              <p class="fallback-prelude" data-flex-marker="${scenario.id}-PRELUDE">${scenario.id}-PRELUDE</p>
              <main class="unsupported-flex" data-flex-container="${scenario.id}">
                ${scenario.content}
              </main>
            `,
          });
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
            const markers = [
              `${scenario.id}-PRELUDE`,
              `${scenario.id}-FIRST`,
              `${scenario.id}-SECOND`,
            ];
            const pageTexts = pages.map(
              (pageElement) =>
                pageElement.querySelector<HTMLElement>("[data-imposia-page-flow]")?.textContent ??
                "",
            );
            const pageFor = Object.fromEntries(
              markers.map((marker) => [
                marker,
                pageTexts.findIndex((pageText) => pageText.includes(marker)),
              ]),
            );
            const allText = pageTexts.join("\n");
            const actualOrder = [...markers].sort(
              (left, right) => allText.indexOf(left) - allText.indexOf(right),
            );
            const container = frameDocument.querySelector<HTMLElement>(
              `[data-flex-container="${scenario.id}"]`,
            );
            if (container === null) throw new Error("Missing fallback Flex container.");
            const style = getComputedStyle(container);
            return {
              pageCount: ready.pageCount,
              pageFor,
              actualOrder,
              markerCounts: Object.fromEntries(
                markers.map((marker) => [marker, allText.split(marker).length - 1]),
              ),
              containerCount: frameDocument.querySelectorAll(
                `[data-flex-container="${scenario.id}"]`,
              ).length,
              computed: {
                display: style.display,
                flexDirection: style.flexDirection,
                flexWrap: style.flexWrap,
              },
              warnings: ready.warnings
                .filter((warning) => warning.code === "UNSUPPORTED_LAYOUT")
                .map((warning) => ({
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

        const results = [];
        for (const scenario of scenarios) {
          results.push({
            id: scenario.id,
            first: await run(scenario),
            second: await run(scenario),
          });
        }
        host.remove();
        return results;
      },
      { scenarios: UNSUPPORTED_SCENARIOS },
    );

    for (const [index, result] of observation.entries()) {
      const scenario = UNSUPPORTED_SCENARIOS[index];
      if (scenario === undefined) throw new Error("Missing unsupported Flex scenario.");
      const markers = [`${scenario.id}-PRELUDE`, `${scenario.id}-FIRST`, `${scenario.id}-SECOND`];
      expect(result.id).toBe(scenario.id);
      expect(result.first.pageCount).toBeGreaterThanOrEqual(2);
      expect(result.first.actualOrder).toEqual(markers);
      expect(result.first.markerCounts).toEqual(
        Object.fromEntries(markers.map((marker) => [marker, 1])),
      );
      expect(result.first.containerCount).toBe(1);
      expect(result.first.pageFor[markers[0] ?? ""]).toBeLessThan(
        result.first.pageFor[markers[1] ?? ""] ?? -1,
      );
      expect(result.first.pageFor[markers[1] ?? ""]).toBe(result.first.pageFor[markers[2] ?? ""]);
      expect(result.first.computed).toEqual({
        display: "flex",
        flexDirection: scenario.flexDirection,
        flexWrap: scenario.flexWrap,
      });
      expect(result.first.warnings).toHaveLength(1);
      expect(result.first.warnings).toEqual(result.second.warnings);
      expect(result.first.warnings[0]).toMatchObject({
        code: "UNSUPPORTED_LAYOUT",
        property: "display",
        value: "flex",
        recovery: "Kept the source layout atomic.",
      });
      expect(result.first.warnings[0]?.sourceIdentity).toMatch(/^source-\d+:main$/u);
      expect(result.first.pageFor).toEqual(result.second.pageFor);
      expect(result.first.actualOrder).toEqual(result.second.actualOrder);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
