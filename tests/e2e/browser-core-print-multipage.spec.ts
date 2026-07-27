import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("prints every composed page when caller CSS constrains html and body", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium exposes page.pdf for the print artifact probe.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const composed = await page.evaluate(async () => {
      type PageDocument = Readonly<{ pageCount: number }>;
      type Controller = {
        readonly ready: Promise<PageDocument>;
        print(): Promise<void>;
        destroy(): Promise<void>;
      };
      type Core = {
        mountPageDocument(
          host: HTMLElement,
          source: { readonly html: string },
          options: {
            readonly css: readonly string[];
            readonly page: {
              readonly size: { readonly width: string; readonly height: string };
              readonly margin: string;
            };
          },
        ): Controller;
      };

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.createElement("div");
      host.dataset.printMultipageHost = "";
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(
        host,
        {
          html: `
            <section><h1>First sheet</h1><p>Committed print content one.</p></section>
            <section><h1>Second sheet</h1><p>Committed print content two.</p></section>
            <section><h1>Third sheet</h1><p>Committed print content three.</p></section>
          `,
        },
        {
          css: [
            `
              html, body { height: 100vh; overflow: hidden; }
              section + section { break-before: page; }
            `,
          ],
          page: {
            size: { width: "240px", height: "300px" },
            margin: "20px",
          },
        },
      );
      const originalPrint = window.print;
      Reflect.set(globalThis, "__imposiaPrintMultipageController", controller);
      Reflect.set(globalThis, "__imposiaPrintMultipageOriginalPrint", originalPrint);
      Object.defineProperty(window, "print", {
        configurable: true,
        writable: true,
        value: () => undefined,
      });
      const ready = await controller.ready;
      await controller.print();
      return ready.pageCount;
    });

    expect(composed).toBeGreaterThan(1);
    const pdfBytes = await page.pdf({
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfData = new Uint8Array(pdfBytes.byteLength);
    pdfData.set(pdfBytes);
    const pdf = await getDocument({ data: pdfData }).promise;
    const printed = pdf.numPages;
    await pdf.destroy();

    expect(printed).toBe(composed);
  } finally {
    await page.evaluate(async () => {
      type Controller = { destroy(): Promise<void> };
      const controller = Reflect.get(globalThis, "__imposiaPrintMultipageController") as
        | Controller
        | undefined;
      const originalPrint = Reflect.get(globalThis, "__imposiaPrintMultipageOriginalPrint") as
        | Window["print"]
        | undefined;
      window.dispatchEvent(new Event("afterprint"));
      if (originalPrint !== undefined) {
        Object.defineProperty(window, "print", {
          configurable: true,
          writable: true,
          value: originalPrint,
        });
      }
      await controller?.destroy();
      document.querySelector<HTMLElement>("[data-print-multipage-host]")?.remove();
      Reflect.deleteProperty(globalThis, "__imposiaPrintMultipageController");
      Reflect.deleteProperty(globalThis, "__imposiaPrintMultipageOriginalPrint");
    });
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
