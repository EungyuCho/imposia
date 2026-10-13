import { expect, test } from "@playwright/test";

// The body width of a page is the sheet width minus the side margins. One table that is wider
// than the body must not widen the body for the content around it.

const SHEET_PX = (148 / 25.4) * 96;
const MARGIN_PX = (12 / 25.4) * 96;
const BODY_PX = SHEET_PX - 2 * MARGIN_PX;

const HTML = `<style>@page { size: 148mm 210mm; margin: 12mm; }
  table { border-collapse: collapse; } td { border: 1px solid #000; padding: 2px 4px; }
  .full { width: 100%; } .wide { width: 1500px; }</style>
  <table class="full" data-t="before"><tr><td>narrow before</td><td>b</td></tr></table>
  <table class="wide" data-t="wide"><tr><td>wide</td><td>wide cell</td></tr></table>
  <table class="full" data-t="after"><tr><td>narrow after</td><td>b</td></tr></table>`;

test("a wide table does not change the body width or the width of other tables", async ({
  page,
}) => {
  await page.goto("/examples/book.html");
  const widths = await page.evaluate(async (html) => {
    const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
    const host = document.body.appendChild(document.createElement("div"));
    const doc = await core.mountPageDocument(host, { html }).ready;
    const frame = doc.iframe.contentDocument as Document;
    const width = (selector: string) =>
      (frame.querySelector(selector) as HTMLElement).getBoundingClientRect().width;
    return {
      content: width("[data-imposia-page-content]"),
      before: width('[data-t="before"]'),
      after: width('[data-t="after"]'),
    };
  }, HTML);
  expect(widths.content).toBeCloseTo(BODY_PX, 0);
  expect(widths.before).toBeCloseTo(BODY_PX, 0);
  expect(widths.after).toBeCloseTo(BODY_PX, 0);
});

const WORDS = Array.from({ length: 700 }, (_, index) => `w${index}`).join(" ");

for (const mode of ["slice", "clone"] as const) {
  test(`a cell broken over pages follows box-decoration-break: ${mode}`, async ({ page }) => {
    await page.goto("/examples/book.html");
    const result = await page.evaluate(
      async ({ mode: breakMode, words }) => {
        const core = (await import(
          "/packages/core/dist/index.js"
        )) as typeof import("@imposia/core");
        const html = `<style>@page { size: 148mm 210mm; margin: 12mm; }
          table { border-collapse: separate; border-spacing: 0; width: 100%; table-layout: fixed; }
          td:empty { padding: 0; border-width: 0; }
          td { padding: 20px 6px; border: 4px solid #333; box-decoration-break: ${breakMode}; font: 14px/20px monospace; vertical-align: top; }</style>
          <table><tr><td data-long>${words}</td><td>side</td></tr></table>`;
        const host = document.body.appendChild(document.createElement("div"));
        const doc = await core.mountPageDocument(host, { html }).ready;
        const frame = doc.iframe.contentDocument as Document;
        const cells = [...frame.querySelectorAll<HTMLElement>("td")].filter(
          (cell) => cell.textContent !== "side" && cell.textContent !== "",
        );
        const edges = cells.map((cell) => {
          const style = frame.defaultView?.getComputedStyle(cell) as CSSStyleDeclaration;
          return {
            top: [style.paddingTop, style.borderTopWidth],
            bottom: [style.paddingBottom, style.borderBottomWidth],
            height: cell.getBoundingClientRect().height,
          };
        });
        const text = cells.map((cell) => cell.textContent ?? "").join(" ");
        return { edges, text: text.replace(/\s+/g, " ").trim(), expected: words };
      },
      { mode, words: WORDS },
    );
    expect(result.edges.length).toBeGreaterThan(2);
    // No text is lost or repeated at a cut.
    expect(result.text).toBe(result.expected);
    const last = result.edges.length - 1;
    for (const [index, edge] of result.edges.entries()) {
      const keepsTop = mode === "clone" || index === 0;
      const keepsBottom = mode === "clone" || index === last;
      expect(edge.top).toEqual(keepsTop ? ["20px", "4px"] : ["0px", "0px"]);
      expect(edge.bottom).toEqual(keepsBottom ? ["20px", "4px"] : ["0px", "0px"]);
    }
  });
}

test("measured column widths are taken at the body width when a wide table is nearby", async ({
  page,
}) => {
  await page.goto("/examples/book.html");
  const rows = (label: string, count: number) =>
    Array.from(
      { length: count },
      (_, index) =>
        `<tr><td rowspan="${index % 2 === 0 ? 2 : 1}" style="height: 30px">${label}${index}</td><td>cell ${label}${index}</td></tr>`,
    ).join("");
  const html = `<style>@page { size: 148mm 210mm; margin: 12mm; }
    table { border-collapse: collapse; } td { border: 1px solid #000; padding: 2px 4px; }
    .full { width: 100%; } .wide { width: 1500px; } .indent { width: calc(100% - 40px); margin-right: 40px; }</style>
    <table class="full"><tbody>${rows("a", 30)}</tbody></table>
    <table class="wide"><tbody><tr><td>wide</td><td>wide text</td></tr></tbody></table>
    <table class="indent"><tbody>${rows("c", 30)}</tbody></table>`;
  const result = await page.evaluate(async (markup) => {
    const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
    const host = document.body.appendChild(document.createElement("div"));
    const doc = await core.mountPageDocument(host, { html: markup, tableRowspan: "split" }).ready;
    const frame = doc.iframe.contentDocument as Document;
    return {
      content: (
        frame.querySelector("[data-imposia-page-content]") as HTMLElement
      ).getBoundingClientRect().width,
      tables: [...frame.querySelectorAll("table")].map((table) => ({
        width: table.getBoundingClientRect().width,
        wide: table.classList.contains("wide"),
        indent: table.classList.contains("indent"),
      })),
      text: (frame.body.textContent ?? "").replace(/\s+/g, " "),
    };
  }, html);
  for (const table of result.tables.filter((candidate) => !candidate.wide)) {
    // A width: 100% table follows the body; one that leaves a right margin keeps that margin free.
    const expected = table.indent ? BODY_PX - 40 : BODY_PX;
    expect(table.width).toBeCloseTo(expected, 0);
  }
  // Each authored cell text appears exactly once after the splitting.
  for (const label of ["a0", "a29", "c0", "c29"]) {
    expect([label, result.text.split(`cell ${label}`).length - 1]).toEqual([label, 1]);
  }
});

test("a sliced cell fills the space its removed bottom decoration frees", async ({ page }) => {
  await page.goto("/examples/book.html");
  const gaps = await page.evaluate(async (words) => {
    const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
    const html = `<style>@page { size: 148mm 210mm; margin: 12mm; }
      table { border-collapse: separate; border-spacing: 0; width: 100%; table-layout: fixed; }
      td { padding: 10px 6px 70px; border: 0; font: 14px/20px monospace; vertical-align: top; }</style>
      <table><tr><td>${words}</td><td>side</td></tr></table>`;
    const host = document.body.appendChild(document.createElement("div"));
    const doc = await core.mountPageDocument(host, { html }).ready;
    const frame = doc.iframe.contentDocument as Document;
    const cells = [...frame.querySelectorAll<HTMLElement>("td")].filter(
      (cell) => (cell.textContent ?? "").length > 100,
    );
    // Free room between a piece that continues and the bottom of the page body.
    return cells.slice(0, -1).map((cell) => {
      const pageElement = cell.closest("[data-imposia-page]") as HTMLElement;
      const content = (
        pageElement.querySelector("[data-imposia-page-content]") as Element
      ).getBoundingClientRect();
      return content.bottom - cell.getBoundingClientRect().bottom;
    });
  }, WORDS);
  expect(gaps.length).toBeGreaterThan(0);
  // Less than one line (20px) is left: the 70px of padding no longer costs any room.
  for (const gap of gaps) expect(gap).toBeLessThan(20);
});
