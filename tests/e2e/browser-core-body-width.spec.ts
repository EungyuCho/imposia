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
  for (const order of ["long-short", "short-long"] as const) {
    test(`row pieces follow box-decoration-break: ${mode}, ${order}`, async ({ page }) => {
      await page.goto("/examples/book.html");
      const result = await page.evaluate(
        async ({ mode: breakMode, order: cellOrder, words }) => {
          const core = (await import(
            "/packages/core/dist/index.js"
          )) as typeof import("@imposia/core");
          const long = `<td data-long><p style="margin: 0">${words}</p></td>`;
          const short = "<td data-short>short</td>";
          // An author rule for empty cells must not decide what a continuation piece draws.
          const emptyRule =
            breakMode === "slice" ? "td:empty { padding: 0; border-width: 0; }" : "";
          const html = `<style>@page { size: 148mm 210mm; margin: 12mm; }
            table { border-collapse: separate; border-spacing: 0; width: 100%; table-layout: fixed; }
            ${emptyRule}
            td { padding: 20px 6px; border: 4px solid #333; -webkit-box-decoration-break: ${breakMode}; box-decoration-break: ${breakMode}; font: 14px/20px monospace; vertical-align: top; }</style>
            <table><tr>${cellOrder === "long-short" ? long + short : short + long}</tr></table>`;
          const host = document.body.appendChild(document.createElement("div"));
          const doc = await core.mountPageDocument(host, { html }).ready;
          const frame = doc.iframe.contentDocument as Document;
          const pageRows = [...frame.querySelectorAll("[data-imposia-page] tr")];
          const pieces = pageRows.map((row) =>
            [...row.children].map((cell) => {
              const style = frame.defaultView?.getComputedStyle(cell) as CSSStyleDeclaration;
              return {
                kind: cell.hasAttribute("data-long")
                  ? "long"
                  : cell.hasAttribute("data-short")
                    ? "short"
                    : "continuation",
                text: (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
                decorationMode:
                  style.getPropertyValue("box-decoration-break") ||
                  style.getPropertyValue("-webkit-box-decoration-break"),
                top: [style.paddingTop, style.borderTopWidth],
                bottom: [style.paddingBottom, style.borderBottomWidth],
                bottomEdge: cell.getBoundingClientRect().bottom,
              };
            }),
          );
          const bottoms = pageRows.map(
            (row) =>
              (
                (row.closest("[data-imposia-page]") as Element).querySelector(
                  "[data-imposia-page-content]",
                ) as Element
              ).getBoundingClientRect().bottom,
          );
          return { pieces, pageBottom: bottoms.at(-1) ?? 0, words };
        },
        { mode, order, words: WORDS },
      );
      const { pieces } = result;
      expect(pieces.length).toBeGreaterThan(2);
      // Text is neither lost nor repeated at a cut.
      const joined = pieces.flatMap((piece) => piece.map((cell) => cell.text)).filter(Boolean);
      expect(joined.join(" ").replace("short", "").replace(/\s+/g, " ").trim()).toBe(result.words);
      expect(joined.filter((text) => text === "short")).toHaveLength(1);
      const last = pieces.length - 1;
      for (const [index, piece] of pieces.entries()) {
        expect(piece).toHaveLength(2);
        for (const cell of piece) {
          expect(cell.decorationMode).toBe(mode);
          // slice: top decoration on the first piece, bottom decoration on the last one,
          // for every cell of the row, the emptied continuation of a short cell included.
          const keepsTop = mode === "clone" || index === 0;
          const keepsBottom = mode === "clone" || index === last;
          expect(cell.top, `top of piece ${index} (${cell.kind})`).toEqual(
            keepsTop ? ["20px", "4px"] : ["0px", "0px"],
          );
          expect(cell.bottom, `bottom of piece ${index} (${cell.kind})`).toEqual(
            keepsBottom ? ["20px", "4px"] : ["0px", "0px"],
          );
        }
      }
      // Putting the bottom decoration back must not push the last piece past the body.
      for (const cell of pieces[last] ?? [])
        expect(cell.bottomEdge).toBeLessThanOrEqual(result.pageBottom + 1);
    });
  }
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

test("restoring the bottom decoration never leaves the last piece past the body", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/examples/book.html");
  // Sweeps the length of the long second column so that, for some lengths, the content of the
  // last piece fits and only the bottom padding put back on it makes the page overflow. The
  // first column is short, so its last piece is empty and cannot be the one that is cut.
  const result = await page.evaluate(async () => {
    const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
    const outcomes: { words: number; over: number; kept: boolean; lost: boolean }[] = [];
    // Comments and whitespace after the last block must neither fail the page nor hide it.
    const suffixes = ["", "<!-- note -->", "\n   \n", " <!-- note -->\n  "];
    for (let words = 700; words < 1000; words += 6) {
      const suffix = suffixes[outcomes.length % suffixes.length] ?? "";
      const text = Array.from({ length: words }, (_, index) => `w${index}`).join(" ");
      const html = `<style>@page { size: 148mm 210mm; margin: 12mm; }
        table { border-collapse: separate; border-spacing: 0; width: 100%; table-layout: fixed; }
        td { padding: 10px 6px 70px; border: 0; font: 14px/20px monospace; vertical-align: top; }</style>
        <table><tr><td>short</td><td><p style="margin: 0">${text}</p>${suffix}</td></tr></table>`;
      const host = document.body.appendChild(document.createElement("div"));
      const doc = await core.mountPageDocument(host, { html }).ready;
      const frame = doc.iframe.contentDocument as Document;
      const rows = [...frame.querySelectorAll("[data-imposia-page] tr")];
      const lastRow = rows.at(-1) as Element;
      const body = (lastRow.closest("[data-imposia-page]") as Element)
        .querySelector("[data-imposia-page-content]")
        ?.getBoundingClientRect().bottom as number;
      const bottoms = [...lastRow.children].map((cell) => cell.getBoundingClientRect().bottom);
      const joined = rows.map((row) => row.children[1]?.textContent ?? "").join(" ");
      outcomes.push({
        words,
        over: Math.max(...bottoms) - body,
        kept: getComputedStyle(lastRow.children[1] as Element).paddingBottom === "70px",
        lost: joined.replace(/\s+/g, " ").trim() !== text,
      });
      host.remove();
    }
    return outcomes;
  });
  for (const outcome of result) {
    expect(outcome.lost, `${outcome.words} words lose or repeat text`).toBe(false);
    expect(outcome.kept, `${outcome.words} words lose the bottom padding`).toBe(true);
    expect(outcome.over, `${outcome.words} words overflow the body`).toBeLessThanOrEqual(1);
  }
});
