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

test("keeps viewer styles scoped and exposes chrome-free presentation controls", async ({
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
      type PageViewerState = {
        page: number;
        pageCount: number;
        zoom: number;
        mode: "continuous" | "single" | "spread";
        effectiveMode: "continuous" | "single" | "spread";
        generation: number;
      };
      type PageViewerController = {
        goToPage(page: number): void;
        setZoom(zoom: number): void;
        setMode(mode: "continuous" | "single" | "spread"): void;
        subscribe(listener: (state: PageViewerState) => void): () => void;
        destroy(): void;
        readonly state: PageViewerState;
      };

      const hostStyles = document.createElement("style");
      hostStyles.textContent = `
        body {
          margin: 17px;
          overflow: auto;
          background: rgb(18 52 86);
        }
        .outside-viewer {
          box-sizing: content-box;
        }
      `;
      const viewerStyles = document.createElement("link");
      viewerStyles.rel = "stylesheet";
      viewerStyles.href = "/packages/viewer/src/styles.css";
      await new Promise<void>((resolve, reject) => {
        viewerStyles.addEventListener("load", () => resolve(), { once: true });
        viewerStyles.addEventListener(
          "error",
          () => reject(new Error("Viewer CSS failed to load.")),
          {
            once: true,
          },
        );
        document.head.append(hostStyles, viewerStyles);
      });

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
          options: { controls: false },
        ): PageViewerController;
      };

      const outside = document.createElement("div");
      outside.className = "outside-viewer";
      const host = document.createElement("div");
      host.style.width = "900px";
      host.style.height = "520px";
      document.body.replaceChildren(outside, host);
      const controller = core.mountPageDocument(
        host,
        {
          html: `
            <article><h1>First page</h1></article>
            <article style="break-before: page"><h1>Second page</h1></article>
          `,
        },
        {},
      );
      const pageDocument = await controller.ready;
      const stateChanges: PageViewerState[] = [];
      const viewer = viewerModule.mountPageViewer(host, pageDocument, { controls: false });
      const unsubscribe = viewer.subscribe((state) => stateChanges.push(state));
      viewer.setMode("single");
      viewer.setZoom(1.3);
      viewer.goToPage(2);
      const subscribedCount = stateChanges.length;
      unsubscribe();
      viewer.setZoom(1.4);

      const bodyStyle = getComputedStyle(document.body);
      const outsideStyle = getComputedStyle(outside);
      const hostStyle = getComputedStyle(host);
      const result = {
        iframeIdentity: host.querySelector("iframe") === pageDocument.iframe,
        railCount: host.querySelectorAll(".imposia-rail").length,
        headlessClass: host.classList.contains("imposia-page-viewer--headless"),
        body: {
          margin: bodyStyle.margin,
          overflow: bodyStyle.overflow,
          backgroundColor: bodyStyle.backgroundColor,
        },
        outsideBoxSizing: outsideStyle.boxSizing,
        rootCanvasToken: getComputedStyle(document.documentElement).getPropertyValue(
          "--imposia-viewer-color-canvas",
        ),
        hostCanvasToken: hostStyle.getPropertyValue("--imposia-viewer-color-canvas").trim(),
        hostBackgroundImage: hostStyle.backgroundImage,
        hostWatermark: getComputedStyle(host, "::before").content,
        state: viewer.state,
        subscribedCount,
        unsubscribedCount: stateChanges.length,
      };
      viewer.destroy();
      await controller.destroy();
      return result;
    });

    expect(observation.iframeIdentity).toBe(true);
    expect(observation.railCount).toBe(0);
    expect(observation.headlessClass).toBe(true);
    expect(observation.body).toEqual({
      margin: "17px",
      overflow: "auto",
      backgroundColor: "rgb(18, 52, 86)",
    });
    expect(observation.outsideBoxSizing).toBe("content-box");
    expect(observation.rootCanvasToken).toBe("");
    expect(observation.hostCanvasToken).toBe("#d8d5cc");
    expect(observation.hostBackgroundImage).toBe("none");
    expect(observation.hostWatermark).toBe("none");
    expect(observation.state).toMatchObject({
      page: 2,
      zoom: 1.4,
      mode: "single",
      effectiveMode: "single",
      generation: 1,
    });
    expect(observation.subscribedCount).toBeGreaterThanOrEqual(3);
    expect(observation.unsubscribedCount).toBe(observation.subscribedCount);
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
        setTheme(theme?: Readonly<Record<string, string>>): void;
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
        themedViewer.setTheme({ color: "red" });
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
          options: { theme?: Readonly<Record<string, string>> },
        ): unknown;
        mountViewer(
          container: HTMLElement,
          source: Uint8Array,
          options: { theme?: Readonly<Record<string, string>>; workerSrc?: string },
        ): unknown;
      };
      const invalidTheme = { color: "red" };
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
