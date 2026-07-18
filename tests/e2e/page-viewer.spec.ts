import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("presents the real canonical iframe without taking over its lifecycle", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical page presentation is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = {
        iframe: HTMLIFrameElement;
        generation: number;
        pageCount: number;
        pages: readonly unknown[];
      };
      type CoreController = {
        ready: Promise<PageDocument>;
        update(source: { html: string }): Promise<PageDocument>;
        destroy(): Promise<void>;
      };
      type PageViewerController = {
        setZoom(value: number): void;
        setMode(value: "continuous" | "single"): void;
        refresh(pageDocument: PageDocument): void;
        print(): Promise<void>;
        destroy(): void;
        readonly state: { generation: number; pageCount: number; zoom: number; mode: string };
      };
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: { "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs" },
      });
      document.head.append(importMap);
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, never>,
        ): CoreController;
      };
      const viewerModule = (await import("/packages/viewer/dist/index.js")) as {
        mountPageViewer(container: HTMLElement, pageDocument: PageDocument): PageViewerController;
      };
      const host = document.createElement("div");
      const otherHost = document.createElement("div");
      document.body.replaceChildren(host, otherHost);
      const controller = core.mountPageDocument(
        host,
        { html: "<h1>One</h1><p>Canonical text</p>" },
        {},
      );
      const first = await controller.ready;
      const initialPage = first.iframe.contentDocument?.querySelector("[data-imposia-page]");
      const initialDimensions = initialPage?.getBoundingClientRect();
      const viewer = viewerModule.mountPageViewer(host, first);
      const presentedFrame = host.querySelector("iframe");
      const pageIdentityAfterMount =
        initialPage === first.iframe.contentDocument?.querySelector("[data-imposia-page]");
      viewer.setZoom(1.2);
      viewer.setMode("single");
      const afterPresentationDimensions = initialPage?.getBoundingClientRect();
      let framePrints = 0;
      let parentPrints = 0;
      const frameWindow = first.iframe.contentWindow;
      if (frameWindow === null) throw new Error("Missing canonical frame window.");
      frameWindow.print = () => {
        framePrints += 1;
      };
      window.print = () => {
        parentPrints += 1;
      };
      await viewer.print();
      const second = await controller.update({ html: "<h1>Two</h1><p>Updated canonical text</p>" });
      viewer.refresh(second);
      const other = core.mountPageDocument(otherHost, { html: "<p>Other</p>" }, {});
      const otherDocument = await other.ready;
      let mismatchRejected = false;
      try {
        viewer.refresh(otherDocument);
      } catch {
        mismatchRejected = true;
      }
      const beforeDestroy = viewer.state;
      viewer.destroy();
      viewer.destroy();
      const restored = host.firstElementChild === first.iframe;
      await other.destroy();
      await controller.destroy();
      return {
        iframeIdentity: presentedFrame === first.iframe,
        pageIdentityAfterMount,
        canvasCount: host.querySelectorAll("canvas").length,
        initialDimensions:
          initialDimensions === undefined
            ? undefined
            : { width: initialDimensions.width, height: initialDimensions.height },
        afterPresentationDimensions:
          afterPresentationDimensions === undefined
            ? undefined
            : {
                width: afterPresentationDimensions.width,
                height: afterPresentationDimensions.height,
              },
        state: beforeDestroy,
        framePrints,
        parentPrints,
        mismatchRejected,
        restored,
      };
    });

    expect(observation.iframeIdentity).toBe(true);
    expect(observation.pageIdentityAfterMount).toBe(true);
    expect(observation.canvasCount).toBe(0);
    expect(observation.initialDimensions).toEqual(observation.afterPresentationDimensions);
    expect(observation.state).toMatchObject({
      generation: 2,
      pageCount: 1,
      zoom: 1.2,
      mode: "single",
    });
    expect(observation.framePrints).toBe(1);
    expect(observation.parentPrints).toBe(0);
    expect(observation.mismatchRejected).toBe(true);
    expect(observation.restored).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
