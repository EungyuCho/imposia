import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type PageObservation = {
  readonly pageCount: number;
  readonly flows: readonly string[];
  readonly warningCodes: readonly string[];
};

type CoreController = {
  readonly ready: Promise<{
    readonly iframe: HTMLIFrameElement;
    readonly pageCount: number;
    readonly pages: readonly unknown[];
    readonly warnings: readonly { readonly code: string }[];
  }>;
  destroy(): Promise<void>;
};

type CoreModule = {
  mountPageDocument(
    container: HTMLElement,
    source: { html: string },
    options?: { readonly css?: readonly string[] },
  ): CoreController;
};

const markerOccurrences = (text: string, markers: readonly string[]): readonly number[] =>
  markers.map((marker) => {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [...text.matchAll(new RegExp(`${escaped}(?!\\d)`, "g"))].length;
  });

const orderedMarkerIndexes = (text: string, markers: readonly string[]): readonly number[] =>
  markers.map((marker) => text.indexOf(marker));

test.describe("Chromium Core fragmentation and layout quality", () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== "chromium", "Layout-quality pagination is Chromium-reference only.");
  });

  test("honors break-before and break-after at nested block boundaries", async ({
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
        const controller = core.mountPageDocument(host, {
          html: `
            <style>
              article { margin: 0; font: 16px/24px Arial, sans-serif; }
              article > * { margin: 0; }
            </style>
            <article>
              <p data-marker="nested-start">NESTED-START</p>
              <section data-marker="nested-before" style="break-before: page">NESTED-BEFORE</section>
              <section data-marker="nested-after" style="break-after: page">NESTED-AFTER</section>
              <p data-marker="nested-end">NESTED-END</p>
            </article>
          `,
        });

        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const flows = [
            ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]"),
          ].map((flow) => flow.textContent ?? "");
          return { pageCount: ready.pageCount, flows };
        } finally {
          await controller.destroy();
          host.replaceChildren();
        }
      });

      const markers = ["NESTED-START", "NESTED-BEFORE", "NESTED-AFTER", "NESTED-END"];
      const allText = observation.flows.join("\n");
      const pages = markers.map((marker) =>
        observation.flows.findIndex((flow) => flow.includes(marker)),
      );

      expect(observation.pageCount).toBeGreaterThanOrEqual(3);
      expect(markerOccurrences(allText, markers)).toEqual([1, 1, 1, 1]);
      expect(pages.every((pageNumber) => pageNumber >= 0)).toBe(true);
      expect(pages[0]).toBeLessThan(pages[1] ?? -1);
      expect(pages[1]).toBe(pages[2]);
      expect(pages[2]).toBeLessThan(pages[3] ?? -1);
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("moves a fitting break-inside avoid block intact and warns once when avoidance is relaxed", async ({
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
        const fittingHtml = `
          <style>
            .prelude { height: 820px; margin: 0; }
            .avoid-block { break-inside: avoid; margin: 0; }
            .avoid-block p { height: 110px; margin: 0; }
          </style>
          <div class="prelude">AVOID-PRELUDE</div>
          <section class="avoid-block">
            <p>AVOID-FIRST</p><p>AVOID-SECOND</p>
          </section>
          <p>AVOID-AFTER</p>
        `;
        const oversizedTokens = Array.from(
          { length: 160 },
          (_value, index) => `AVOID-OVERSIZED-${String(index + 1).padStart(3, "0")}`,
        );
        const oversizedHtml = `
          <style>
            .oversized-avoid { break-inside: avoid; margin: 0; font: 16px/24px Arial, sans-serif; }
          </style>
          <section class="oversized-avoid">${oversizedTokens.join(" ")}</section>
        `;

        const run = async (html: string): Promise<PageObservation> => {
          const controller = core.mountPageDocument(host, { html });
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const flows = [
              ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]"),
            ].map((flow) => flow.textContent ?? "");
            return {
              pageCount: ready.pageCount,
              flows,
              warningCodes: ready.warnings.map((warning) => warning.code),
            };
          } finally {
            await controller.destroy();
          }
        };

        const fitting = await run(fittingHtml);
        const oversized = await run(oversizedHtml);
        host.replaceChildren();
        return { fitting, oversized, oversizedTokens };
      });

      const fittingText = observation.fitting.flows.join("\n");
      const fittingPages = ["AVOID-FIRST", "AVOID-SECOND"].map((marker) =>
        observation.fitting.flows.findIndex((flow) => flow.includes(marker)),
      );
      expect(observation.fitting.pageCount).toBeGreaterThanOrEqual(2);
      expect(
        markerOccurrences(fittingText, [
          "AVOID-PRELUDE",
          "AVOID-FIRST",
          "AVOID-SECOND",
          "AVOID-AFTER",
        ]),
      ).toEqual([1, 1, 1, 1]);
      expect(fittingPages[0]).toBeGreaterThan(0);
      expect(fittingPages[1]).toBe(fittingPages[0]);

      const oversizedText = observation.oversized.flows.join("\n");
      expect(markerOccurrences(oversizedText, observation.oversizedTokens)).toEqual(
        observation.oversizedTokens.map(() => 1),
      );
      expect(observation.oversized.warningCodes.filter((code) => code === "AVOID_RELAXED")).toEqual(
        ["AVOID_RELAXED"],
      );
      expect(
        observation.oversized.warningCodes.filter((code) => code === "AVOID_RELAXED"),
      ).toHaveLength(1);
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("keeps widows and orphans legal when possible and relaxes deterministically when impossible", async ({
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
        const legalLines = Array.from(
          { length: 42 },
          (_value, index) => `WIDOW-LINE-${String(index + 1).padStart(2, "0")}`,
        );
        const impossibleLines = Array.from(
          { length: 42 },
          (_value, index) => `RELAX-LINE-${String(index + 1).padStart(2, "0")}`,
        );
        const makeHtml = (lines: readonly string[], widows: number, orphans: number) => `
          <style>
            p { margin: 0; font: 16px/24px Arial, sans-serif; }
          </style>
          <p style="widows: ${widows}; orphans: ${orphans}">${lines
            .map((line) => `<span data-line="${line}">${line}</span>`)
            .join("<br>")}</p>
        `;
        const run = async (html: string) => {
          const controller = core.mountPageDocument(host, { html });
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const pages = [
              ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]"),
            ].map((pageElement) => ({
              lineCount: pageElement.querySelectorAll("[data-line]").length,
              text: pageElement.querySelector("[data-imposia-page-flow]")?.textContent ?? "",
            }));
            return {
              pageCount: ready.pageCount,
              pages,
              warningCodes: ready.warnings.map((warning) => warning.code),
            };
          } finally {
            await controller.destroy();
          }
        };
        const legal = await run(makeHtml(legalLines, 3, 3));
        const impossibleFirst = await run(makeHtml(impossibleLines, 30, 30));
        const impossibleSecond = await run(makeHtml(impossibleLines, 30, 30));
        host.replaceChildren();
        return { legal, impossibleFirst, impossibleSecond, legalLines, impossibleLines };
      });

      const legalCounts = observation.legal.pages
        .map((item) => item.lineCount)
        .filter((count) => count > 0);
      expect(observation.legal.pageCount).toBeGreaterThanOrEqual(2);
      expect(legalCounts.length).toBeGreaterThanOrEqual(2);
      expect(legalCounts.every((count) => count >= 3)).toBe(true);
      expect(
        markerOccurrences(
          observation.legal.pages.map((pageItem) => pageItem.text).join("\n"),
          observation.legalLines,
        ),
      ).toEqual(observation.legalLines.map(() => 1));

      const impossibleText = observation.impossibleFirst.pages.map((item) => item.text).join("\n");
      expect(markerOccurrences(impossibleText, observation.impossibleLines)).toEqual(
        observation.impossibleLines.map(() => 1),
      );
      expect(observation.impossibleFirst.warningCodes).toContain("WIDOW_ORPHAN_RELAXED");
      expect(observation.impossibleFirst.warningCodes).toEqual(
        observation.impossibleSecond.warningCodes,
      );
      expect(observation.impossibleFirst.pages.map((item) => item.lineCount)).toEqual(
        observation.impossibleSecond.pages.map((item) => item.lineCount),
      );
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("splits semantic tables only between rows, repeats thead, and preserves table structure", async ({
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
        const rows = Array.from({ length: 28 }, (_value, index) => {
          const number = String(index + 1).padStart(2, "0");
          return {
            id: `ROW-${number}`,
            first: `ROW-${number}-A`,
            second: `ROW-${number}-B`,
          };
        });
        const rowHtml = rows
          .map((row) => `<tr data-row="${row.id}"><td>${row.first}</td><td>${row.second}</td></tr>`)
          .join("");
        const controller = core.mountPageDocument(host, {
          html: `
            <style>
              table { width: 100%; border-collapse: collapse; font: 16px/24px Arial, sans-serif; }
              caption { height: 28px; text-align: left; }
              th, td { height: 56px; padding: 0; border: 1px solid #111; }
            </style>
            <table id="semantic-table">
              <caption>TABLE-CAPTION</caption>
              <colgroup><col><col></colgroup>
              <thead><tr><th>TABLE-HEAD-A</th><th>TABLE-HEAD-B</th></tr></thead>
              <tbody>${rowHtml}</tbody>
            </table>
          `,
        });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
            (pageElement) => ({
              text: pageElement.querySelector("[data-imposia-page-flow]")?.textContent ?? "",
              rows: [...pageElement.querySelectorAll<HTMLTableRowElement>("tr[data-row]")].map(
                (row) => ({
                  id: row.dataset.row ?? "",
                  cells: [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? ""),
                }),
              ),
              tableCount: pageElement.querySelectorAll("table").length,
              sourceIdCount: pageElement.querySelectorAll("table#semantic-table").length,
              theadCount: pageElement.querySelectorAll("table thead").length,
              captionCount: pageElement.querySelectorAll("table caption").length,
              colgroupCount: pageElement.querySelectorAll("table colgroup").length,
            }),
          );
          return {
            pageCount: ready.pageCount,
            pages,
            warningCodes: ready.warnings.map((warning) => warning.code),
            rows,
          };
        } finally {
          await controller.destroy();
          host.replaceChildren();
        }
      });

      const sourceMarkers = observation.rows.flatMap((row) => [row.first, row.second]);
      const allText = observation.pages.map((item) => item.text).join("\n");
      expect(observation.pageCount).toBeGreaterThanOrEqual(2);
      expect(observation.pages.filter((item) => item.tableCount > 0).length).toBeGreaterThanOrEqual(
        2,
      );
      expect(
        observation.pages
          .filter((item) => item.tableCount > 0)
          .every((item) => item.theadCount === 1),
      ).toBe(true);
      expect(observation.pages.reduce((total, item) => total + item.captionCount, 0)).toBe(1);
      expect(observation.pages.reduce((total, item) => total + item.sourceIdCount, 0)).toBe(1);
      expect(observation.pages.reduce((total, item) => total + item.colgroupCount, 0)).toBe(
        observation.pages.filter((item) => item.tableCount > 0).length,
      );
      expect(markerOccurrences(allText, ["TABLE-CAPTION", "TABLE-HEAD-A", "TABLE-HEAD-B"])).toEqual(
        [
          1,
          observation.pages.filter((item) => item.tableCount > 0).length,
          observation.pages.filter((item) => item.tableCount > 0).length,
        ],
      );
      expect(markerOccurrences(allText, sourceMarkers)).toEqual(sourceMarkers.map(() => 1));
      expect(orderedMarkerIndexes(allText, sourceMarkers).every((index) => index >= 0)).toBe(true);
      expect(orderedMarkerIndexes(allText, sourceMarkers)).toEqual(
        [...orderedMarkerIndexes(allText, sourceMarkers)].sort((left, right) => left - right),
      );
      for (const row of observation.rows) {
        const matchingPages = observation.pages.filter((item) =>
          item.rows.some((candidate) => candidate.id === row.id),
        );
        expect(matchingPages).toHaveLength(1);
        expect(matchingPages[0]?.rows.find((candidate) => candidate.id === row.id)?.cells).toEqual([
          row.first,
          row.second,
        ]);
      }
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("keeps an oversized table row intact and reports deterministic overflow", async ({
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
        const hugeLines = Array.from(
          { length: 60 },
          (_value, index) => `HUGE-ROW-LINE-${String(index + 1).padStart(2, "0")}`,
        );
        const controller = core.mountPageDocument(host, {
          html: `
            <style>
              table { width: 100%; border-collapse: collapse; font: 16px/24px Arial, sans-serif; }
              th, td { padding: 0; border: 1px solid #111; }
              .normal-row td { height: 100px; }
            </style>
            <table>
              <tbody>
                <tr class="normal-row"><td>TABLE-PREFIX-A</td><td>TABLE-PREFIX-B</td></tr>
                <tr data-row="huge"><td>${hugeLines.join("<br>")}</td><td>HUGE-ROW-CELL</td></tr>
              </tbody>
            </table>
          `,
        });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const hugeRows = [...frameDocument.querySelectorAll("tr[data-row='huge']")];
          const hugeRowPages = hugeRows.map((row) =>
            [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].findIndex(
              (pageElement) => pageElement.contains(row),
            ),
          );
          return {
            pageCount: ready.pageCount,
            hugeRows: hugeRows.length,
            hugeRowPages,
            text: [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]")]
              .map((flow) => flow.textContent ?? "")
              .join("\n"),
            warningCodes: ready.warnings.map((warning) => warning.code),
            hugeLines,
          };
        } finally {
          await controller.destroy();
          host.replaceChildren();
        }
      });

      expect(observation.pageCount).toBeGreaterThanOrEqual(2);
      expect(observation.hugeRows).toBe(1);
      expect(observation.hugeRowPages).toHaveLength(1);
      expect(observation.hugeRowPages[0]).toBeGreaterThanOrEqual(0);
      expect(
        markerOccurrences(observation.text, [
          "TABLE-PREFIX-A",
          "TABLE-PREFIX-B",
          "HUGE-ROW-CELL",
          ...observation.hugeLines,
        ]),
      ).toEqual([1, 1, 1, ...observation.hugeLines.map(() => 1)]);
      expect(observation.warningCodes.filter((code) => code === "PAGE_OVERFLOW")).toEqual([
        "PAGE_OVERFLOW",
      ]);
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("fragments safe flex columns and one-column grids between items", async ({
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
        const flexItems = Array.from({ length: 8 }, (_value, index) => `FLEX-ITEM-${index + 1}`);
        const gridItems = Array.from({ length: 8 }, (_value, index) => `GRID-ITEM-${index + 1}`);
        const controller = core.mountPageDocument(host, {
          html: `
            <style>
              .safe-flex, .safe-grid { margin: 0; font: 16px/24px Arial, sans-serif; }
              .safe-flex { display: flex; flex-direction: column; gap: 12px; }
              .safe-grid { display: grid; grid-template-columns: 1fr; row-gap: 12px; }
              .safe-flex > *, .safe-grid > * { height: 250px; margin: 0; }
            </style>
            <div class="safe-flex">${flexItems.map((item) => `<div data-flex-item>${item}</div>`).join("")}</div>
            <div class="safe-grid">${gridItems.map((item) => `<div data-grid-item>${item}</div>`).join("")}</div>
          `,
        });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
            (pageElement) => ({
              text: pageElement.querySelector("[data-imposia-page-flow]")?.textContent ?? "",
              flexItems: [...pageElement.querySelectorAll("[data-flex-item]")].map(
                (item) => item.textContent ?? "",
              ),
              gridItems: [...pageElement.querySelectorAll("[data-grid-item]")].map(
                (item) => item.textContent ?? "",
              ),
            }),
          );
          return {
            pageCount: ready.pageCount,
            pages,
            warningCodes: ready.warnings.map((warning) => warning.code),
            flexItems,
            gridItems,
          };
        } finally {
          await controller.destroy();
          host.replaceChildren();
        }
      });

      const allText = observation.pages.map((item) => item.text).join("\n");
      expect(observation.pageCount).toBeGreaterThanOrEqual(2);
      expect(
        markerOccurrences(allText, [...observation.flexItems, ...observation.gridItems]),
      ).toEqual([...observation.flexItems.map(() => 1), ...observation.gridItems.map(() => 1)]);
      expect(new Set(observation.pages.flatMap((item) => item.flexItems)).size).toBe(
        observation.flexItems.length,
      );
      expect(new Set(observation.pages.flatMap((item) => item.gridItems)).size).toBe(
        observation.gridItems.length,
      );
      expect(observation.pages.filter((item) => item.flexItems.length > 0).length).toBeGreaterThan(
        1,
      );
      expect(observation.pages.filter((item) => item.gridItems.length > 0).length).toBeGreaterThan(
        1,
      );
      expect(observation.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("keeps row flex and spanning grid atomic with UNSUPPORTED_LAYOUT", async ({
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
        const rowTokens = Array.from({ length: 48 }, (_value, index) => `ROW-FLEX-${index + 1}`);
        const gridTokens = Array.from({ length: 48 }, (_value, index) => `SPAN-GRID-${index + 1}`);
        const rowText = rowTokens.join(" ");
        const gridText = gridTokens.join(" ");
        const controller = core.mountPageDocument(host, {
          html: `
            <style>
              .unsupported { font: 16px/24px Arial, sans-serif; }
              .row-flex { display: flex; flex-direction: row; }
              .row-flex > * { flex: 1 1 0; }
              .spanning-grid { display: grid; grid-template-columns: 1fr 1fr; }
              .spanning-grid .span { grid-column: 1 / -1; }
            </style>
            <div class="unsupported row-flex"><div>${rowText}</div><div>ROW-FLEX-END</div></div>
            <div class="unsupported spanning-grid"><div class="span">${gridText}</div><div>SPAN-GRID-END</div></div>
          `,
        });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          return {
            pageCount: ready.pageCount,
            pages: [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
              (pageElement) =>
                pageElement.querySelector("[data-imposia-page-flow]")?.textContent ?? "",
            ),
            text: [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]")]
              .map((flow) => flow.textContent ?? "")
              .join("\n"),
            warningCodes: ready.warnings.map((warning) => warning.code),
            rowTokens,
            gridTokens,
          };
        } finally {
          await controller.destroy();
          host.replaceChildren();
        }
      });

      expect(
        markerOccurrences(observation.text, [
          ...observation.rowTokens,
          "ROW-FLEX-END",
          ...observation.gridTokens,
          "SPAN-GRID-END",
        ]),
      ).toEqual([
        ...observation.rowTokens.map(() => 1),
        1,
        ...observation.gridTokens.map(() => 1),
        1,
      ]);
      const rowPages = observation.pages.filter((text) =>
        observation.rowTokens.some((token) => text.includes(token)),
      );
      const gridPages = observation.pages.filter((text) =>
        observation.gridTokens.some((token) => text.includes(token)),
      );
      expect(rowPages).toHaveLength(1);
      expect(gridPages).toHaveLength(1);
      expect(observation.warningCodes).toContain("UNSUPPORTED_LAYOUT");
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("does not silently overflow a constrained multicolumn flow", async ({
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
        const tokens = Array.from({ length: 90 }, (_value, index) => `MULTICOL-${index + 1}`);
        const controller = core.mountPageDocument(host, {
          html: `
            <style>
              .multicol { column-count: 2; column-gap: 24px; height: 900px; margin: 0; font: 16px/24px Arial, sans-serif; }
            </style>
            <section class="multicol">${tokens.join(" ")}</section>
          `,
        });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const flows = [
            ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]"),
          ].map((flow) => flow.textContent ?? "");
          return {
            pageCount: ready.pageCount,
            flows,
            warningCodes: ready.warnings.map((warning) => warning.code),
            experimentalStatus:
              frameDocument.querySelector<HTMLElement>("[data-imposia-layout-status]")?.dataset
                .status ?? null,
            tokens,
          };
        } finally {
          await controller.destroy();
          host.replaceChildren();
        }
      });

      expect(markerOccurrences(observation.flows.join("\n"), observation.tokens)).toEqual(
        observation.tokens.map(() => 1),
      );
      const pagesWithText = observation.flows.filter((flow) => flow.trim() !== "");
      const continuedAcrossPages = pagesWithText.length > 1;
      const explicitStatus =
        observation.warningCodes.includes("UNSUPPORTED_LAYOUT") ||
        observation.experimentalStatus !== null;
      expect(continuedAcrossPages || explicitStatus).toBe(true);
      if (!continuedAcrossPages) {
        expect(observation.experimentalStatus ?? observation.warningCodes).not.toEqual(null);
      }
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });
});
