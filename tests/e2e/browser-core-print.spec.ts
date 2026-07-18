import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("canonical page document CSS produces exactly one A4 sheet", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium exposes page.pdf for the print artifact probe.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const canonical = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, never>,
        ): {
          ready: Promise<{ iframe: HTMLIFrameElement }>;
          destroy(): Promise<void>;
        };
      };
      const host = document.createElement("div");
      host.style.cssText = "width:210mm;height:297mm;margin:0;padding:0";
      document.body.style.cssText = "margin:0;padding:0";
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(
        host,
        { html: "<h1>Canonical print page</h1>" },
        {},
      );
      Object.defineProperty(window, "__imposiaBrowserCoreController", {
        configurable: true,
        value: controller,
      });
      const ready = await controller.ready;
      ready.iframe.style.cssText = "display:block;width:210mm;height:297mm;border:0";
      const frameDocument = ready.iframe.contentDocument;
      if (frameDocument === null) throw new Error("Missing canonical frame document.");
      const pageElement = frameDocument.querySelector<HTMLElement>("[data-imposia-page]");
      const styles = frameDocument.defaultView?.getComputedStyle(frameDocument.body);
      return {
        printMedia: frameDocument.defaultView?.matchMedia("print").matches ?? false,
        bodyDisplay: styles?.display,
        bodyPadding: styles?.padding,
        bodyGap: styles?.gap,
        bodyBackground: styles?.backgroundColor,
        pageWidth: pageElement
          ? frameDocument.defaultView?.getComputedStyle(pageElement).width
          : "",
        pageHeight: pageElement
          ? frameDocument.defaultView?.getComputedStyle(pageElement).height
          : "",
        canonicalMarkup: frameDocument.documentElement.outerHTML,
      };
    });
    await page.emulateMedia({ media: "print" });
    const printStyles = await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>("iframe[data-imposia-frame]");
      const frameDocument = iframe?.contentDocument;
      const pageElement = frameDocument?.querySelector<HTMLElement>("[data-imposia-page]");
      const bodyStyle = frameDocument
        ? frameDocument.defaultView?.getComputedStyle(frameDocument.body)
        : null;
      const pageStyle = pageElement
        ? frameDocument?.defaultView?.getComputedStyle(pageElement)
        : null;
      return {
        printMedia: frameDocument?.defaultView?.matchMedia("print").matches ?? false,
        bodyDisplay: bodyStyle?.display,
        bodyPadding: bodyStyle?.padding,
        bodyGap: bodyStyle?.gap,
        bodyBackground: bodyStyle?.backgroundColor,
        pageWidth: pageStyle?.width,
        pageHeight: pageStyle?.height,
      };
    });
    const printPage = await page.context().newPage();
    let pdfBytes: Buffer;
    try {
      await printPage.setContent(`<!doctype html>${canonical.canonicalMarkup}`);
      await printPage.emulateMedia({ media: "print" });
      pdfBytes = await printPage.pdf({
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true,
      });
    } finally {
      await printPage.close();
    }
    const artifactPath = path.resolve(".omo/evidence/browser-core-canonical-print.pdf");
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, pdfBytes);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfData = new Uint8Array(pdfBytes.byteLength);
    pdfData.set(pdfBytes);
    const pdf = await getDocument({ data: pdfData }).promise;
    const pageCount = pdf.numPages;
    const firstPdfPage = await pdf.getPage(1);
    const firstPageViewport = firstPdfPage.getViewport({ scale: 1 });
    const pdfPageBox = {
      width: firstPageViewport.width,
      height: firstPageViewport.height,
    };
    await pdf.destroy();
    expect(printStyles).toMatchObject({
      printMedia: true,
      bodyDisplay: "block",
      bodyPadding: "0px",
      bodyGap: "0px",
      bodyBackground: "rgb(255, 255, 255)",
      pageHeight: "1122.52px",
    });
    expect(Number.parseFloat(printStyles.pageWidth ?? "0")).toBeCloseTo(793.7, 1);
    expect(pageCount).toBe(1);
    expect(Math.abs(pdfPageBox.width - 595.28)).toBeLessThan(2);
    expect(Math.abs(pdfPageBox.height - 841.89)).toBeLessThan(2);
  } finally {
    await page.evaluate(async () => {
      const pageWindow = window as Window & {
        __imposiaBrowserCoreController?: { destroy(): Promise<void> };
      };
      await pageWindow.__imposiaBrowserCoreController?.destroy();
      delete pageWindow.__imposiaBrowserCoreController;
    });
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
