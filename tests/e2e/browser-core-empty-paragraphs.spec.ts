import { expect, test } from "@playwright/test";

// Explicit blank lines and forced page breaks belong to the document. Pagination must keep
// them as authored: no blanket removal of empty paragraphs, no fixed-coordinate correction.

test("keeps explicit empty paragraphs and forced breaks where they were authored", async ({
  page,
}) => {
  await page.goto("/examples/book.html");
  const result = await page.evaluate(async () => {
    const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
    const empty = (kind: number) =>
      ["<p><br></p>", "<p>&nbsp;</p>", '<p style="height: 20px"></p>'][kind % 3];
    const html = `<style>@page { size: 148mm 210mm; margin: 12mm; } p { margin: 0 0 8px; font: 14px/20px monospace; }</style>
      <p>start</p>${empty(0)}${empty(1)}${empty(2)}<p>after blanks</p>
      <p style="break-after: page">before break</p>
      <p>second page first</p>${empty(0)}<p>second page last</p>`;
    const host = document.body.appendChild(document.createElement("div"));
    const doc = await core.mountPageDocument(host, { html }).ready;
    const frame = doc.iframe.contentDocument as Document;
    const pages = [...frame.querySelectorAll<HTMLElement>("[data-imposia-page]")];
    return {
      pageTexts: pages.map((p) =>
        [...p.querySelectorAll("p")]
          .filter((paragraph) => (paragraph.textContent ?? "").replace(/ /g, "").trim() !== "")
          .map((paragraph) => paragraph.textContent),
      ),
      emptyPerPage: pages.map(
        (p) =>
          [...p.querySelectorAll("p")].filter(
            (paragraph) => (paragraph.textContent ?? "").replace(/ /g, "").trim() === "",
          ).length,
      ),
      pageCount: pages.length,
    };
  });
  expect(result.pageCount).toBe(2);
  expect(result.pageTexts).toEqual([
    ["start", "after blanks", "before break"],
    ["second page first", "second page last"],
  ]);
  // Three blank lines before the break, one after it.
  expect(result.emptyPerPage).toEqual([3, 1]);
});
