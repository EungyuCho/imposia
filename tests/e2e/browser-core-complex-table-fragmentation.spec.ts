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

const BODY_MARKERS = Array.from(
  { length: 24 },
  (_value, index) => `COMPLEX-TABLE-ROW-${String(index + 1).padStart(2, "0")}`,
);

const OVERSIZED_FURNITURE_SCENARIOS = [
  { id: "caption", css: ".furniture-table caption { height: 1200px; }" },
  { id: "header", css: ".furniture-table thead tr { height: 1000px; }" },
  { id: "footer", css: ".furniture-table tfoot tr { height: 1000px; }" },
] as const;

const UNSAFE_TABLE_SCENARIOS = [
  {
    id: "open-span",
    css: "",
    firstCellAttribute: 'rowspan="0"',
  },
  {
    id: "generated-row",
    css: '.unsafe-table tbody::before { content: "GENERATED-TABLE-ROW"; display: table-row; }',
    firstCellAttribute: "",
  },
  {
    id: "non-table-group",
    css: ".unsafe-table tbody { display: block; }",
    firstCellAttribute: "",
  },
  {
    id: "internal-break",
    css: ".unsafe-table caption { break-after: page; }",
    firstCellAttribute: "",
  },
  {
    id: "id-styled-header",
    css: "#unsafe-head tr { background: rgb(1, 2, 3); }",
    firstCellAttribute: "",
  },
] as const;

test("repeats table headers and footers while keeping rowspan clusters and colspan order", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(
      async ({ markers }) => {
        const modulePath = "/packages/core/dist/index.js";
        const core = (await import(modulePath)) as CoreModule;
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const rows = markers
          .map((marker, index) => {
            const rowNumber = index + 1;
            if (rowNumber === 10) {
              return `<tr data-complex-row="${rowNumber}"><th rowspan="2" data-rowspan-cell>ROWSPAN-CELL</th><td data-table-marker="${marker}">${marker}</td></tr>`;
            }
            if (rowNumber === 11) {
              return `<tr data-complex-row="${rowNumber}"><td data-table-marker="${marker}">${marker}</td></tr>`;
            }
            if (rowNumber === 14) {
              return `<tr data-complex-row="${rowNumber}"><td colspan="2" data-colspan-cell data-table-marker="${marker}">${marker}</td></tr>`;
            }
            return `<tr data-complex-row="${rowNumber}"><th>Label ${rowNumber}</th><td data-table-marker="${marker}">${marker}</td></tr>`;
          })
          .join("");
        const controller = core.mountPageDocument(host, {
          html: `
          <style>
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font: 16px/24px Arial, sans-serif; }
            caption { height: 820px; text-align: left; }
            thead tr, tfoot tr { height: 44px; }
            tbody tr { height: 82px; }
            th, td { box-sizing: border-box; padding: 4px; border: 1px solid #111; }
          </style>
          <table id="complex-table">
            <caption>COMPLEX-TABLE-CAPTION</caption>
            <colgroup><col><col></colgroup>
            <thead><tr><th>REPEATED-HEAD-A</th><th>REPEATED-HEAD-B</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="2">REPEATED-FOOT</td></tr></tfoot>
          </table>
        `,
        });

        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
            (pageElement, pageIndex) => ({
              pageIndex,
              text:
                pageElement.querySelector<HTMLElement>("[data-imposia-page-flow]")?.textContent ??
                "",
              tableCount: pageElement.querySelectorAll("table").length,
              sourceIdCount: pageElement.querySelectorAll("table#complex-table").length,
              captionCount: pageElement.querySelectorAll("table caption").length,
              colgroupCount: pageElement.querySelectorAll("table colgroup").length,
              theadCount: pageElement.querySelectorAll("table thead").length,
              tfootCount: pageElement.querySelectorAll("table tfoot").length,
              structure: [...(pageElement.querySelector("table")?.children ?? [])].map(
                (child) => child.localName,
              ),
              rows: [...pageElement.querySelectorAll<HTMLElement>("[data-complex-row]")].map(
                (row) => Number(row.dataset.complexRow),
              ),
              markers: [...pageElement.querySelectorAll<HTMLElement>("[data-table-marker]")].map(
                (element) => element.dataset.tableMarker ?? "",
              ),
            }),
          );
          const pageForRow = Object.fromEntries(
            markers.map((_marker, index) => [
              index + 1,
              pages.findIndex((pageItem) => pageItem.rows.includes(index + 1)),
            ]),
          );
          const allText = pages.map((pageItem) => pageItem.text).join("\n");
          return {
            pageCount: ready.pageCount,
            pages,
            pageForRow,
            actualOrder: pages.flatMap((pageItem) => pageItem.markers),
            markerCounts: Object.fromEntries(
              markers.map((marker) => [marker, allText.split(marker).length - 1]),
            ),
            headCount: allText.split("REPEATED-HEAD-A").length - 1,
            footCount: allText.split("REPEATED-FOOT").length - 1,
            captionCount: allText.split("COMPLEX-TABLE-CAPTION").length - 1,
            rowspanCellCount: frameDocument.querySelectorAll("[data-rowspan-cell]").length,
            rowspan: frameDocument
              .querySelector<HTMLTableCellElement>("[data-rowspan-cell]")
              ?.getAttribute("rowspan"),
            colspanCellCount: frameDocument.querySelectorAll("[data-colspan-cell]").length,
            colspan: frameDocument
              .querySelector<HTMLTableCellElement>("[data-colspan-cell]")
              ?.getAttribute("colspan"),
            warningCodes: ready.warnings.map((warning) => warning.code),
          };
        } finally {
          await controller.destroy();
          host.remove();
        }
      },
      { markers: BODY_MARKERS },
    );

    const tablePages = observation.pages.filter((pageItem) => pageItem.tableCount > 0);
    expect(observation.pageCount).toBeGreaterThanOrEqual(3);
    expect(tablePages.length).toBeGreaterThanOrEqual(3);
    expect(tablePages.every((pageItem) => pageItem.tableCount === 1)).toBe(true);
    expect(tablePages.every((pageItem) => pageItem.theadCount === 1)).toBe(true);
    expect(tablePages.every((pageItem) => pageItem.tfootCount === 1)).toBe(true);
    expect(tablePages.every((pageItem) => pageItem.colgroupCount === 1)).toBe(true);
    expect(tablePages.reduce((total, pageItem) => total + pageItem.captionCount, 0)).toBe(1);
    expect(tablePages.reduce((total, pageItem) => total + pageItem.sourceIdCount, 0)).toBe(1);
    expect(observation.headCount).toBe(tablePages.length);
    expect(observation.footCount).toBe(tablePages.length);
    expect(observation.captionCount).toBe(1);
    for (const pageItem of tablePages) {
      const headIndex = pageItem.structure.indexOf("thead");
      const bodyIndex = pageItem.structure.indexOf("tbody");
      const footIndex = pageItem.structure.indexOf("tfoot");
      expect(headIndex).toBeGreaterThanOrEqual(0);
      expect(bodyIndex).toBeGreaterThan(headIndex);
      expect(footIndex).toBeGreaterThan(bodyIndex);
    }
    const captionPage = tablePages.find((pageItem) => pageItem.captionCount === 1)?.pageIndex;
    expect(captionPage).toBeDefined();
    expect(observation.pageForRow[1]).toBeGreaterThan(captionPage ?? -1);
    expect(observation.actualOrder).toEqual(BODY_MARKERS);
    expect(observation.markerCounts).toEqual(
      Object.fromEntries(BODY_MARKERS.map((marker) => [marker, 1])),
    );
    expect(Object.values(observation.pageForRow).every((pageNumber) => pageNumber >= 0)).toBe(true);
    expect(observation.pageForRow[10]).toBe(observation.pageForRow[11]);
    expect(observation.rowspanCellCount).toBe(1);
    expect(observation.rowspan).toBe("2");
    expect(observation.colspanCellCount).toBe(1);
    expect(observation.colspan).toBe("2");
    expect(observation.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
    expect(observation.warningCodes).not.toContain("PAGE_OVERFLOW");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps an oversized long-cell row atomic with one deterministic located warning", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModule;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const lines = Array.from(
        { length: 60 },
        (_value, index) => `LONG-CELL-LINE-${String(index + 1).padStart(2, "0")}`,
      );
      const html = `
        <style>
          table { width: 100%; border-collapse: collapse; font: 16px/24px Arial, sans-serif; }
          thead tr, tfoot tr { height: 44px; }
          th, td { padding: 0; border: 1px solid #111; }
          .prefix-row { height: 120px; }
        </style>
        <table>
          <thead><tr><th>LONG-HEAD</th><th>Value</th></tr></thead>
          <tbody>
            <tr class="prefix-row"><td>LONG-PREFIX-A</td><td>LONG-PREFIX-B</td></tr>
            <tr data-long-row><td>${lines.join("<br>")}</td><td>LONG-CELL-END</td></tr>
          </tbody>
          <tfoot><tr><td colspan="2">LONG-FOOT</td></tr></tfoot>
        </table>
      `;
      const run = async () => {
        const controller = core.mountPageDocument(host, { html });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
          const pageTexts = pages.map(
            (pageElement) =>
              pageElement.querySelector<HTMLElement>("[data-imposia-page-flow]")?.textContent ?? "",
          );
          const allText = pageTexts.join("\n");
          const longRows = [...frameDocument.querySelectorAll("[data-long-row]")];
          return {
            pageCount: ready.pageCount,
            longRowCount: longRows.length,
            longRowPage: pages.findIndex((pageElement) =>
              longRows.some((row) => pageElement.contains(row)),
            ),
            markerCounts: Object.fromEntries(
              ["LONG-PREFIX-A", "LONG-PREFIX-B", "LONG-CELL-END", ...lines].map((marker) => [
                marker,
                allText.split(marker).length - 1,
              ]),
            ),
            locatedWarnings: ready.warnings
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
      const first = await run();
      const second = await run();
      host.remove();
      return { first, second };
    });

    expect(observation.first.pageCount).toBeGreaterThanOrEqual(2);
    expect(observation.first.longRowCount).toBe(1);
    expect(observation.first.longRowPage).toBeGreaterThanOrEqual(0);
    expect(Object.values(observation.first.markerCounts).every((count) => count === 1)).toBe(true);
    expect(observation.first.locatedWarnings).toHaveLength(1);
    expect(observation.first.locatedWarnings).toEqual(observation.second.locatedWarnings);
    expect(observation.first.locatedWarnings[0]).toMatchObject({
      code: "UNSUPPORTED_LAYOUT",
      property: "display",
      value: "table-row",
      recovery: "Kept the row cluster atomic.",
    });
    expect(observation.first.locatedWarnings[0]?.sourceIdentity).toMatch(/^source-\d+:tr$/u);
    expect(observation.first.overflowCount).toBe(1);
    expect(observation.first.pageCount).toBe(observation.second.pageCount);
    expect(observation.first.longRowPage).toBe(observation.second.longRowPage);
    expect(observation.first.markerCounts).toEqual(observation.second.markerCounts);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("attributes oversized caption, header, and footer overflow to table furniture", async ({
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
          const marker = `FURNITURE-BODY-${scenario.id}`;
          const html = `
            <style>
              .furniture-table { width: 100%; border-collapse: collapse; }
              .furniture-table caption { height: 24px; }
              .furniture-table tr { height: 50px; }
              ${scenario.css}
            </style>
            <table class="furniture-table">
              <caption>FURNITURE-CAPTION</caption>
              <thead><tr><th>FURNITURE-HEAD</th></tr></thead>
              <tbody><tr data-furniture-row><td>${marker}</td></tr></tbody>
              <tfoot><tr><td>FURNITURE-FOOT</td></tr></tfoot>
            </table>
          `;
          const controller = core.mountPageDocument(host, { html });
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const text = frameDocument.body.textContent ?? "";
            return {
              pageCount: ready.pageCount,
              rowCount: frameDocument.querySelectorAll("[data-furniture-row]").length,
              markerCount: text.split(marker).length - 1,
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
      { scenarios: OVERSIZED_FURNITURE_SCENARIOS },
    );

    for (const result of observation) {
      expect(result.first.pageCount).toBeGreaterThanOrEqual(1);
      if (result.id === "caption") expect(result.first.pageCount).toBeGreaterThanOrEqual(2);
      expect(result.first.rowCount).toBe(1);
      expect(result.first.markerCount).toBe(1);
      expect(result.first.warnings).toHaveLength(1);
      expect(result.first.warnings).toEqual(result.second.warnings);
      expect(result.first.warnings[0]).toMatchObject({
        code: "UNSUPPORTED_LAYOUT",
        property: "display",
        value: "table",
        recovery: "Kept the table furniture atomic.",
      });
      expect(result.first.warnings[0]?.sourceIdentity).toMatch(/^source-\d+:table$/u);
      expect(result.first.overflowCount).toBe(1);
      expect(result.first.pageCount).toBe(result.second.pageCount);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps unsupported table structures atomic with deterministic located warnings", async ({
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
          const markers = ["PRELUDE", "FIRST", "SECOND", "THIRD"].map(
            (part) => `${scenario.id}-${part}`,
          );
          const html = `
            <style>
              .prelude { box-sizing: border-box; height: 820px; margin: 0; }
              table { width: 100%; border-collapse: collapse; }
              tr { height: 120px; }
              ${scenario.css}
            </style>
            <p class="prelude">${markers[0]}</p>
            <table class="unsafe-table" data-unsafe-table="${scenario.id}">
              <caption>UNSAFE-CAPTION</caption>
              <thead id="unsafe-head"><tr><th>UNSAFE-HEAD-A</th><th>UNSAFE-HEAD-B</th></tr></thead>
              <tbody>
                <tr><td ${scenario.firstCellAttribute}>${markers[1]}</td><td>${markers[2]}</td></tr>
                <tr><td>${markers[3]}</td></tr>
              </tbody>
              <tfoot><tr><td colspan="2">UNSAFE-FOOT</td></tr></tfoot>
            </table>
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
              tableCount: frameDocument.querySelectorAll(`[data-unsafe-table="${scenario.id}"]`)
                .length,
              pageFor: Object.fromEntries(
                markers.map((marker) => [
                  marker,
                  pageTexts.findIndex((pageText) => pageText.includes(marker)),
                ]),
              ),
              markerCounts: Object.fromEntries(
                markers.map((marker) => [marker, allText.split(marker).length - 1]),
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
      { scenarios: UNSAFE_TABLE_SCENARIOS },
    );

    for (const [index, result] of observation.entries()) {
      const scenario = UNSAFE_TABLE_SCENARIOS[index];
      if (scenario === undefined) throw new Error("Missing unsafe table scenario.");
      const markers = ["PRELUDE", "FIRST", "SECOND", "THIRD"].map(
        (part) => `${scenario.id}-${part}`,
      );
      expect(result.id).toBe(scenario.id);
      expect(result.first.pageCount).toBeGreaterThanOrEqual(2);
      expect(result.first.tableCount).toBe(1);
      expect(Object.values(result.first.markerCounts).every((count) => count === 1)).toBe(true);
      expect(result.first.pageFor[markers[0] ?? ""]).toBeLessThan(
        result.first.pageFor[markers[1] ?? ""] ?? -1,
      );
      expect(result.first.pageFor[markers[1] ?? ""]).toBe(result.first.pageFor[markers[2] ?? ""]);
      expect(result.first.pageFor[markers[2] ?? ""]).toBe(result.first.pageFor[markers[3] ?? ""]);
      expect(result.first.warnings).toHaveLength(1);
      expect(result.first.warnings).toEqual(result.second.warnings);
      expect(result.first.warnings[0]).toMatchObject({
        code: "UNSUPPORTED_LAYOUT",
        property: "display",
        value: "table",
        recovery: "Kept the source layout atomic.",
      });
      expect(result.first.warnings[0]?.sourceIdentity).toMatch(/^source-\d+:table$/u);
      expect(result.first.pageFor).toEqual(result.second.pageFor);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
