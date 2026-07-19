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

const FLOW_MARKERS = Array.from(
  { length: 18 },
  (_value, index) => `MULTICOL-FLOW-${String(index + 1).padStart(2, "0")}`,
);

const UNSUPPORTED_SCENARIOS = [
  {
    id: "nested-multicol",
    css: ".nested { column-count: 2; column-fill: auto; column-gap: 12px; height: 240px; }",
    content:
      '<div class="nested"><p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p></div><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "nested-spanner",
    css: ".nested-span { column-span: all; }",
    content:
      '<div><h2 class="nested-span" data-unsafe-marker="A">A</h2></div><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "balanced-fill",
    css: ".unsafe-multicol { column-fill: balance; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "generated-item",
    css: '.unsafe-multicol::before { content: "GENERATED-MULTICOL"; display: block; }',
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "id-styled-shell",
    css: "#unsafe-id-styled-shell { border: 1px solid #111; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "positioned-shell",
    css: ".unsafe-multicol { position: relative; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "oversized-height",
    css: ".unsafe-multicol { height: 1200px; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: true,
  },
  {
    id: "auto-height",
    css: ".unsafe-multicol { height: auto; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "inactive-conditional-height",
    css: "@media (min-width: 9999px) { .unsafe-multicol { height: 720px; } }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
    omitBaseHeight: true,
  },
  {
    id: "container-query-height",
    css: "html { container-type: inline-size; } @container (min-width: 1px) { .unsafe-multicol { height: 50%; } }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "vertical-writing",
    css: ".unsafe-multicol { writing-mode: vertical-rl; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "percentage-height",
    css: ".unsafe-multicol { height: 50%; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "root-margin",
    css: ".unsafe-multicol { margin-top: 300px; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "structural-selector",
    css: ".unsafe-multicol > p:first-child { height: 360px; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "list-marker",
    css: ".unsafe-multicol li { height: 96px; }",
    content:
      '<ol><li data-unsafe-marker="A">A</li><li data-unsafe-marker="B">B</li><li data-unsafe-marker="C">C</li></ol>',
    expectedOverflow: false,
  },
  {
    id: "root-list-item",
    css: ".unsafe-multicol { display: list-item; list-style-type: decimal; }",
    content:
      '<p data-unsafe-marker="A">A</p><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
  {
    id: "tall-spanner",
    css: ".tall-spanner { height: 850px; margin: 0; column-span: all; }",
    content:
      '<h2 class="tall-spanner" data-unsafe-marker="A">A</h2><p data-unsafe-marker="B">B</p><p data-unsafe-marker="C">C</p>',
    expectedOverflow: false,
  },
] as const;

test("fragments bounded multicol flow around direct spanners in deterministic reading order", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(
      async ({ markers }) => {
        const core = (await import("/packages/core/dist/index.js")) as CoreModule;
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const content = markers
          .map((marker, index) => {
            if (index === 6 || index === 12) {
              return `<h2 class="spanner" data-flow-marker="${marker}">${marker}</h2>`;
            }
            return `<p class="column-card" data-flow-marker="${marker}">${marker}</p>`;
          })
          .join("");
        const html = `
          <style>
            .bounded-multicol {
              box-sizing: border-box;
              width: 100%;
              height: 720px;
              column-count: 2;
              column-fill: auto;
              column-gap: 32px;
              font: 16px/24px Arial, sans-serif;
            }
            .column-card {
              box-sizing: border-box;
              height: 168px;
              margin: 0 0 12px;
              padding: 8px;
              break-inside: avoid;
              border: 1px solid #111;
            }
            .spanner {
              box-sizing: border-box;
              height: 72px;
              margin: 12px 0;
              padding: 8px;
              column-span: all;
              border: 1px solid #111;
            }
          </style>
          <main id="bounded-multicol" class="bounded-multicol">${content}</main>
        `;
        const run = async () => {
          const controller = core.mountPageDocument(host, { html });
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
            const pageItems = pages.map((pageElement, pageIndex) => ({
              pageIndex,
              shellCount: pageElement.querySelectorAll(".bounded-multicol").length,
              sourceIdCount: pageElement.querySelectorAll("#bounded-multicol").length,
              markers: [...pageElement.querySelectorAll<HTMLElement>("[data-flow-marker]")].map(
                (element) => element.dataset.flowMarker ?? "",
              ),
              geometry: [...pageElement.querySelectorAll<HTMLElement>("[data-flow-marker]")].map(
                (element) => {
                  const container = element.closest<HTMLElement>(".bounded-multicol");
                  const containerBounds = container?.getBoundingClientRect();
                  const style = container === null ? undefined : getComputedStyle(container);
                  return {
                    marker: element.dataset.flowMarker ?? "",
                    pageIndex,
                    fragmentWidths: [...element.getClientRects()].map((rect) =>
                      Math.round(rect.width),
                    ),
                    containerWidth: Math.round(containerBounds?.width ?? 0),
                    columnCount: style?.columnCount,
                    columnFill: style?.columnFill,
                    columnGap: style?.columnGap,
                    columnSpan: getComputedStyle(element).columnSpan,
                  };
                },
              ),
            }));
            const allText = frameDocument.body.textContent ?? "";
            return {
              pageCount: ready.pageCount,
              pages: pageItems,
              actualOrder: pageItems.flatMap((pageItem) => pageItem.markers),
              pageFor: Object.fromEntries(
                markers.map((marker) => [
                  marker,
                  pageItems.findIndex((pageItem) => pageItem.markers.includes(marker)),
                ]),
              ),
              markerCounts: Object.fromEntries(
                markers.map((marker) => [marker, allText.split(marker).length - 1]),
              ),
              warnings: ready.warnings.map((warning) => warning.code),
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
      { markers: FLOW_MARKERS },
    );

    const contentPages = observation.first.pages.filter((pageItem) => pageItem.shellCount > 0);
    expect(observation.first.pageCount).toBeGreaterThanOrEqual(2);
    expect(contentPages.length).toBeGreaterThanOrEqual(2);
    expect(contentPages.every((pageItem) => pageItem.shellCount === 1)).toBe(true);
    expect(contentPages.reduce((total, pageItem) => total + pageItem.sourceIdCount, 0)).toBe(1);
    expect(observation.first.actualOrder).toEqual(FLOW_MARKERS);
    expect(observation.first.markerCounts).toEqual(
      Object.fromEntries(FLOW_MARKERS.map((marker) => [marker, 1])),
    );
    expect(Object.values(observation.first.pageFor).every((pageIndex) => pageIndex >= 0)).toBe(
      true,
    );
    expect(Object.values(observation.first.pageFor)).toEqual(
      [...Object.values(observation.first.pageFor)].sort((left, right) => left - right),
    );
    const geometry = contentPages.flatMap((pageItem) => pageItem.geometry);
    expect(
      geometry.every(
        (item) =>
          item.columnCount === "2" && item.columnFill === "auto" && item.columnGap === "32px",
      ),
    ).toBe(true);
    for (const [index, marker] of FLOW_MARKERS.entries()) {
      const item = geometry.find((candidate) => candidate.marker === marker);
      expect(item).toBeDefined();
      if (index === 6 || index === 12) {
        expect(item?.columnSpan).toBe("all");
        expect(Math.max(...(item?.fragmentWidths ?? [0]))).toBeGreaterThan(
          (item?.containerWidth ?? 0) * 0.9,
        );
      } else {
        expect(item?.columnSpan).toBe("none");
        expect(
          (item?.fragmentWidths ?? [Number.POSITIVE_INFINITY]).every(
            (width) => width < (item?.containerWidth ?? 0) * 0.6,
          ),
        ).toBe(true);
      }
    }
    expect(observation.first.warnings).toEqual([]);
    expect(observation.second).toEqual(observation.first);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps nested and unsupported multicol layouts atomic with deterministic warnings", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(
      async ({ scenarios }) => {
        const core = (await import("/packages/core/dist/index.js")) as CoreModule;
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const run = async (scenario: (typeof scenarios)[number]) => {
          const markers = ["A", "B", "C"].map((part) => `${scenario.id}-${part}`);
          const content = scenario.content
            .replace(">A<", `>${markers[0]}<`)
            .replace(">B<", `>${markers[1]}<`)
            .replace(">C<", `>${markers[2]}<`);
          const html = `
            <style>
              .prelude { box-sizing: border-box; height: 900px; margin: 0; }
              .unsafe-multicol {
                box-sizing: border-box;
                ${scenario.omitBaseHeight === true ? "" : "height: 420px;"}
                column-count: 2;
                column-fill: auto;
                column-gap: 24px;
              }
              .unsafe-multicol p { height: 96px; margin: 0; }
              ${scenario.css}
            </style>
            <p class="prelude">${scenario.id}-PRELUDE</p>
            <section id="unsafe-${scenario.id}" class="unsafe-multicol" data-unsafe-multicol="${scenario.id}">${content}</section>
          `;
          const controller = core.mountPageDocument(host, { html });
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
            const allText = pageTexts.join("\n");
            return {
              pageCount: ready.pageCount,
              shellCount: frameDocument.querySelectorAll(`[data-unsafe-multicol="${scenario.id}"]`)
                .length,
              markerCounts: Object.fromEntries(
                markers.map((marker) => [marker, allText.split(marker).length - 1]),
              ),
              pageFor: markers.map((marker) =>
                pageTexts.findIndex((pageText) => pageText.includes(marker)),
              ),
              warnings: ready.warnings
                .filter((warning) => warning.code === "UNSUPPORTED_LAYOUT")
                .map((warning) => ({
                  code: warning.code,
                  sourceIdentity: warning.sourceIdentity,
                  property: warning.property,
                  value: warning.value,
                  recovery: warning.recovery,
                })),
              overflowCount: ready.warnings.filter((warning) => warning.code === "PAGE_OVERFLOW")
                .length,
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

    for (const result of observation) {
      expect(result.first.pageCount).toBeGreaterThanOrEqual(2);
      expect(result.first.shellCount).toBe(1);
      expect(Object.values(result.first.markerCounts).every((count) => count === 1)).toBe(true);
      expect(result.first.pageFor.every((pageIndex) => pageIndex >= 0)).toBe(true);
      expect(new Set(result.first.pageFor).size).toBe(1);
      expect(result.first.warnings, result.id).toHaveLength(1);
      expect(result.first.warnings).toEqual(result.second.warnings);
      expect(result.first.warnings[0]).toMatchObject({
        code: "UNSUPPORTED_LAYOUT",
        property: "display",
        value: "multicol",
        recovery: "Kept the source layout atomic.",
      });
      expect(result.first.warnings[0]?.sourceIdentity).toMatch(/^source-\d+:section$/u);
      const scenario = UNSUPPORTED_SCENARIOS.find((candidate) => candidate.id === result.id);
      expect(result.first.overflowCount).toBe(scenario?.expectedOverflow ? 1 : 0);
      expect(result.second).toEqual(result.first);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
