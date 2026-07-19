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

const GRID_MARKERS = Array.from(
  { length: 12 },
  (_value, index) =>
    `GRID-ROW-${String(Math.floor(index / 2) + 1).padStart(2, "0")}-${index % 2 === 0 ? "A" : "B"}`,
);

const UNSUPPORTED_SCENARIOS = [
  {
    id: "spanning",
    css: ".unsupported-grid > :first-child { grid-column: 1 / span 2; }",
    autoFlow: "row",
  },
  {
    id: "placed",
    css: ".unsupported-grid > :first-child { grid-column: 2; }",
    autoFlow: "row",
  },
  {
    id: "reordered",
    css: ".unsupported-grid > :first-child { order: 1; }",
    autoFlow: "row",
  },
  {
    id: "dense",
    css: ".unsupported-grid { grid-auto-flow: row dense; }",
    autoFlow: "dense",
  },
  {
    id: "generated-pseudo-item",
    css: '.unsupported-grid::before { content: "GENERATED-GRID-ITEM"; }',
    autoFlow: "row",
  },
] as const;

test("fragments source-ordered repeated Grid rows while honoring row break and fitting avoid", async ({
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
            .grid-report {
              display: grid;
              grid-template-columns: auto auto;
              grid-template-rows: 180px 220px;
              grid-auto-rows: 260px 300px;
              grid-auto-flow: row;
              gap: 12px;
              margin: 0;
            }
            .grid-card { box-sizing: border-box; min-height: 0; margin: 0; padding: 8px; }
            .wide-card { min-width: 420px; }
            .break-after { break-after: page; }
            .break-before { break-before: page; }
            .avoid-card { break-inside: avoid; }
          </style>
          <main class="grid-report">
            ${markers
              .map(
                (marker, index) =>
                  `<section class="grid-card${index === 0 ? " wide-card" : ""}${index === 3 ? " break-after" : ""}${index === 6 ? " break-before" : ""}${index === 8 || index === 9 ? " avoid-card" : ""}" data-grid-marker="${marker}">${marker}</section>`,
              )
              .join("")}
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
            [...pageElement.querySelectorAll<HTMLElement>("[data-grid-marker]")].map(
              (element) => element.dataset.gridMarker ?? "",
            ),
          );
          const pageFor = Object.fromEntries(
            markers.map((marker) => [
              marker,
              pages.findIndex((pageElement) =>
                [...pageElement.querySelectorAll<HTMLElement>("[data-grid-marker]")].some(
                  (element) => element.dataset.gridMarker === marker,
                ),
              ),
            ]),
          );
          const allText = pageTexts.join("\n");
          const reports = [...frameDocument.querySelectorAll<HTMLElement>(".grid-report")];
          const firstReport = reports[0];
          if (firstReport === undefined) throw new Error("Missing fragmented Grid report.");
          const style = getComputedStyle(firstReport);
          return {
            pageCount: ready.pageCount,
            actualOrder,
            pageFor,
            markerCounts: Object.fromEntries(
              markers.map((marker) => [marker, allText.split(marker).length - 1]),
            ),
            warningCodes: ready.warnings.map((warning) => warning.code),
            computed: {
              display: style.display,
              gridAutoFlow: style.gridAutoFlow,
              columnCount: style.gridTemplateColumns.split(" ").length,
              fragmentColumns: reports.map(
                (report) => getComputedStyle(report).gridTemplateColumns,
              ),
              itemHeights: Object.fromEntries(
                markers.map((marker) => [
                  marker,
                  frameDocument
                    .querySelector<HTMLElement>(`[data-grid-marker="${marker}"]`)
                    ?.getBoundingClientRect().height ?? -1,
                ]),
              ),
            },
          };
        } finally {
          await controller.destroy();
          host.remove();
        }
      },
      { markers: GRID_MARKERS },
    );

    expect(observation.pageCount).toBeGreaterThan(2);
    expect(observation.actualOrder).toEqual(GRID_MARKERS);
    expect(observation.markerCounts).toEqual(
      Object.fromEntries(GRID_MARKERS.map((marker) => [marker, 1])),
    );
    expect(Object.values(observation.pageFor).every((pageNumber) => pageNumber >= 0)).toBe(true);
    for (let index = 0; index < GRID_MARKERS.length; index += 2) {
      expect(observation.pageFor[GRID_MARKERS[index] ?? ""]).toBe(
        observation.pageFor[GRID_MARKERS[index + 1] ?? ""],
      );
    }
    expect(observation.pageFor["GRID-ROW-02-B"]).toBeLessThan(
      observation.pageFor["GRID-ROW-03-A"] ?? -1,
    );
    expect(observation.pageFor["GRID-ROW-03-B"]).toBeLessThan(
      observation.pageFor["GRID-ROW-04-A"] ?? -1,
    );
    expect(observation.pageFor["GRID-ROW-05-A"]).toBe(observation.pageFor["GRID-ROW-05-B"]);
    expect(observation.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
    expect(observation.warningCodes).not.toContain("AVOID_RELAXED");
    expect(observation.computed).toMatchObject({
      display: "grid",
      gridAutoFlow: "row",
      columnCount: 2,
    });
    expect(new Set(observation.computed.fragmentColumns).size).toBe(1);
    const expectedRowHeights = [180, 220, 260, 300, 260, 300];
    for (const [index, marker] of GRID_MARKERS.entries()) {
      expect(observation.computed.itemHeights[marker]).toBeCloseTo(
        expectedRowHeights[Math.floor(index / 2)] ?? -1,
        3,
      );
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps unsupported Grid placement patterns atomic with deterministic located warnings", async ({
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
          const markers = [
            `${scenario.id}-PRELUDE`,
            `${scenario.id}-FIRST`,
            `${scenario.id}-SECOND`,
          ];
          const controller = core.mountPageDocument(host, {
            html: `
            <style>
              .fallback-prelude { box-sizing: border-box; height: 820px; margin: 0; }
              .unsupported-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                grid-auto-flow: row;
                box-sizing: border-box;
                height: 280px;
                margin: 0;
              }
              .unsupported-grid > p { box-sizing: border-box; height: 120px; margin: 0; }
              ${scenario.css}
            </style>
            <p class="fallback-prelude" data-grid-marker="${markers[0]}">${markers[0]}</p>
            <main class="unsupported-grid" data-grid-container="${scenario.id}">
              <p data-grid-marker="${markers[1]}">${markers[1]}</p>
              <p data-grid-marker="${markers[2]}">${markers[2]}</p>
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
                pageElement.querySelector<HTMLElement>("[data-imposia-page-flow]")?.textContent ??
                "",
            );
            const pageFor = Object.fromEntries(
              markers.map((marker) => [
                marker,
                pages.findIndex((pageElement) =>
                  [...pageElement.querySelectorAll<HTMLElement>("[data-grid-marker]")].some(
                    (element) => element.dataset.gridMarker === marker,
                  ),
                ),
              ]),
            );
            const allText = pageTexts.join("\n");
            const container = frameDocument.querySelector<HTMLElement>(
              `[data-grid-container="${scenario.id}"]`,
            );
            if (container === null) throw new Error("Missing fallback Grid container.");
            const style = getComputedStyle(container);
            return {
              pageCount: ready.pageCount,
              pageFor,
              actualOrder: [...markers].sort(
                (left, right) => allText.indexOf(left) - allText.indexOf(right),
              ),
              markerCounts: Object.fromEntries(
                markers.map((marker) => [marker, allText.split(marker).length - 1]),
              ),
              containerCount: frameDocument.querySelectorAll(
                `[data-grid-container="${scenario.id}"]`,
              ).length,
              computed: {
                display: style.display,
                gridAutoFlow: style.gridAutoFlow,
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
      if (scenario === undefined) throw new Error("Missing unsupported Grid scenario.");
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
        display: "grid",
        gridAutoFlow: scenario.autoFlow,
      });
      expect(result.first.warnings).toHaveLength(1);
      expect(result.first.warnings).toEqual(result.second.warnings);
      expect(result.first.warnings[0]).toMatchObject({
        code: "UNSUPPORTED_LAYOUT",
        property: "display",
        value: "grid",
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
