import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("presents the real canonical iframe without taking over its lifecycle", async ({
  page,
  browserName,
}) => {
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
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const core = (await import("@imposia/core")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, never>,
        ): CoreController;
        hasPageDocumentFrameSandbox(iframe: HTMLIFrameElement): boolean;
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
      const canonicalSandbox = core.hasPageDocumentFrameSandbox(first.iframe);
      const initialPage = first.iframe.contentDocument?.querySelector("[data-imposia-page]");
      const initialDimensions = initialPage?.getBoundingClientRect();
      host.setAttribute("role", "application");
      host.setAttribute("aria-label", "Original host label");
      host.setAttribute("tabindex", "7");
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
      const restoredAttributes = {
        role: host.getAttribute("role"),
        label: host.getAttribute("aria-label"),
        tabindex: host.getAttribute("tabindex"),
      };
      const originalSandbox = first.iframe.getAttribute("sandbox");
      first.iframe.setAttribute("sandbox", "allow-same-origin");
      let invalidSandboxRejected = false;
      try {
        viewerModule.mountPageViewer(host, first);
      } catch {
        invalidSandboxRejected = true;
      }
      const rejectedMountAttributes = {
        role: host.getAttribute("role"),
        label: host.getAttribute("aria-label"),
        tabindex: host.getAttribute("tabindex"),
      };
      if (originalSandbox === null) first.iframe.removeAttribute("sandbox");
      else first.iframe.setAttribute("sandbox", originalSandbox);
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
        restoredAttributes,
        canonicalSandbox,
        invalidSandboxRejected,
        rejectedMountAttributes,
      };
    });

    expect(observation.iframeIdentity).toBe(true);
    expect(observation.pageIdentityAfterMount).toBe(true);
    expect(observation.canvasCount).toBe(0);
    if (browserName === "chromium") {
      expect(observation.initialDimensions).toEqual(observation.afterPresentationDimensions);
    }
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
    expect(observation.restoredAttributes).toEqual({
      role: "application",
      label: "Original host label",
      tabindex: "7",
    });
    expect(observation.canonicalSandbox).toBe(true);
    expect(observation.invalidSandboxRejected).toBe(true);
    expect(observation.rejectedMountAttributes).toEqual({
      role: "application",
      label: "Original host label",
      tabindex: "7",
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("scopes runtime theme tokens to one page viewer and restores host styles", async ({
  page,
  browserName,
}) => {
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
        destroy(): Promise<void>;
      };
      type Theme = Readonly<Record<`--imposia-viewer-${string}`, string>>;
      type PageViewerController = {
        setTheme(theme?: Theme): void;
        destroy(): void;
      };
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const core = (await import("@imposia/core")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, never>,
        ): CoreController;
      };
      const viewerModule = (await import("/packages/viewer/dist/index.js")) as {
        mountPageViewer(
          container: HTMLElement,
          pageDocument: PageDocument,
          options: { theme?: Theme },
        ): PageViewerController;
      };
      const themedHost = document.createElement("div");
      const plainHost = document.createElement("div");
      themedHost.style.setProperty("--imposia-viewer-color-accent", "original-accent");
      document.body.replaceChildren(themedHost, plainHost);
      const themedCore = core.mountPageDocument(themedHost, { html: "<p>Themed</p>" }, {});
      const plainCore = core.mountPageDocument(plainHost, { html: "<p>Plain</p>" }, {});
      const [themedDocument, plainDocument] = await Promise.all([
        themedCore.ready,
        plainCore.ready,
      ]);
      const themedViewer = viewerModule.mountPageViewer(themedHost, themedDocument, {
        theme: {
          "--imposia-viewer-color-accent": "#8b6cff",
          "--imposia-viewer-control-size": "44px",
        },
      });
      const plainViewer = viewerModule.mountPageViewer(plainHost, plainDocument);
      const initial = {
        accent: themedHost.style.getPropertyValue("--imposia-viewer-color-accent"),
        controlSize: themedHost.style.getPropertyValue("--imposia-viewer-control-size"),
        plainAccent: plainHost.style.getPropertyValue("--imposia-viewer-color-accent"),
      };
      themedViewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
      const updated = {
        accent: themedHost.style.getPropertyValue("--imposia-viewer-color-accent"),
        controlSize: themedHost.style.getPropertyValue("--imposia-viewer-control-size"),
      };
      let invalidRejected = false;
      try {
        themedViewer.setTheme({ color: "red" } as unknown as Theme);
      } catch {
        invalidRejected = true;
      }
      const preservedAfterInvalid = themedHost.style.getPropertyValue(
        "--imposia-viewer-color-accent",
      );
      themedViewer.setTheme();
      const restoredAfterClear = themedHost.style.getPropertyValue("--imposia-viewer-color-accent");
      themedViewer.setTheme({ "--imposia-viewer-color-accent": "#123456" });
      themedViewer.destroy();
      const restoredAccent = themedHost.style.getPropertyValue("--imposia-viewer-color-accent");
      plainViewer.destroy();
      await themedCore.destroy();
      await plainCore.destroy();
      return {
        initial,
        updated,
        invalidRejected,
        preservedAfterInvalid,
        restoredAfterClear,
        restoredAccent,
      };
    });

    expect(observation.initial).toEqual({
      accent: "#8b6cff",
      controlSize: "44px",
      plainAccent: "",
    });
    expect(observation.updated).toEqual({ accent: "#ef6a3b", controlSize: "" });
    expect(observation.invalidRejected).toBe(true);
    expect(observation.preservedAfterInvalid).toBe("#ef6a3b");
    expect(observation.restoredAfterClear).toBe("original-accent");
    expect(observation.restoredAccent).toBe("original-accent");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("applies the same runtime theme contract to the independent PDF viewer", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type Theme = Readonly<Record<`--imposia-viewer-${string}`, string>>;
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const viewerModule = (await import("/packages/viewer/dist/index.js")) as {
        mountViewer(
          container: HTMLElement,
          source: Uint8Array,
          options: { theme?: Theme; workerSrc?: string },
        ): { setTheme(theme?: Theme): void; destroy(): void };
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const viewer = viewerModule.mountViewer(host, new Uint8Array([0]), {
        workerSrc: "/node_modules/pdfjs-dist/build/pdf.worker.mjs",
        theme: { "--imposia-viewer-color-accent": "#8b6cff" },
      });
      const root = host.querySelector<HTMLElement>(".imposia-viewer");
      const initial = root?.style.getPropertyValue("--imposia-viewer-color-accent");
      viewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
      const updated = root?.style.getPropertyValue("--imposia-viewer-color-accent");
      viewer.destroy();
      return { initial, updated, emptyAfterDestroy: host.childElementCount === 0 };
    });

    expect(observation).toEqual({
      initial: "#8b6cff",
      updated: "#ef6a3b",
      emptyAfterDestroy: true,
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("rejects invalid initial themes before either viewer mutates its host", async ({
  page,
  browserName,
}) => {
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
        destroy(): Promise<void>;
      };
      type Theme = Readonly<Record<`--imposia-viewer-${string}`, string>>;
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const core = (await import("@imposia/core")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, never>,
        ): CoreController;
      };
      const viewerModule = (await import("/packages/viewer/dist/index.js")) as {
        mountPageViewer(
          container: HTMLElement,
          pageDocument: PageDocument,
          options: { theme?: Theme },
        ): unknown;
        mountViewer(
          container: HTMLElement,
          source: Uint8Array,
          options: { theme?: Theme; workerSrc?: string },
        ): unknown;
      };
      const invalidTheme = { color: "red" } as unknown as Theme;
      const pageHost = document.createElement("div");
      const pdfHost = document.createElement("div");
      const sentinel = document.createElement("span");
      sentinel.textContent = "keep me";
      pdfHost.append(sentinel);
      document.body.replaceChildren(pageHost, pdfHost);
      const controller = core.mountPageDocument(pageHost, { html: "<p>Stable</p>" }, {});
      const pageDocument = await controller.ready;
      const frameClass = pageDocument.iframe.getAttribute("class");
      const hostClass = pageHost.getAttribute("class");
      let pageRejected = false;
      let pdfRejected = false;
      try {
        viewerModule.mountPageViewer(pageHost, pageDocument, { theme: invalidTheme });
      } catch {
        pageRejected = true;
      }
      try {
        viewerModule.mountViewer(pdfHost, new Uint8Array([0]), {
          workerSrc: "/node_modules/pdfjs-dist/build/pdf.worker.mjs",
          theme: invalidTheme,
        });
      } catch {
        pdfRejected = true;
      }
      const result = {
        pageRejected,
        pageHostClassUnchanged: pageHost.getAttribute("class") === hostClass,
        pageFrameClassUnchanged: pageDocument.iframe.getAttribute("class") === frameClass,
        pageFrameOnly:
          pageHost.childElementCount === 1 && pageHost.firstElementChild === pageDocument.iframe,
        pdfRejected,
        pdfSentinelRetained:
          pdfHost.childElementCount === 1 && pdfHost.firstElementChild === sentinel,
      };
      await controller.destroy();
      return result;
    });

    expect(observation).toEqual({
      pageRejected: true,
      pageHostClassUnchanged: true,
      pageFrameClassUnchanged: true,
      pageFrameOnly: true,
      pdfRejected: true,
      pdfSentinelRetained: true,
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
