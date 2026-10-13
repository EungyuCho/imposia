import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// The preview skips rendering of off-screen pages. The export must not depend on which pages
// happen to be rendered: anchors are measured on a fully rendered original, and the copy asks
// for every page to be painted.

const ROWS = Array.from(
  { length: 60 },
  (_, index) =>
    `<tr><td style="height: 40px; vertical-align: bottom; background: #def">Row ${index} bottom</td><td style="height: 40px; vertical-align: middle">Row ${index} middle</td></tr>`,
).join("");
const HTML = `<style>@page { size: 148mm 210mm; margin: 12mm; }
  table { border-collapse: collapse; width: 100%; } td { border: 1px solid #000; }
  [data-anchor] { anchor-name: --a; }
  [data-stamp] { position: absolute; position-anchor: --a; position-area: bottom span-right; }
  [data-late] { position: absolute; }</style>
  <p data-anchor>First</p><table>${ROWS}</table>
  <p data-last style="anchor-name: --last">Last page anchor</p>
  <div data-stamp-last style="position: absolute; position-anchor: --last; position-area: bottom right">stamp</div>`;

test.describe("exportPageDocumentHtml anchors and lazy rendering", () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName !== "chromium", "Uses CSS anchor positioning.");
  });

  test("measures anchors independent of scroll and leaves the preview state alone", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    await page.goto("/examples/book.html");
    const result = await page.evaluate(async (html) => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(host, { html });
      const doc = await controller.ready;
      const frame = doc.iframe.contentDocument as Document;
      const pages = [...frame.querySelectorAll<HTMLElement>("[data-imposia-page]")];
      const inline = () => pages.map((p) => p.getAttribute("style"));
      const before = inline();
      const stampOf = (markup: string) => {
        const parsed = new DOMParser().parseFromString(markup, "text/html");
        const stamp = parsed.querySelector<HTMLElement>("[data-stamp-last]");
        return {
          left: stamp?.style.left,
          top: stamp?.style.top,
          style: stamp?.getAttribute("style"),
        };
      };
      doc.iframe.scrollIntoView({ block: "start" });
      window.scrollTo(0, 0);
      const atTop = await core.exportPageDocumentHtml(doc);
      doc.iframe.scrollIntoView({ block: "end" });
      window.scrollTo(0, document.documentElement.scrollHeight);
      const atBottom = await core.exportPageDocumentHtml(doc);
      const repeat = await core.exportPageDocumentHtml(doc);
      const after = inline();
      const exported = new DOMParser().parseFromString(atTop, "text/html");
      const exportedPages = [...exported.querySelectorAll<HTMLElement>("[data-imposia-page]")];
      controller.destroy();
      const failure = await core.exportPageDocumentHtml(doc).then(
        () => "resolved",
        (error: { code?: string }) => error.code ?? "rejected",
      );
      return {
        pageCount: pages.length,
        before,
        after,
        top: stampOf(atTop),
        bottom: stampOf(atBottom),
        identical: atTop === atBottom && atTop === repeat,
        allVisible: exportedPages.every(
          (p) => p.style.getPropertyValue("content-visibility") === "visible",
        ),
        stampStyle: stampOf(atTop).style,
        failure,
      };
    }, HTML);
    expect(result.pageCount).toBeGreaterThan(3);
    expect(result.top.left).toMatch(/px$/);
    expect(result.top.top).toMatch(/px$/);
    expect(result.top).toEqual(result.bottom);
    expect(result.identical).toBe(true);
    expect(result.allVisible).toBe(true);
    expect(result.stampStyle).not.toContain("--last");
    expect(result.after).toEqual(result.before);
    expect(result.failure).toBe("DOCUMENT_UNAVAILABLE");
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("keeps table cell text painted under screen and print media", async ({ page }) => {
    await page.goto("/examples/book.html");
    const exported = await page.evaluate(async (html) => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const doc = await core.mountPageDocument(host, { html }).ready;
      return core.exportPageDocumentHtml(doc);
    }, HTML);
    for (const media of ["screen", "print"] as const) {
      await page.emulateMedia({ media });
      await page.setContent(exported);
      const state = await page.evaluate(() => {
        const pages = [...document.querySelectorAll<HTMLElement>("[data-imposia-page]")];
        const last = [...document.querySelectorAll<HTMLElement>("td")].at(-2) as HTMLElement;
        return {
          visibility: [...new Set(pages.map((p) => getComputedStyle(p).contentVisibility))],
          lastCellHeight: last.getBoundingClientRect().height,
          lastCellText: last.textContent,
        };
      });
      expect(state.visibility).toEqual(["visible"]);
      expect(state.lastCellHeight).toBeGreaterThan(0);
      expect(state.lastCellText).toBe("Row 59 bottom");
    }
  });

  test("reproduces anchored positions inside positioned parents and !important rules", async ({
    page,
  }) => {
    await page.goto("/examples/book.html");
    const html = `<style>@page { size: 148mm 210mm; margin: 12mm; }
      [data-anchor] { anchor-name: --a; margin: 0; width: 80px; height: 30px; }
      .wrap { position: relative; left: 50px; top: 100px; width: 300px; height: 200px; border: 5px solid #ccc; }
      .stamp { position: absolute; width: 40px; height: 20px; position-anchor: --a !important; position-area: bottom right !important; }
      .plain { position: absolute; width: 40px; height: 20px; position-anchor: --a; position-area: bottom span-right; margin: 7px 0 0 3px; }</style>
      <p data-anchor>Anchor</p>
      <div class="wrap"><div class="stamp" data-case="important"></div><div class="plain" data-case="plain"></div></div>`;
    const prepared = await page.evaluate(async (markup) => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const doc = await core.mountPageDocument(host, { html: markup }).ready;
      const frame = doc.iframe.contentDocument as Document;
      const offsets = Object.fromEntries(
        ["important", "plain"].map((name) => {
          const element = frame.querySelector(`[data-case="${name}"]`) as HTMLElement;
          const pageRect = (
            element.closest("[data-imposia-page]") as HTMLElement
          ).getBoundingClientRect();
          const rect = element.getBoundingClientRect();
          return [name, [rect.left - pageRect.left, rect.top - pageRect.top]];
        }),
      );
      return { offsets, exported: await core.exportPageDocumentHtml(doc) };
    }, html);
    await page.setContent(prepared.exported);
    const rendered = await page.evaluate(() =>
      Object.fromEntries(
        ["important", "plain"].map((name) => {
          const element = document.querySelector(`[data-case="${name}"]`) as HTMLElement;
          const pageRect = (
            element.closest("[data-imposia-page]") as HTMLElement
          ).getBoundingClientRect();
          const rect = element.getBoundingClientRect();
          return [name, [rect.left - pageRect.left, rect.top - pageRect.top]];
        }),
      ),
    );
    for (const name of ["important", "plain"]) {
      expect(rendered[name]?.[0]).toBeCloseTo(prepared.offsets[name]?.[0] ?? Number.NaN, 0);
      expect(rendered[name]?.[1]).toBeCloseTo(prepared.offsets[name]?.[1] ?? Number.NaN, 0);
    }
  });
});
