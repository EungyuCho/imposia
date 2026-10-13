import { chromium, expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// A renderer with a lower device pixel ratio rounds a 1px border up to a whole device pixel,
// which thickens the cell border, narrows the content box, and wraps text that just fit.
// `targetDevicePixelRatio` widens the border in the exported copy and gives the padding back.

const TARGET_RATIO = 0.5;
// Six fixed-width boxes break between each other like words, but their widths do not depend on
// how a renderer rounds glyph advances, so only the border thickness can change the wrapping.
const BOX_WIDTH = 20;
const CONTENT = Array.from(
  { length: 6 },
  () =>
    `<span style="display: inline-block; width: ${BOX_WIDTH}px; height: 20px; vertical-align: top"></span>`,
).join("");
const FONT = "14px/20px monospace";

test.describe("HTML export targetDevicePixelRatio", () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName !== "chromium", "Renders the export at a fractional device pixel ratio.");
  });

  test("keeps line breaks and heights at the target ratio and leaves the preview alone", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    await page.goto("/examples/book.html");
    // Context-level emulation leaves layout untouched; the launch flag makes the renderer
    // round borders the way a real low-ratio engine does.
    const renderer = await chromium.launch({
      args: [`--force-device-scale-factor=${TARGET_RATIO}`],
    });
    try {
      const rendered = await (
        await renderer.newContext({ viewport: null, deviceScaleFactor: undefined })
      ).newPage();
      expect(await rendered.evaluate(() => window.devicePixelRatio)).toBe(TARGET_RATIO);
      const prepared = await page.evaluate(
        async ({ ratio, text, font }) => {
          const core = (await import(
            "/packages/core/dist/index.js"
          )) as typeof import("@imposia/core");
          const markup = (width: number) =>
            `<style>table { border-collapse: collapse; table-layout: fixed; width: ${width}px; }
              td { border: 1px solid #000; padding: 2px 4px; font: ${font}; vertical-align: top; }</style>
              <table><tr><td>x</td><td data-wide>${text}</td><td>y</td></tr></table>`;
          // Smallest table width at which the interior cell still fits on one line here, so the
          // 1px the thicker border takes from that cell is enough to wrap it.
          const probeHost = document.body.appendChild(document.createElement("div"));
          let width = 200;
          for (; width < 460; width += 0.25) {
            probeHost.innerHTML = markup(width);
            const wide = probeHost.querySelector("[data-wide]") as HTMLElement;
            if (wide.getBoundingClientRect().height < 30) break;
          }
          // Three equal columns: 2.7px of table width is 0.9px of slack in the cell. The thicker
          // border takes about 1.3px of that cell's content (1px of border, a third of a pixel
          // of the table's own width), the padding returns more than 1px.
          width += 2.7;
          probeHost.remove();
          const host = document.body.appendChild(document.createElement("div"));
          const controller = core.mountPageDocument(host, {
            html: `<style>@page { size: 148mm 210mm; margin: 12mm; }</style>${markup(width)}`,
          });
          const doc = await controller.ready;
          const frame = doc.iframe.contentDocument as Document;
          const cell = frame.querySelector("[data-wide]") as HTMLElement;
          const before = frame.documentElement.outerHTML;
          const sourceHeight = cell.getBoundingClientRect().height;
          const plain = await core.exportPageDocumentHtml(doc);
          const adjusted = await core.exportPageDocumentHtml(doc, {
            targetDevicePixelRatio: ratio,
          });
          const after = frame.documentElement.outerHTML;
          const rejected: string[] = [];
          for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "2" as never]) {
            await core
              .exportPageDocumentHtml(doc, { targetDevicePixelRatio: value })
              .catch((error: Error) => rejected.push(error.name));
          }
          await controller.destroy();
          return { plain, adjusted, sourceHeight, previewUnchanged: before === after, rejected };
        },
        { ratio: TARGET_RATIO, text: CONTENT, font: FONT },
      );

      expect(prepared.previewUnchanged).toBe(true);
      expect(prepared.rejected).toEqual(Array(5).fill("TypeError"));
      expect(prepared.plain).not.toMatch(/<td[^>]*style=/);
      expect(prepared.adjusted).toMatch(/<td[^>]*border-width:\s*2px\s*!important/);

      const heightOf = async (html: string) => {
        await rendered.setContent(html);
        return rendered.evaluate(() => {
          return document.querySelector("[data-wide]")?.getBoundingClientRect().height ?? 0;
        });
      };
      const plainHeight = await heightOf(prepared.plain);
      const adjustedHeight = await heightOf(prepared.adjusted);
      // The unadjusted export wraps the text at the thicker border; the adjusted one does not.
      expect(plainHeight).toBeGreaterThan(prepared.sourceHeight + 10);
      expect(adjustedHeight).toBeLessThanOrEqual(prepared.sourceHeight + 2);
    } finally {
      await renderer.close();
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });

  test("skips sides without padding to give up, zero borders, and leaves the default export alone", async ({
    page,
  }) => {
    await page.goto("/examples/book.html");
    const result = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(host, {
        html: `<table style="border-collapse: separate; border-spacing: 0">
          <tr>
            <td id="tight" style="border: 1px solid #000; padding: 0.5px">a</td>
            <td id="none" style="border: 0; padding: 4px">b</td>
            <td id="roomy" style="border: 1px solid #000; padding: 4px">c</td>
          </tr></table>`,
      });
      const doc = await controller.ready;
      const adjusted = await core.exportPageDocumentHtml(doc, { targetDevicePixelRatio: 0.5 });
      const plain = await core.exportPageDocumentHtml(doc);
      const defaulted = await core.exportPageDocumentHtml(doc, {});
      await controller.destroy();
      const cell = (html: string, id: string) =>
        new DOMParser()
          .parseFromString(html, "text/html")
          .getElementById(id)
          ?.getAttribute("style");
      return {
        tight: cell(adjusted, "tight"),
        none: cell(adjusted, "none"),
        roomy: cell(adjusted, "roomy"),
        same: plain === defaulted,
      };
    });
    // Separate borders: the whole extra pixel comes out of padding, which only the roomy cell has.
    expect(result.tight).not.toContain("!important");
    expect(result.none).not.toContain("!important");
    expect(result.roomy).toContain("border-width: 2px !important");
    expect(result.roomy).toContain("padding: 3px 2.98438px !important");
    expect(result.same).toBe(true);
  });

  test("leaves collapsed edges shared by cells of different widths as authored", async ({
    page,
  }) => {
    await page.goto("/examples/book.html");
    const styles = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(host, {
        html: `<table style="border-collapse: collapse"><tr>
            <td id="thin" style="border: 1px solid #000; padding: 4px">a</td>
            <td id="thick" style="border: 3px solid #000; padding: 4px">b</td>
            <td id="same" style="border: 3px solid #000; padding: 4px">c</td>
          </tr></table>`,
      });
      const doc = await controller.ready;
      const html = await core.exportPageDocumentHtml(doc, { targetDevicePixelRatio: 0.5 });
      await controller.destroy();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const read = (id: string) => parsed.getElementById(id)?.getAttribute("style") ?? "";
      return { thin: read("thin"), thick: read("thick"), same: read("same") };
    });
    // thin | thick share an edge declared 1px and 3px, so neither of those sides moves.
    expect(styles.thin).not.toContain("border-right-width");
    expect(styles.thick).not.toContain("border-left-width");
    expect(styles.thin).toContain("border-left-width");
    // thick | same share a uniform 3px edge and stay corrected.
    expect(styles.thick).toContain("border-right-width");
    // All four sides of that cell are corrected, which the style serializer writes as a shorthand.
    expect(styles.same).toContain("border-width: 2px !important");
  });

  test("rounds wider borders down like the renderer and gives the padding back", async ({
    page,
  }) => {
    await page.goto("/examples/book.html");
    const style = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(host, {
        html: `<table style="border-collapse: collapse"><tr>
            <td id="wide" style="border: 3px solid #000; padding: 4px">a</td>
            <td style="border: 3px solid #000; padding: 4px">b</td>
          </tr></table>`,
      });
      const doc = await controller.ready;
      const html = await core.exportPageDocumentHtml(doc, { targetDevicePixelRatio: 0.5 });
      await controller.destroy();
      return (
        new DOMParser()
          .parseFromString(html, "text/html")
          .getElementById("wide")
          ?.getAttribute("style") ?? ""
      );
    });
    // A renderer at ratio 0.5 draws a 3px border as one device pixel (2 CSS px), so the border
    // is written as 2px and the padding grows by half the difference to keep the content box.
    expect(style).toContain("border-width: 2px !important");
    expect(style).toContain("padding: 4.5px 4.48438px !important");
  });
});
