import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type InspectorWarning = Readonly<{
  code: string;
  sourceIdentity?: string;
  recovery?: string;
  location: Readonly<{
    generation: number | undefined;
    entryId?: string;
    page?: number;
  }>;
}>;

type InspectorFixture = {
  controller: {
    update(snapshot: unknown): Promise<InspectorPublication>;
    destroy(): Promise<void>;
  };
  emitWarnings: boolean;
  host: HTMLElement;
  publication: InspectorPublication;
  retainedPublication?: InspectorPublication;
  retainedWarning?: InspectorWarning;
  viewer: {
    destroy(): void;
    goToPage(page: number): void;
    refresh(publication: InspectorPublication): void;
    setMode(mode: "continuous" | "single" | "spread"): void;
    setSpreadCover(cover: boolean): void;
    setZoom(zoom: number): void;
    readonly state: { page: number; mode: string; generation: number };
    readonly reader: {
      openSearch(): void;
      readonly state: { searchOpen: boolean };
    };
    readonly inspector: {
      open(): void;
      close(): void;
      toggle(): void;
      select(warning: InspectorWarning): void;
      readonly state: {
        open: boolean;
        warnings: readonly InspectorWarning[];
        selected: InspectorWarning | undefined;
      };
    };
  };
};

type InspectorPublication = {
  iframe: HTMLIFrameElement;
  entries: readonly Readonly<{ id: string; pageRange: Readonly<{ start: number; end: number }> }>[];
  exportEpub(options: unknown): Promise<Blob>;
};

type InspectorWindow = Window & { __viewerInspectorFixture?: InspectorFixture };
type ExtensionContext = {
  warn(warning: { code: `EXTENSION_${string}`; message: string }): void;
};

test("browses only current diagnostics and temporarily highlights through Viewer navigation", async ({
  page,
  browserName,
}) => {
  test.setTimeout(90_000);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  await page.addStyleTag({ url: "/packages/viewer/src/styles.css" });

  try {
    await page.evaluate(async () => {
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const [core, viewerModule] = await Promise.all([
        import("/packages/core/dist/index.js"),
        import("/packages/viewer/dist/index.js"),
      ]);
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      let emitWarnings = true;
      const extension = {
        name: "tests/inspector",
        transformEntry(input: { entry: { id: string }; html: string }, context: ExtensionContext) {
          if (emitWarnings && input.entry.id === "second") {
            context.warn({
              code: "EXTENSION_ENTRY_POLICY",
              message: "The second entry used the test recovery policy.",
            });
          }
          return { html: input.html };
        },
      };
      const snapshot = {
        metadata: { title: "Inspector fixture" },
        entries: [
          { id: "first", title: "First", html: "<h1>First entry</h1>" },
          {
            id: "second",
            title: "Second",
            html: `
              <h1 style="break-before: page">Second entry</h1>
              <section data-warning-target style="display: flex; flex-direction: row">
                <span>Unsupported row A</span><span>Unsupported row B</span>
              </section>
            `,
          },
        ],
      };
      const controller = core.mountPublication(host, snapshot, { extensions: [extension] });
      const publication = await controller.ready;
      const viewer = viewerModule.mountPageViewer(host, publication, {
        inspector: true,
        reader: { controller },
      });
      (window as InspectorWindow).__viewerInspectorFixture = {
        controller,
        get emitWarnings() {
          return emitWarnings;
        },
        set emitWarnings(value: boolean) {
          emitWarnings = value;
        },
        host,
        publication,
        viewer,
      };
    });

    const toggle = page.getByRole("button", { name: "Diagnostics" });
    const panel = page.getByRole("region", { name: "Document diagnostics" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button")).toHaveCount(2);
    await expect(panel.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByRole("button").nth(1)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(panel.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(panel.getByRole("button").nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel.getByText("EXTENSION_ENTRY_POLICY", { exact: true })).toBeVisible();
    await expect(panel.getByText("GENERATION 1 · ENTRY second", { exact: true })).toBeVisible();
    await expect(panel.getByText("UNSUPPORTED_LAYOUT", { exact: true })).toBeVisible();
    await expect(panel.getByText(/PAGE 2/u)).toBeVisible();
    await expect(panel.getByText("RECOVERY · Kept the source layout atomic.")).toBeVisible();

    await page.keyboard.press("PageDown");
    expect(
      await page.evaluate(
        () => (window as InspectorWindow).__viewerInspectorFixture?.viewer.state.page,
      ),
    ).toBe(1);

    await page.getByRole("button", { name: "Contents" }).click();
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(
      page.getByRole("navigation", { name: "Publication table of contents" }),
    ).toBeHidden();
    const coordinated = await page.evaluate(() => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      fixture.viewer.reader.openSearch();
      fixture.viewer.inspector.open();
      return {
        searchOpen: fixture.viewer.reader.state.searchOpen,
        inspectorOpen: fixture.viewer.inspector.state.open,
      };
    });
    expect(coordinated).toEqual({ searchOpen: false, inspectorOpen: true });
    const entryWarning = page.getByRole("button", { name: /EXTENSION_ENTRY_POLICY/u });
    await entryWarning.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();

    const entrySelection = await page.evaluate(() => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      return {
        page: fixture.viewer.state.page,
        entryStart: fixture.publication.entries.find((entry) => entry.id === "second")?.pageRange
          .start,
        selectedCode: fixture.viewer.inspector.state.selected?.code,
        scrollTop: fixture.host.scrollTop + window.scrollY,
      };
    });
    expect(entrySelection.page).toBe(entrySelection.entryStart);
    expect(entrySelection.selectedCode).toBe("EXTENSION_ENTRY_POLICY");
    expect(entrySelection.scrollTop).toBeGreaterThan(0);

    await page.evaluate(() => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      fixture.viewer.goToPage(1);
      fixture.viewer.inspector.open();
    });
    const pageWarning = page.getByRole("button", { name: /UNSUPPORTED_LAYOUT/u });
    await pageWarning.focus();
    await page.keyboard.press("Space");
    await expect(panel).toBeHidden();

    const selected = await page.evaluate(() => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      const frameDocument = fixture.publication.iframe.contentDocument as Document;
      const highlighted = fixture.host.querySelector<HTMLElement>(".imposia-inspector-highlight");
      const warning = fixture.viewer.inspector.state.selected;
      const target = frameDocument.querySelector<HTMLElement>("[data-warning-target]");
      const pageElement = target?.closest<HTMLElement>("[data-imposia-page]");
      if (highlighted === null || target === null || pageElement === null) {
        throw new Error("Inspector highlight target is unavailable.");
      }
      const iframeBounds = fixture.publication.iframe.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      const overlayBounds = highlighted.getBoundingClientRect();
      const pageBounds = pageElement.getBoundingClientRect();
      const scaleX = iframeBounds.width / fixture.publication.iframe.clientWidth;
      const scaleY = iframeBounds.height / fixture.publication.iframe.clientHeight;
      return {
        page: fixture.viewer.state.page,
        selectedCode: warning?.code,
        selectedGeneration: fixture.viewer.inspector.state.selected?.location.generation,
        highlightedPage: highlighted?.dataset.page,
        highlightVisible: highlighted?.hidden === false,
        canonicalIdentity:
          fixture.host.querySelector('iframe[data-imposia-frame="page-document"]') ===
          fixture.publication.iframe,
        canonicalFrames: fixture.host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
          .length,
        inspectorInFrame: frameDocument.querySelector(".imposia-inspector-panel") !== null,
        continuousScrollTop: fixture.host.scrollTop + window.scrollY,
        geometryDelta: {
          left: Math.abs(overlayBounds.left - (iframeBounds.left + targetBounds.left * scaleX)),
          top: Math.abs(overlayBounds.top - (iframeBounds.top + targetBounds.top * scaleY)),
          width: Math.abs(overlayBounds.width - targetBounds.width * scaleX),
          height: Math.abs(overlayBounds.height - targetBounds.height * scaleY),
        },
        fragmentSmallerThanPage:
          overlayBounds.width < pageBounds.width || overlayBounds.height < pageBounds.height,
      };
    });
    expect(selected).toMatchObject({
      page: 2,
      selectedCode: "UNSUPPORTED_LAYOUT",
      selectedGeneration: 1,
      highlightedPage: "2",
      highlightVisible: true,
      canonicalIdentity: true,
      canonicalFrames: 1,
      inspectorInFrame: false,
      fragmentSmallerThanPage: true,
    });
    expect(selected.continuousScrollTop).toBeGreaterThan(0);
    expect(Math.max(...Object.values(selected.geometryDelta))).toBeLessThan(3);
    const highlight = page.locator(".imposia-inspector-highlight");
    await expect(highlight).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(highlight).toHaveCSS("display", "none");
    await page.emulateMedia({ media: "screen" });

    const presentationCleanup = await page.evaluate(() => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      const warning = fixture.viewer.inspector.state.selected;
      if (warning === undefined) throw new Error("Inspector selected warning is unavailable.");
      const visible = () =>
        fixture.host.querySelector<HTMLElement>(".imposia-inspector-highlight")?.hidden === false;
      fixture.viewer.setZoom(1.1);
      const afterZoom = visible();
      fixture.viewer.inspector.select(warning);
      fixture.viewer.setMode("single");
      const afterMode = visible();
      fixture.viewer.inspector.select(warning);
      fixture.viewer.setSpreadCover(true);
      const afterSpread = visible();
      fixture.viewer.inspector.select(warning);
      fixture.host.style.width = "700px";
      return { afterZoom, afterMode, afterSpread };
    });
    expect(presentationCleanup).toEqual({
      afterZoom: false,
      afterMode: false,
      afterSpread: false,
    });
    await expect(highlight).toBeHidden();
    await page.evaluate(() => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      const warning = fixture.viewer.inspector.state.selected;
      if (warning === undefined) throw new Error("Inspector selected warning is unavailable.");
      fixture.viewer.setMode("continuous");
      fixture.viewer.inspector.select(warning);
    });
    await expect(highlight).toBeVisible();
    await expect(highlight).toBeHidden({ timeout: 4_000 });

    await page.evaluate(async () => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      const staleWarning = fixture.viewer.inspector.state.warnings[0];
      fixture.retainedWarning = staleWarning;
      fixture.retainedPublication = fixture.publication;
      fixture.emitWarnings = false;
      const updated = await fixture.controller.update({
        metadata: { title: "Inspector replacement" },
        entries: [{ id: "replacement", title: "Replacement", html: "<h1>Replacement</h1>" }],
      });
      fixture.viewer.refresh(updated);
      fixture.publication = updated;
      let staleRejected = false;
      if (staleWarning !== undefined) {
        try {
          fixture.viewer.inspector.select(staleWarning);
        } catch {
          staleRejected = true;
        }
      }
      const core = await import("/packages/core/dist/index.js");
      const staleBounds =
        staleWarning === undefined || fixture.retainedPublication === undefined
          ? undefined
          : core.pageWarningTargetBounds(fixture.retainedPublication, staleWarning);
      fixture.host.dataset.staleWarningRejected = String(staleRejected);
      fixture.host.dataset.staleBoundsRejected = String(staleBounds === undefined);
      fixture.viewer.inspector.open();
    });
    await expect(panel).toContainText("No warnings for generation 2.");
    await expect(panel).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel).toBeFocused();
    const refreshed = await page.evaluate(() => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      const frameDocument = fixture.publication.iframe.contentDocument as Document;
      return {
        warnings: fixture.viewer.inspector.state.warnings.length,
        selected: fixture.viewer.inspector.state.selected,
        staleRejected: fixture.host.dataset.staleWarningRejected,
        staleBoundsRejected: fixture.host.dataset.staleBoundsRejected,
        highlights: fixture.host.querySelectorAll(".imposia-inspector-highlight:not([hidden])")
          .length,
        frameHighlights: frameDocument.querySelectorAll('[class*="imposia-inspector"]').length,
      };
    });
    expect(refreshed).toEqual({
      warnings: 0,
      selected: undefined,
      staleRejected: "true",
      staleBoundsRejected: "true",
      highlights: 0,
      frameHighlights: 0,
    });

    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".imposia-inspector-panel")).toHaveCSS("display", "none");
    await page.emulateMedia({ media: "screen" });
    const exported = await page.evaluate(async () => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      const blob = await fixture.publication.exportEpub({
        metadata: {
          title: "Inspector EPUB",
          language: "en",
          identifier: "urn:imposia:inspector",
        },
      });
      return new TextDecoder().decode(await blob.arrayBuffer());
    });
    expect(exported).not.toContain("Document diagnostics");
    expect(exported).not.toContain("imposia-inspector");
    const destroyed = await page.evaluate(() => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      if (fixture === undefined) throw new Error("Inspector fixture is unavailable.");
      const retainedInspector = fixture.viewer.inspector;
      fixture.viewer.destroy();
      const calls = [
        () => retainedInspector.open(),
        () => retainedInspector.close(),
        () => retainedInspector.toggle(),
        () => {
          if (fixture.retainedWarning !== undefined)
            retainedInspector.select(fixture.retainedWarning);
        },
      ];
      const retainedErrors = calls.map((call) => {
        try {
          call();
          return undefined;
        } catch (error: unknown) {
          return error instanceof Error ? error.message : String(error);
        }
      });
      return {
        inspectorNodes: fixture.host.querySelectorAll('[class*="imposia-inspector"]').length,
        frameInspectorNodes: fixture.publication.iframe.contentDocument?.querySelectorAll(
          '[class*="imposia-inspector"]',
        ).length,
        canonicalIdentity:
          fixture.host.querySelector('iframe[data-imposia-frame="page-document"]') ===
          fixture.publication.iframe,
        retainedErrors,
        retainedState: retainedInspector.state,
      };
    });
    expect(destroyed).toEqual({
      inspectorNodes: 0,
      frameInspectorNodes: 0,
      canonicalIdentity: true,
      retainedErrors: Array.from({ length: 4 }, () => "Viewer inspector has been destroyed."),
      retainedState: { open: false, warnings: [], selected: undefined },
    });
  } finally {
    await page.evaluate(async () => {
      const fixture = (window as InspectorWindow).__viewerInspectorFixture;
      fixture?.viewer.destroy();
      await fixture?.controller.destroy();
      fixture?.host.remove();
      delete (window as InspectorWindow).__viewerInspectorFixture;
    });
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("exposes global-only diagnostics and focuses the panel when no warning is actionable", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  await page.addStyleTag({ url: "/packages/viewer/src/styles.css" });

  try {
    await page.evaluate(async () => {
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const [core, viewerModule] = await Promise.all([
        import("/packages/core/dist/index.js"),
        import("/packages/viewer/dist/index.js"),
      ]);
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(
        host,
        { html: "<h1>Global diagnostic</h1>" },
        {
          extensions: [
            {
              name: "tests/global-diagnostic",
              transform(
                input: { html: string },
                context: {
                  warn(warning: { code: `EXTENSION_${string}`; message: string }): void;
                },
              ) {
                context.warn({
                  code: "EXTENSION_GLOBAL_POLICY",
                  message: "The document used the global test policy.",
                });
                return { html: input.html };
              },
            },
          ],
        },
      );
      const pageDocument = await controller.ready;
      const viewer = viewerModule.mountPageViewer(host, pageDocument, { inspector: true });
      Reflect.set(globalThis, "__globalInspectorFixture", { controller, host, viewer });
    });

    const opener = page.getByRole("button", { name: "Diagnostics" });
    const panel = page.getByRole("region", { name: "Document diagnostics" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();
    await expect(panel.getByRole("button")).toHaveCount(0);
    await expect(
      panel.getByRole("group", {
        name: /EXTENSION_GLOBAL_POLICY.*global test policy.*GLOBAL/u,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
  } finally {
    await page.evaluate(async () => {
      const fixture = Reflect.get(globalThis, "__globalInspectorFixture") as
        | {
            viewer: { destroy(): void };
            controller: { destroy(): Promise<void> };
            host: HTMLElement;
          }
        | undefined;
      fixture?.viewer.destroy();
      await fixture?.controller.destroy();
      fixture?.host.remove();
      Reflect.deleteProperty(globalThis, "__globalInspectorFixture");
    });
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("clears a selected diagnostic on the first delivered resize observation", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  await page.addStyleTag({ url: "/packages/viewer/src/styles.css" });

  try {
    const observation = await page.evaluate(async () => {
      type Warning = { code: string; location: { page?: number } };
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const [core, viewerModule] = await Promise.all([
        import("/packages/core/dist/index.js"),
        import("/packages/viewer/dist/index.js"),
      ]);
      const host = document.createElement("div");
      host.style.width = "800px";
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(host, {
        html: `
          <h1>Resize diagnostic</h1>
          <section style="display: flex; flex-direction: row">
            <span>Unsupported A</span><span>Unsupported B</span>
          </section>
        `,
      });
      const pageDocument = await controller.ready;
      const NativeResizeObserver = window.ResizeObserver;
      let deliverFirstResize: (() => void) | undefined;
      class ManualResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          deliverFirstResize = () => callback([], this as unknown as ResizeObserver);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      Reflect.set(window, "ResizeObserver", ManualResizeObserver);
      let viewer:
        | {
            inspector: {
              readonly state: { warnings: readonly Warning[] };
              select(warning: Warning): void;
            };
            destroy(): void;
          }
        | undefined;
      try {
        viewer = viewerModule.mountPageViewer(host, pageDocument, { inspector: true });
        const warning = viewer.inspector.state.warnings.find(
          (candidate: Warning) =>
            candidate.code === "UNSUPPORTED_LAYOUT" && candidate.location.page !== undefined,
        );
        if (warning === undefined) throw new Error("Resize warning is unavailable.");
        viewer.inspector.select(warning);
        const highlight = host.querySelector<HTMLElement>(".imposia-inspector-highlight");
        if (highlight === null || deliverFirstResize === undefined) {
          throw new Error("Manual ResizeObserver fixture is unavailable.");
        }
        const visibleBeforeResize = !highlight.hidden;
        host.style.width = "700px";
        deliverFirstResize();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return { visibleBeforeResize, hiddenAfterFirstResize: highlight.hidden };
      } finally {
        viewer?.destroy();
        Reflect.set(window, "ResizeObserver", NativeResizeObserver);
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation).toEqual({
      visibleBeforeResize: true,
      hiddenAfterFirstResize: true,
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("adds no Viewer inspector surface unless explicitly enabled", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  await page.addStyleTag({ url: "/packages/viewer/src/styles.css" });
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
      const [core, viewerModule] = await Promise.all([
        import("/packages/core/dist/index.js"),
        import("/packages/viewer/dist/index.js"),
      ]);
      const omittedHost = document.createElement("div");
      const falseHost = document.createElement("div");
      document.body.replaceChildren(omittedHost, falseHost);
      const source = {
        html: '<h1>Plain Viewer</h1><h2 style="break-before: page">Second page</h2>',
      };
      const omittedController = core.mountPageDocument(omittedHost, source);
      const falseController = core.mountPageDocument(falseHost, source);
      const [omittedDocument, falseDocument] = await Promise.all([
        omittedController.ready,
        falseController.ready,
      ]);
      const omittedViewer = viewerModule.mountPageViewer(omittedHost, omittedDocument, {
        mode: "single",
      });
      const falseViewer = viewerModule.mountPageViewer(falseHost, falseDocument, {
        inspector: false,
        mode: "single",
      });
      for (const viewer of [omittedViewer, falseViewer]) {
        viewer.goToPage(2);
        viewer.setZoom(1.2);
      }
      let printCalls = 0;
      window.print = () => {
        printCalls += 1;
        window.dispatchEvent(new Event("afterprint"));
      };
      await Promise.all([omittedViewer.print(), falseViewer.print()]);
      const metadata = {
        title: "Disabled parity",
        language: "en",
        identifier: "urn:imposia:disabled-parity",
        modified: "2026-07-19T00:00:00Z",
      };
      const [omittedEpub, falseEpub] = await Promise.all([
        omittedDocument.exportEpub({ metadata }),
        falseDocument.exportEpub({ metadata }),
      ]);
      const omittedBytes = [...new Uint8Array(await omittedEpub.arrayBuffer())];
      const falseBytes = [...new Uint8Array(await falseEpub.arrayBuffer())];
      const observe = (
        host: HTMLElement,
        document: typeof omittedDocument,
        viewer: typeof omittedViewer,
      ) => {
        const bounds = document.iframe.getBoundingClientRect();
        return {
          inspector: viewer.inspector,
          inspectorNodes: host.querySelectorAll('[class*="imposia-inspector"]').length,
          inspectorFrameNodes: document.iframe.contentDocument?.querySelectorAll(
            '[class*="imposia-inspector"]',
          ).length,
          canonicalIdentity:
            host.querySelector('iframe[data-imposia-frame="page-document"]') === document.iframe,
          state: viewer.state,
          geometry: {
            width: bounds.width,
            height: bounds.height,
            transform: document.iframe.style.transform,
            clipPath: document.iframe.style.clipPath,
          },
        };
      };
      const result = {
        omitted: observe(omittedHost, omittedDocument, omittedViewer),
        explicitFalse: observe(falseHost, falseDocument, falseViewer),
        printCalls,
        sameEpub:
          omittedBytes.length === falseBytes.length &&
          omittedBytes.every((value, index) => value === falseBytes[index]),
        epubHasInspector: new TextDecoder()
          .decode(new Uint8Array(omittedBytes))
          .includes("imposia-inspector"),
      };
      omittedViewer.destroy();
      falseViewer.destroy();
      await Promise.all([omittedController.destroy(), falseController.destroy()]);
      omittedHost.remove();
      falseHost.remove();
      return result;
    });
    expect(observation.omitted).toEqual(observation.explicitFalse);
    expect(observation.omitted).toMatchObject({
      inspector: undefined,
      inspectorNodes: 0,
      inspectorFrameNodes: 0,
      canonicalIdentity: true,
      state: { page: 2, pageCount: 2, zoom: 1.2, mode: "single", effectiveMode: "single" },
    });
    expect(observation.printCalls).toBe(2);
    expect(observation.sameEpub).toBe(true);
    expect(observation.epubHasInspector).toBe(false);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
