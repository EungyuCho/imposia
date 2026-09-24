import { expect, type Page, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// ADR 0014: a table row taller than a fresh table fragment is split cell by
// cell. Rows that fit on a fresh fragment keep moving whole.

type RowObservation = Readonly<{
  pageCount: number;
  warningCodes: readonly string[];
  headerRowsPerPage: readonly number[];
  pages: readonly Readonly<{
    cells: Readonly<Record<string, readonly string[]>>;
  }>[];
  overflowingPages: readonly number[];
}>;

async function observe(page: Page, body: string): Promise<RowObservation> {
  return page.evaluate(async (html) => {
    const core = (await import("/packages/core/dist/index.js")) as {
      mountPageDocument(
        container: HTMLElement,
        source: { html: string },
      ): {
        ready: Promise<{
          iframe: HTMLIFrameElement;
          pageCount: number;
          warnings: readonly { code: string }[];
        }>;
        destroy(): Promise<void>;
      };
    };
    const host = document.body.appendChild(document.createElement("div"));
    const controller = core.mountPageDocument(host, {
      html: `
        <style>
          @page { size: 148mm 210mm; margin: 12mm; }
          body { font: 14px/20px serif; }
          table { width: 100%; border-collapse: collapse; }
          td, th { border: 1px solid #888; padding: 2px 4px; vertical-align: top; }
          p { margin: 0 0 4px; }
        </style>
        ${html}
      `,
    });
    try {
      const ready = await controller.ready;
      const frame = ready.iframe.contentDocument;
      if (frame === null) throw new Error("Missing canonical frame.");
      const pages = [...frame.querySelectorAll<HTMLElement>("[data-imposia-page]")];
      return {
        pageCount: ready.pageCount,
        warningCodes: ready.warnings.map((warning) => warning.code),
        headerRowsPerPage: pages.map((item) => item.querySelectorAll("thead tr").length),
        pages: pages.map((item) => {
          const cells: Record<string, string[]> = {};
          for (const cell of item.querySelectorAll<HTMLElement>("td[data-cell]")) {
            const name = cell.dataset.cell ?? "";
            const tokens = (cell.textContent ?? "").match(/[A-Z]+-\d+/g) ?? [];
            cells[name] = [...(cells[name] ?? []), ...tokens];
          }
          return { cells };
        }),
        overflowingPages: pages.flatMap((item, index) => {
          const flow = item.querySelector<HTMLElement>("[data-imposia-page-flow]");
          const content = item.querySelector<HTMLElement>("[data-imposia-page-content]");
          if (flow === null || content === null) return [];
          return flow.scrollHeight > content.clientHeight + 1 ? [index] : [];
        }),
      };
    } finally {
      await controller.destroy();
      host.remove();
    }
  }, body);
}

const tokens = (prefix: string, count: number) =>
  Array.from({ length: count }, (_value, index) => `${prefix}-${index + 1}`);

const flatten = (observation: RowObservation, cell: string) =>
  observation.pages.flatMap((item) => item.cells[cell] ?? []);

test("splits a row whose notes cell runs over several pages", async ({ page, browserName }) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  const notes = tokens("NOTE", 90);
  try {
    const observation = await observe(
      page,
      `
        <table>
          <thead><tr><th>Date</th><th>Notes</th><th>Amount</th></tr></thead>
          <tbody>
            <tr><td data-cell="before">BEFORE-1</td><td>Opening</td><td>1.00</td></tr>
            <tr>
              <td data-cell="date">DATE-1</td>
              <td data-cell="notes">${notes.map((token) => `<p>${token} continued remark text</p>`).join("")}</td>
              <td data-cell="amount">AMOUNT-1</td>
            </tr>
            <tr><td data-cell="after">AFTER-1</td><td>Closing</td><td>2.00</td></tr>
          </tbody>
        </table>
      `,
    );

    expect(observation.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
    expect(observation.warningCodes).not.toContain("PAGE_OVERFLOW");
    expect(observation.overflowingPages).toEqual([]);
    expect(observation.pageCount).toBeGreaterThan(2);
    // Every note appears exactly once, in order, across the split cell.
    expect(flatten(observation, "notes")).toEqual(notes);
    expect(flatten(observation, "date")).toEqual(["DATE-1"]);
    expect(flatten(observation, "amount")).toEqual(["AMOUNT-1"]);
    expect(flatten(observation, "before")).toEqual(["BEFORE-1"]);
    expect(flatten(observation, "after")).toEqual(["AFTER-1"]);
    // The row's short cells stay on its first fragment; later fragments hold
    // empty shells so the columns line up.
    const notePages = observation.pages
      .map((item, index) => ((item.cells.notes ?? []).length > 0 ? index : -1))
      .filter((index) => index >= 0);
    expect(notePages.length).toBeGreaterThan(1);
    expect(observation.pages[notePages[0] ?? -1]?.cells.date).toEqual(["DATE-1"]);
    // The row is taller than a whole page, so it starts right under the row
    // before it instead of leaving the rest of that page empty.
    const beforePage = observation.pages.findIndex((item) => (item.cells.before ?? []).length > 0);
    expect(notePages[0]).toBe(beforePage);
    for (const index of notePages.slice(1)) {
      expect(observation.pages[index]?.cells.date ?? []).toEqual([]);
      expect(observation.headerRowsPerPage[index]).toBe(1);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("splits two overflowing cells of different lengths and relaxes break-inside: avoid", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  const long = tokens("LONG", 120);
  const text = tokens("TEXT", 160);
  try {
    const observation = await observe(
      page,
      `
        <table>
          <tbody>
            <tr style="break-inside: avoid">
              <td data-cell="long">${long.map((token) => `<p>${token} paragraph</p>`).join("")}</td>
              <td data-cell="text">${text.join(" ")}</td>
            </tr>
          </tbody>
        </table>
      `,
    );

    expect(observation.warningCodes).not.toContain("UNSUPPORTED_LAYOUT");
    // The row cannot avoid a break it is taller than; the relaxation is reported.
    expect(observation.warningCodes).toContain("AVOID_RELAXED");
    expect(observation.overflowingPages).toEqual([]);
    expect(flatten(observation, "long")).toEqual(long);
    expect(flatten(observation, "text")).toEqual(text);
    const lastPageWith = (cell: string) =>
      observation.pages.reduce(
        (last, item, index) => ((item.cells[cell] ?? []).length > 0 ? index : last),
        -1,
      );
    expect(lastPageWith("long")).not.toBe(lastPageWith("text"));
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps a tall rowspan cluster atomic with a located warning", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium owns structural pagination assertions.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await observe(
      page,
      `
        <table>
          <tbody>
            <tr>
              <td data-cell="span" rowspan="2">${tokens("SPAN", 80)
                .map((token) => `<p>${token}</p>`)
                .join("")}</td>
              <td data-cell="top">TOP-1</td>
            </tr>
            <tr><td data-cell="bottom">BOTTOM-1</td></tr>
          </tbody>
        </table>
      `,
    );

    expect(observation.warningCodes).toContain("UNSUPPORTED_LAYOUT");
    expect(observation.warningCodes).toContain("PAGE_OVERFLOW");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("moves a row that fits on a fresh fragment whole instead of splitting it", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium owns structural pagination assertions.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  const lead = tokens("LEAD", 20);
  const block = tokens("BLOCK", 18);
  try {
    const observation = await observe(
      page,
      `
        <table>
          <tbody>
            <tr><td data-cell="lead">${lead.map((token) => `<p>${token}</p>`).join("")}</td></tr>
            <tr><td data-cell="block">${block.map((token) => `<p>${token}</p>`).join("")}</td></tr>
          </tbody>
        </table>
      `,
    );

    expect(observation.warningCodes).toEqual([]);
    const blockPages = observation.pages
      .map((item, index) => ((item.cells.block ?? []).length > 0 ? index : -1))
      .filter((index) => index >= 0);
    expect(blockPages).toEqual([1]);
    expect(flatten(observation, "block")).toEqual(block);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
