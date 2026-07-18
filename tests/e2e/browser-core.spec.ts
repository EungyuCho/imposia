import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const CSS_PX_PER_MM = 96 / 25.4;
const A4_WIDTH_CSS_PX = 210 * CSS_PX_PER_MM;
const A4_HEIGHT_CSS_PX = 297 * CSS_PX_PER_MM;
const CSS_LAYOUT_UNIT_CSS_PX = 1 / 64;

test("mounts the browser-core canonical page document", async ({ page, browserName }) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type PageMetadata = {
        number: number;
        side: "left" | "right";
        blank: boolean;
        bodyText: readonly string[];
      };
      type PageDocument = {
        iframe: HTMLIFrameElement;
        generation: number;
        pageCount: number;
        pages: readonly PageMetadata[];
      };
      type PageDocumentController = {
        ready: Promise<PageDocument>;
        current: PageDocument | undefined;
        update(source: { html: string }): Promise<PageDocument>;
        destroy(): Promise<void>;
      };

      const host = document.createElement("div");
      host.id = "browser-core-host";
      document.body.replaceChildren(host);
      let controller: PageDocumentController | undefined;

      try {
        const modulePath = "/packages/core/dist/index.js";
        const core = (await import(modulePath)) as {
          mountPageDocument(
            container: HTMLElement,
            source: { html: string },
            options: Record<string, never>,
          ): PageDocumentController;
        };
        controller = core.mountPageDocument(
          host,
          { html: "<article><h1>Hello</h1><p>Browser page DOM</p></article>" },
          {},
        );
        const ready = await controller.ready;
        const iframe = ready.iframe;
        const frameDocument = iframe.contentDocument;
        if (frameDocument === null)
          throw new Error("The page document iframe has no content document.");

        const pageElement = frameDocument.querySelector<HTMLElement>("[data-imposia-page]");
        const headerElement = frameDocument.querySelector("[data-imposia-page-header]");
        const contentElement = frameDocument.querySelector("[data-imposia-page-content]");
        const flowElement = frameDocument.querySelector("[data-imposia-page-flow]");
        const footerElement = frameDocument.querySelector("[data-imposia-page-footer]");
        const sourceText = "Browser page DOM";
        const sourceTextCount = (frameDocument.body.textContent ?? "").split(sourceText).length - 1;
        const firstPage = ready.pages[0];
        if (firstPage === undefined)
          throw new Error("The page document has no first page metadata.");

        const sameController = controller.current === ready;
        await controller.destroy();
        const afterDestroy = {
          hostChildCount: host.childElementCount,
          currentUndefined: controller.current === undefined,
        };
        await controller.destroy();
        const afterSecondDestroy = {
          hostChildCount: host.childElementCount,
          currentUndefined: controller.current === undefined,
        };
        let updateRejected = false;
        try {
          await controller.update({ html: "<p>after destroy</p>" });
        } catch {
          updateRejected = true;
        }

        return {
          sandbox: iframe.getAttribute("sandbox"),
          sameController,
          generation: ready.generation,
          pageCount: ready.pageCount,
          pageLength: ready.pages.length,
          firstPage: {
            number: firstPage.number,
            side: firstPage.side,
            blank: firstPage.blank,
            bodyText: [...firstPage.bodyText],
          },
          markers: {
            document: frameDocument.documentElement.getAttribute("data-imposia-document"),
            body: frameDocument.body.hasAttribute("data-imposia-pages"),
            page: pageElement?.hasAttribute("data-imposia-page") ?? false,
            pageNumber: pageElement?.getAttribute("data-imposia-page-number"),
            pageSide: pageElement?.getAttribute("data-imposia-page-side"),
            blank: pageElement?.getAttribute("data-imposia-blank"),
            header: headerElement !== null,
            content: contentElement !== null,
            flow: flowElement !== null,
            footer: footerElement !== null,
          },
          sourceTextCount,
          afterDestroy,
          afterSecondDestroy,
          updateRejected,
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.sandbox).toBe("allow-same-origin");
    expect(observation.sameController).toBe(true);
    expect(observation.generation).toBe(1);
    expect(observation.pageCount).toBe(1);
    expect(observation.pageLength).toBe(1);
    expect(observation.firstPage).toMatchObject({
      number: 1,
      side: "right",
      blank: false,
    });
    expect(observation.firstPage.bodyText).toContain("Browser page DOM");
    expect(observation.markers).toEqual({
      document: "v1",
      body: true,
      page: true,
      pageNumber: "1",
      pageSide: "right",
      blank: "false",
      header: true,
      content: true,
      flow: true,
      footer: true,
    });
    expect(observation.sourceTextCount).toBe(1);
    expect(observation.afterDestroy).toEqual({ hostChildCount: 0, currentUndefined: true });
    expect(observation.afterSecondDestroy).toEqual({ hostChildCount: 0, currentUndefined: true });
    expect(observation.updateRejected).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("publishes normalized page metadata aligned with the canonical page element", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      let controller:
        | {
            ready: Promise<{
              iframe: HTMLIFrameElement;
              pages: readonly [
                {
                  widthCssPx: number;
                  heightCssPx: number;
                  geometry: { sheetWidthCssPx: number; sheetHeightCssPx: number };
                },
              ];
              timings: { paginationMs: number };
            }>;
            destroy(): Promise<void>;
          }
        | undefined;
      const originalParseFromString = DOMParser.prototype.parseFromString;
      try {
        const core = (await import("/packages/core/dist/index.js")) as {
          mountPageDocument(
            container: HTMLElement,
            source: { html: string },
            options: { css: readonly string[] },
          ): typeof controller;
        };
        const parseDelayMs = 25;
        DOMParser.prototype.parseFromString = function (...args) {
          const delayUntil = performance.now() + parseDelayMs;
          while (performance.now() < delayUntil) {}
          return originalParseFromString.apply(this, args);
        };
        controller = core.mountPageDocument(
          host,
          { html: "<p>Measured page</p>" },
          { css: ["[data-imposia-page]{width:100px;height:200px}"] },
        );
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const pageElement = frameDocument.querySelector<HTMLElement>("[data-imposia-page]");
        if (pageElement === null) throw new Error("Missing canonical page element.");
        const rect = pageElement.getBoundingClientRect();
        const metadata = ready.pages[0];
        if (metadata === undefined) throw new Error("Missing page metadata.");
        return {
          metadata: {
            width: metadata.widthCssPx,
            height: metadata.heightCssPx,
            geometry: {
              width: metadata.geometry.sheetWidthCssPx,
              height: metadata.geometry.sheetHeightCssPx,
            },
          },
          rect: { width: rect.width, height: rect.height },
          paginationMs: ready.timings.paginationMs,
          parseDelayMs,
        };
      } finally {
        DOMParser.prototype.parseFromString = originalParseFromString;
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.metadata.width).toBe(observation.metadata.geometry.width);
    expect(observation.metadata.height).toBe(observation.metadata.geometry.height);
    expect(observation.metadata.geometry.width).toBe(A4_WIDTH_CSS_PX);
    expect(observation.metadata.geometry.height).toBe(A4_HEIGHT_CSS_PX);
    expect(Math.abs(observation.metadata.width - observation.rect.width)).toBeLessThanOrEqual(
      CSS_LAYOUT_UNIT_CSS_PX,
    );
    expect(Math.abs(observation.metadata.height - observation.rect.height)).toBeLessThanOrEqual(
      CSS_LAYOUT_UNIT_CSS_PX,
    );
    expect(observation.rect.width).toBeGreaterThan(0);
    expect(Math.abs(observation.rect.width - A4_WIDTH_CSS_PX)).toBeLessThanOrEqual(
      CSS_LAYOUT_UNIT_CSS_PX,
    );
    expect(observation.rect.height).toBeGreaterThan(0);
    expect(Math.abs(observation.rect.height - A4_HEIGHT_CSS_PX)).toBeLessThanOrEqual(
      CSS_LAYOUT_UNIT_CSS_PX,
    );
    expect(observation.paginationMs).toBeGreaterThanOrEqual(observation.parseDelayMs);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
