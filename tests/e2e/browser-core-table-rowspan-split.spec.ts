import { expect, type Page, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// tableRowspan: "split" cuts a rowspan cluster between rows. Every row appears once in order,
// merged content appears once, and the rowspans of the pieces add up to the authored span.

type PageObservation = Readonly<{
  rows: readonly string[];
  merged: readonly Readonly<{ id: string; text: string; rowspan: number }>[];
  rowColumns: readonly (readonly string[])[];
  tableWidth: number | undefined;
  colWidths: readonly number[];
  rowCount: number;
}>;

type TableObservation = Readonly<{
  pageCount: number;
  warningCodes: readonly string[];
  overflowingPages: readonly number[];
  pages: readonly PageObservation[];
  colgroups: readonly string[];
  tableStyles: readonly string[];
}>;

async function observe(
  page: Page,
  body: string,
  options: Record<string, unknown> = {},
  extraStyle = "",
): Promise<TableObservation> {
  return page.evaluate(
    async ({ body: html, options: documentOptions, extraStyle: style }) => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(
        host,
        {
          html: `
            <style>
              @page { size: 148mm 210mm; margin: 12mm; }
              body { font: 14px/20px serif; }
              table { width: 100%; border-collapse: collapse; }
              td, th { border: 1px solid #888; padding: 2px 4px; vertical-align: top; }
              p { margin: 0 0 4px; }
              ${style}
            </style>
            ${html}`,
        },
        documentOptions,
      );
      try {
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument as Document;
        const pages = [...frame.querySelectorAll<HTMLElement>("[data-imposia-page]")];
        return {
          pageCount: ready.pageCount,
          warningCodes: ready.warnings.map((warning) => warning.code),
          overflowingPages: pages.flatMap((item, index) => {
            const flow = item.querySelector<HTMLElement>("[data-imposia-page-flow]");
            const content = item.querySelector<HTMLElement>("[data-imposia-page-content]");
            if (flow === null || content === null) return [];
            return flow.scrollHeight > content.clientHeight + 1 ? [index] : [];
          }),
          colgroups: [...frame.querySelectorAll("colgroup")].map((group) => group.outerHTML),
          tableStyles: [...frame.querySelectorAll("table")].map(
            (table) => table.getAttribute("style") ?? "",
          ),
          pages: pages.map((item) => {
            const table = item.querySelector("table");
            return {
              rows: [...item.querySelectorAll("td[data-row]")].map((cell) =>
                (cell.textContent ?? "").trim(),
              ),
              merged: [...item.querySelectorAll("td[data-merged]")].map((cell) => ({
                id: cell.getAttribute("data-merged") ?? "",
                text: (cell.textContent ?? "").trim(),
                rowspan: Number(cell.getAttribute("rowspan") ?? "1"),
              })),
              rowColumns: [...item.querySelectorAll("tbody tr")].map((row) =>
                [...row.children].map((cell) => cell.getAttribute("data-col") ?? "?"),
              ),
              tableWidth: table?.getBoundingClientRect().width,
              colWidths: [...(table?.querySelectorAll("tbody tr:first-child > *") ?? [])].map(
                (cell) => cell.getBoundingClientRect().width,
              ),
              rowCount: item.querySelectorAll("tbody tr").length,
            };
          }),
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    },
    { body, options, extraStyle },
  );
}

const rowTokens = (count: number, from = 1) =>
  Array.from({ length: count }, (_v, i) => `R-${i + from}`);
const allRows = (observation: TableObservation) => observation.pages.flatMap((p) => p.rows);

/** Merged cell ids with the total rowspan and the number of non-empty copies. */
function mergedTotals(observation: TableObservation) {
  const totals = new Map<string, { rowspan: number; withText: number }>();
  for (const piece of observation.pages.flatMap((p) => p.merged)) {
    const entry = totals.get(piece.id) ?? { rowspan: 0, withText: 0 };
    entry.rowspan += piece.rowspan;
    if (piece.text !== "") entry.withText += 1;
    totals.set(piece.id, entry);
  }
  return totals;
}

function mergedTable(rowCount: number, rowAttributes = "") {
  const rows = rowTokens(rowCount)
    .map(
      (token, index) =>
        `<tr${rowAttributes}>${
          index === 0 ? `<td data-merged="A" data-col="A" rowspan="${rowCount}">MERGED</td>` : ""
        }<td data-row data-col="B">${token}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Group</th><th>Item</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const TALL_ROWS = "td { height: 24px; }";

test.describe("tableRowspan", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/examples/book.html");
  });

  test("splits a 40-row rowspan table in a div from the space left on the page", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const html = `<p>Intro paragraph before the table.</p><div>${mergedTable(40)}</div>`;
      const split = await observe(page, html, { tableRowspan: "split" }, TALL_ROWS);
      expect(allRows(split)).toEqual(rowTokens(40));
      expect(split.pageCount).toBeGreaterThan(1);
      expect(split.warningCodes).not.toContain("PAGE_OVERFLOW");
      expect(split.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
      expect(split.overflowingPages).toEqual([]);
      // The first piece shares the page with the intro and holds the merged content.
      expect(split.pages[0]?.rows.length).toBeGreaterThan(0);
      expect(split.pages[0]?.merged[0]?.text).toBe("MERGED");
      expect(mergedTotals(split).get("A")).toEqual({ rowspan: 40, withText: 1 });
      for (const [index, p] of split.pages.entries()) {
        expect(p.merged[0]?.rowspan).toBe(p.rowCount);
        if (index > 0) expect(p.merged[0]?.text).toBe("");
      }

      // The default keeps the cluster whole, as before.
      const preserved = await observe(page, html, {}, TALL_ROWS);
      expect(preserved.warningCodes).toContain("UNSUPPORTED_LAYOUT");
      const explicit = await observe(page, html, { tableRowspan: "preserve" }, TALL_ROWS);
      expect(explicit.warningCodes).toContain("UNSUPPORTED_LAYOUT");
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("uses the page's remaining space for a table inside ol > li", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const intro = Array.from({ length: 12 }, (_v, i) => `<p>Intro ${i + 1}</p>`).join("");
      const html = `${intro}<ol><li><p>Before the table</p>${mergedTable(20)}</li></ol>`;
      const split = await observe(page, html, { tableRowspan: "split" }, TALL_ROWS);
      expect(allRows(split)).toEqual(rowTokens(20));
      expect(split.pages[0]?.rows.length).toBeGreaterThan(0);
      expect(split.warningCodes).not.toContain("PAGE_OVERFLOW");
      expect(mergedTotals(split).get("A")).toEqual({ rowspan: 20, withText: 1 });

      // Without the option the list item moves whole to the next page.
      const preserved = await observe(page, html, {}, TALL_ROWS);
      expect(preserved.pages[0]?.rows ?? []).toEqual([]);
      expect(allRows(preserved)).toEqual(rowTokens(20));
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("keeps the logical column of merged cells that start on different rows", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const rowCount = 30;
      const rows = rowTokens(rowCount)
        .map((token, index) => {
          const r = index + 1;
          const cells: string[] = [];
          if (r === 1) {
            cells.push(`<td data-merged="A" data-col="A" rowspan="30">A-TEXT</td>`);
          }
          if (r === 1 || r === 11 || r === 21) {
            cells.push(`<td data-merged="B${r}" data-col="B" rowspan="10">B${r}-TEXT</td>`);
          }
          cells.push(`<td data-row data-col="C">${token}</td>`);
          if (r === 3) cells.push(`<td data-merged="D3" data-col="D" rowspan="15">D3-TEXT</td>`);
          if (r === 18) cells.push(`<td data-merged="D18" data-col="D" rowspan="13">D18-TEXT</td>`);
          return `<tr>${cells.join("")}</tr>`;
        })
        .join("");
      const html = `<table><tbody>${rows}</tbody></table>`;
      const split = await observe(page, html, { tableRowspan: "split" }, "td { height: 30px; }");
      expect(allRows(split)).toEqual(rowTokens(rowCount));
      expect(split.pageCount).toBeGreaterThan(1);
      expect(split.warningCodes).not.toContain("PAGE_OVERFLOW");
      const totals = mergedTotals(split);
      expect(totals.get("A")).toEqual({ rowspan: 30, withText: 1 });
      expect(totals.get("B1")).toEqual({ rowspan: 10, withText: 1 });
      expect(totals.get("B11")).toEqual({ rowspan: 10, withText: 1 });
      expect(totals.get("B21")).toEqual({ rowspan: 10, withText: 1 });
      expect(totals.get("D3")).toEqual({ rowspan: 15, withText: 1 });
      expect(totals.get("D18")).toEqual({ rowspan: 13, withText: 1 });
      // Within each row the cells stay in logical column order, continuations included.
      for (const columns of split.pages.flatMap((p) => p.rowColumns)) {
        const sorted = [...columns].sort();
        expect(columns).toEqual(sorted);
      }
      const continued = split.pages.slice(1).flatMap((p) => p.rowColumns[0] ?? []);
      expect(continued.length).toBeGreaterThan(1);
      expect(split.pages[1]?.rowColumns[0]?.[0]).toBe("A");
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("row-level break-inside: avoid does not stop the split", async ({ page, browserName }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const html = `<p>Intro</p>${mergedTable(40, ' style="break-inside: avoid"')}`;
      const split = await observe(page, html, { tableRowspan: "split" }, TALL_ROWS);
      expect(allRows(split)).toEqual(rowTokens(40));
      expect(split.warningCodes).not.toContain("PAGE_OVERFLOW");
      expect(split.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
      expect(split.pages[0]?.rows.length).toBeGreaterThan(0);
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("respects a merged cell's own break-inside: avoid and keeps all content", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const html = mergedTable(40).replace(
        'data-merged="A"',
        'data-merged="A" style="break-inside: avoid"',
      );
      const split = await observe(page, html, { tableRowspan: "split" }, TALL_ROWS);
      expect(allRows(split)).toEqual(rowTokens(40));
      expect(mergedTotals(split).get("A")).toEqual({ rowspan: 40, withText: 1 });
      expect(split.warningCodes).toContain("UNSUPPORTED_LAYOUT");
      expect(split.pageCount).toBeLessThan(6);
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("keeps an explicit break-inside: avoid on the surrounding container", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const intro = Array.from({ length: 12 }, (_v, i) => `<p>Intro ${i + 1}</p>`).join("");
      const html = `${intro}<div style="break-inside: avoid">${mergedTable(20)}</div>`;
      const split = await observe(page, html, { tableRowspan: "split" }, TALL_ROWS);
      expect(allRows(split)).toEqual(rowTokens(20));
      // The wrapper fits a fresh page, so it moves whole instead of splitting in place.
      expect(split.pages[0]?.rows ?? []).toEqual([]);
      expect(split.warningCodes).not.toContain("PAGE_OVERFLOW");
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("keeps content and warns when even the first row cannot fit a fresh page", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const html = `<p>Intro</p><table><tbody>
        <tr><td data-merged="A" data-col="A" rowspan="3">MERGED</td><td data-row data-col="B" style="height: 1200px">R-1</td></tr>
        <tr><td data-row data-col="B">R-2</td></tr>
        <tr><td data-row data-col="B">R-3</td></tr>
      </tbody></table>`;
      const split = await observe(page, html, { tableRowspan: "split" });
      expect(allRows(split)).toEqual(rowTokens(3));
      expect(mergedTotals(split).get("A")).toEqual({ rowspan: 3, withText: 1 });
      expect(split.warningCodes).toContain("UNSUPPORTED_LAYOUT");
      expect(split.warningCodes).toContain("PAGE_OVERFLOW");
      expect(split.pageCount).toBeLessThan(5);
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("carries table and column widths to every fragment", async ({ page, browserName }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const rows = rowTokens(60)
        .map(
          (token, index) =>
            `<tr><td data-col="A" style="width: 120px">${index === 0 ? "Narrow" : ""}</td><td data-row data-col="B">${token}</td></tr>`,
        )
        .join("");
      const html = `<table style="width: 90%"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`;
      const split = await observe(page, html, { tableRowspan: "split" }, TALL_ROWS);
      expect(allRows(split)).toEqual(rowTokens(60));
      expect(split.pageCount).toBeGreaterThan(1);
      const first = split.pages[0];
      for (const piece of split.pages) {
        expect(Math.abs((piece.tableWidth ?? 0) - (first?.tableWidth ?? 0))).toBeLessThan(1);
        expect(piece.colWidths).toHaveLength(first?.colWidths.length ?? 0);
        for (const [index, width] of piece.colWidths.entries()) {
          expect(Math.abs(width - (first?.colWidths[index] ?? 0))).toBeLessThan(1);
        }
      }
      expect(split.colgroups.length).toBe(split.pageCount);

      // The default does not touch the table's structure.
      const preserved = await observe(page, html, {}, TALL_ROWS);
      expect(preserved.colgroups).toEqual([]);
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("updates only the widths of a plain colgroup and ignores nested tables", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const rows = rowTokens(60)
        .map(
          (token, index) =>
            `<tr><td data-col="A">${
              index === 0
                ? '<table class="nested"><tr><td>x</td><td>y</td><td>z</td></tr></table>'
                : ""
            }</td><td data-row data-col="B">${token}</td></tr>`,
        )
        .join("");
      const html = `<table><colgroup><col class="first" style="background: #eee"><col class="second"></colgroup><tbody>${rows}</tbody></table>`;
      const split = await observe(page, html, { tableRowspan: "split" }, TALL_ROWS);
      expect(allRows(split)).toEqual(rowTokens(60));
      expect(split.colgroups.length).toBeGreaterThan(1);
      for (const group of split.colgroups) {
        expect(group).toContain('class="first"');
        expect(group).toContain("background");
        expect(group).toContain('class="second"');
        expect(group.match(/<col /g)).toHaveLength(2);
        expect(group).toContain("width");
      }

      // A colgroup with spans is left exactly as authored.
      const complex = await observe(
        page,
        html.replace('<col class="first"', '<col span="2" class="first"'),
        { tableRowspan: "split" },
        TALL_ROWS,
      );
      for (const group of complex.colgroups) expect(group).not.toContain("width");
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("rejects an unknown tableRowspan value", async ({ page }) => {
    const message = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      try {
        core.mountPageDocument(document.body, { html: "x" }, { tableRowspan: "all" as never });
        return "";
      } catch (error) {
        return `${(error as Error).name}: ${(error as Error).message}`;
      }
    });
    expect(message).toBe('TypeError: tableRowspan must be "preserve" or "split".');
    expect(await page.evaluate(() => document.querySelectorAll("iframe").length)).toBe(0);
  });

  test("keeps widths stable together with the table colgroup extension", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    try {
      const rows = rowTokens(60)
        .map(
          (token, index) =>
            `<tr><td data-col="A">${index === 0 ? "Short" : ""}</td><td data-row data-col="B">${token}</td></tr>`,
        )
        .join("");
      const widths = await page.evaluate(
        async ({ html, style }) => {
          const core = (await import(
            "/packages/core/dist/index.js"
          )) as typeof import("@imposia/core");
          const host = document.body.appendChild(document.createElement("div"));
          const controller = core.mountPageDocument(
            host,
            { html: `<table style="width: 70%"><tbody>${html}</tbody></table>` },
            {
              tableRowspan: "split",
              css: [
                `@page { size: 148mm 210mm; margin: 12mm; }
                 table { border-collapse: collapse; } td { border: 1px solid #000; padding: 2px 4px; ${style} }`,
              ],
              extensions: [core.createTableColgroupExtension()],
            },
          );
          const doc = await controller.ready;
          const frame = doc.iframe.contentDocument as Document;
          const result = [...frame.querySelectorAll("table")].map((table) => [
            table.getBoundingClientRect().width,
            ...[...(table.querySelector("tr")?.children ?? [])].map(
              (cell) => cell.getBoundingClientRect().width,
            ),
          ]);
          await controller.destroy();
          return result;
        },
        { html: rows, style: "height: 24px;" },
      );
      expect(widths.length).toBeGreaterThan(1);
      for (const piece of widths) {
        for (const [index, value] of piece.entries()) {
          expect(Math.abs(value - (widths[0]?.[index] ?? 0))).toBeLessThan(1);
        }
      }
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });
});
