import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const PAGED_SOURCE = {
  html: [
    "<main>",
    ...Array.from(
      { length: 5 },
      (_, index) =>
        `<section${index === 0 ? "" : ' style="break-before: page"'}><h1>Page ${index + 1}</h1><p>Canonical spread fixture.</p></section>`,
    ),
    "</main>",
  ].join(""),
  css: ["@page { size: 360px 480px; margin: 32px; }"],
} as const;

async function mountSpreadFixture(page: import("@playwright/test").Page, width: number) {
  await page.goto("/examples/book.html");
  await page.setViewportSize({ width: Math.max(width + 80, 500), height: 820 });
  await page.evaluate(
    async ({ source, hostWidth }) => {
      const viewerStyles = document.createElement("link");
      viewerStyles.rel = "stylesheet";
      viewerStyles.href = "/packages/viewer/src/styles.css";
      document.head.append(viewerStyles);
      await new Promise<void>((resolve, reject) => {
        viewerStyles.addEventListener("load", () => resolve(), { once: true });
        viewerStyles.addEventListener(
          "error",
          () => reject(new Error("Viewer styles failed to load.")),
          {
            once: true,
          },
        );
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
      const core = await import("@imposia/core");
      const viewer = await import("/packages/viewer/dist/index.js");
      const host = document.createElement("div");
      host.id = "spread-fixture";
      host.style.width = `${hostWidth}px`;
      host.style.height = "760px";
      document.body.replaceChildren(host);
      const documentController = core.mountPageDocument(host, source, {});
      const pageDocument = await documentController.ready;
      const pageViewer = viewer.mountPageViewer(host, pageDocument, {
        mode: "spread",
        spread: { cover: true },
      });
      Object.assign(window, {
        spreadDocumentController: documentController,
        spreadPageViewer: pageViewer,
      });
    },
    { source: PAGED_SOURCE, hostWidth: width },
  );
  await expect(page.locator("#spread-fixture")).toHaveAttribute("data-status", "ready");
}

test("spread presentation preserves canonical identity, cover parity, navigation, and responsive fallback", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await mountSpreadFixture(page, 960);

  try {
    const viewerRegion = page.getByRole("region", { name: "Imposia document viewer" });
    const documentControls = viewerRegion.getByRole("group", { name: "Document controls" });
    const continuousMode = documentControls.getByRole("button", { name: "Continuous pages" });
    const singleMode = documentControls.getByRole("button", { name: "Single page" });
    const spreadMode = documentControls.getByRole("button", { name: "Spread pages" });
    const liveModeStatus = viewerRegion.locator('.imposia-visually-hidden[role="status"]');
    await continuousMode.focus();
    await page.keyboard.press("Enter");
    await expect(continuousMode).toHaveAttribute("aria-pressed", "true");
    await expect(liveModeStatus).toHaveText("Continuous view.");
    await singleMode.focus();
    await page.keyboard.press("Space");
    await expect(singleMode).toHaveAttribute("aria-pressed", "true");
    await expect(liveModeStatus).toHaveText("Single-page view.");
    await spreadMode.focus();
    await page.keyboard.press("Enter");
    await expect(spreadMode).toHaveAttribute("aria-pressed", "true");
    await expect(liveModeStatus).toHaveText("Spread view.");

    const observation = await page.evaluate(async () => {
      type SpreadViewer = {
        goToPage(page: number): void;
        setMode(mode: "continuous" | "single" | "spread"): void;
        setSpreadCover(cover: boolean): void;
        readonly state: {
          page: number;
          mode: string;
          effectiveMode: string;
          generation: number;
        };
      };
      const viewer = Reflect.get(window, "spreadPageViewer") as SpreadViewer;
      const host = document.querySelector<HTMLElement>("#spread-fixture");
      const frame = host?.querySelector<HTMLIFrameElement>("iframe");
      if (host === null || frame === null || frame.contentDocument === null)
        throw new Error("Missing fixture.");
      const initialFrame = frame;
      const initialPages = [
        ...frame.contentDocument.querySelectorAll<HTMLElement>("[data-imposia-page]"),
      ];
      const initialNumbers = initialPages.map((node) => node.dataset.imposiaPageNumber);
      const initialGeneration = viewer.state.generation;
      const spreadButton = host.querySelector<HTMLButtonElement>(
        'button[aria-label^="Spread pages"]',
      );
      const continuousButton = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Continuous pages"]',
      );
      const singleButton = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Single page"]',
      );
      const nextButton = host.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
      const toolbar = host.querySelector<HTMLElement>('.imposia-toolbar[role="group"]');
      const modeStatus = host.querySelector<HTMLOutputElement>(
        '.imposia-visually-hidden[role="status"]',
      );
      if (
        spreadButton === null ||
        continuousButton === null ||
        singleButton === null ||
        nextButton === null ||
        toolbar === null ||
        modeStatus === null
      ) {
        throw new Error("Missing accessible spread controls.");
      }
      const waitForEffectiveMode = async (expected: "single" | "spread") => {
        for (let frameCount = 0; frameCount < 120; frameCount += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          if (frameCount >= 2 && viewer.state.effectiveMode === expected) return;
        }
        throw new Error(
          `Timed out waiting for ${expected} mode; received ${viewer.state.effectiveMode}.`,
        );
      };
      const positions = () =>
        initialPages.map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: Math.round(rect.left), top: Math.round(rect.top) };
        });
      const cover = positions();
      viewer.setSpreadCover(false);
      const pairedFirstPage = positions();
      viewer.setSpreadCover(true);
      viewer.goToPage(2);
      const pair = positions();
      host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      const keyboardPage = viewer.state.page;
      const keyboardReadout = host.querySelector<HTMLOutputElement>(
        "[data-testid=page-indicator]",
      )?.textContent;
      const modeTransitions = [];
      continuousButton.click();
      modeTransitions.push({ ...viewer.state });
      singleButton.click();
      modeTransitions.push({ ...viewer.state });
      spreadButton.click();
      modeTransitions.push({ ...viewer.state });
      viewer.goToPage(3);
      const visibleActiveMode = () => {
        const toolbarRect = toolbar.getBoundingClientRect();
        const buttonRect = spreadButton.getBoundingClientRect();
        return buttonRect.left >= toolbarRect.left - 1 && buttonRect.right <= toolbarRect.right + 1;
      };
      host.style.width = "375px";
      await waitForEffectiveMode("single");
      const narrow = {
        state: viewer.state,
        mode: host.dataset.mode,
        effective: host.dataset.effectiveMode,
        clientWidth: host.clientWidth,
        spreadLabel: spreadButton?.getAttribute("aria-label"),
        modeStatus: modeStatus.textContent,
        activeModeVisible: visibleActiveMode(),
      };
      host.style.width = "320px";
      await waitForEffectiveMode("single");
      const compact = {
        clientWidth: host.clientWidth,
        activeModeVisible: visibleActiveMode(),
        modeStatus: modeStatus.textContent,
      };
      toolbar.scrollLeft = 0;
      nextButton.focus();
      nextButton.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const toolbarRectAfterNavigation = toolbar.getBoundingClientRect();
      const nextRectAfterNavigation = nextButton.getBoundingClientRect();
      const compactNavigation = {
        state: { ...viewer.state },
        nextVisible:
          nextRectAfterNavigation.left >= toolbarRectAfterNavigation.left - 1 &&
          nextRectAfterNavigation.right <= toolbarRectAfterNavigation.right + 1,
      };
      viewer.goToPage(3);
      host.style.width = "960px";
      await waitForEffectiveMode("spread");
      return {
        canonicalFrame: frame === initialFrame && host.querySelectorAll("iframe").length === 1,
        canonicalPages: initialPages.every(
          (node, index) =>
            node === frame.contentDocument?.querySelectorAll("[data-imposia-page]")[index],
        ),
        numbers: initialNumbers,
        afterNumbers: initialPages.map((node) => node.dataset.imposiaPageNumber),
        generation: viewer.state.generation,
        initialGeneration,
        state: viewer.state,
        rootMode: host.dataset.mode,
        effectiveMode: host.dataset.effectiveMode,
        spreadPressed: spreadButton?.getAttribute("aria-pressed"),
        spreadLabel: spreadButton?.getAttribute("aria-label"),
        cover,
        pairedFirstPage,
        pair,
        keyboardPage,
        keyboardReadout,
        modeTransitions,
        narrow,
        compact,
        compactNavigation,
        restoredModeStatus: modeStatus.textContent,
      };
    });

    expect(observation.canonicalFrame).toBe(true);
    expect(observation.canonicalPages).toBe(true);
    expect(observation.afterNumbers).toEqual(observation.numbers);
    expect(observation.generation).toBe(observation.initialGeneration);
    expect(observation.state).toMatchObject({ page: 3, mode: "spread", effectiveMode: "spread" });
    expect(observation.rootMode).toBe("spread");
    expect(observation.effectiveMode).toBe("spread");
    expect(observation.spreadPressed).toBe("true");
    expect(observation.spreadLabel).toBe("Spread pages");
    expect(observation.keyboardPage).toBe(4);
    expect(observation.keyboardReadout).toBe("4–5 / 5");
    expect(observation.modeTransitions).toEqual([
      expect.objectContaining({ page: 4, mode: "continuous", generation: 1 }),
      expect.objectContaining({ page: 4, mode: "single", generation: 1 }),
      expect.objectContaining({ page: 4, mode: "spread", generation: 1 }),
    ]);
    expect(observation.narrow).toMatchObject({
      state: { page: 3, mode: "spread", effectiveMode: "single" },
      mode: "spread",
      effective: "single",
      clientWidth: 375,
      spreadLabel: "Spread pages (showing single page at this width)",
      modeStatus: "Spread view is unavailable at this width. Showing one page.",
      activeModeVisible: true,
    });
    expect(observation.compact).toEqual({
      clientWidth: 320,
      activeModeVisible: true,
      modeStatus: "Spread view is unavailable at this width. Showing one page.",
    });
    expect(observation.compactNavigation).toEqual({
      state: expect.objectContaining({ page: 4, mode: "spread", effectiveMode: "single" }),
      nextVisible: true,
    });
    expect(observation.restoredModeStatus).toBe("Spread view.");
    expect(observation.cover[0]?.left).toBeGreaterThan(observation.cover[1]?.left ?? Infinity);
    expect(observation.cover[0]?.top).toBeLessThan(observation.cover[1]?.top ?? -Infinity);
    expect(observation.pairedFirstPage[0]?.top).toBe(observation.pairedFirstPage[1]?.top);
    expect(observation.pairedFirstPage[0]?.left).toBeLessThan(
      observation.pairedFirstPage[1]?.left ?? -Infinity,
    );
    expect(observation.pair[1]?.top).toBe(observation.pair[2]?.top);
    expect(observation.pair[1]?.left).toBeLessThan(observation.pair[2]?.left ?? -Infinity);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("spread and narrow fallback have stable Chromium visual snapshots", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the visual geometry reference.");
  test.skip(process.platform !== "darwin", "The checked pixel baseline is validated on Darwin.");
  await mountSpreadFixture(page, 960);
  const host = page.locator("#spread-fixture");
  await expect(host).toHaveScreenshot("spread-cover-wide.png", { animations: "disabled" });
  await host.evaluate((node) => {
    (node as HTMLElement).style.width = "375px";
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(host).toHaveScreenshot("spread-cover-narrow.png", { animations: "disabled" });
});

test("spread survives generation refresh and restores all presentation state on destroy", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await mountSpreadFixture(page, 960);

  try {
    const observation = await page.evaluate(async (source) => {
      type PageDocument = {
        iframe: HTMLIFrameElement;
        generation: number;
      };
      type DocumentController = {
        update(source: typeof PAGED_SOURCE): Promise<PageDocument>;
        destroy(): Promise<void>;
      };
      type SpreadViewer = {
        goToPage(page: number): void;
        refresh(pageDocument: PageDocument): void;
        print(): Promise<void>;
        destroy(): void;
        readonly state: {
          page: number;
          pageCount: number;
          mode: string;
          effectiveMode: string;
          generation: number;
        };
      };
      const controller = Reflect.get(window, "spreadDocumentController") as DocumentController;
      const viewer = Reflect.get(window, "spreadPageViewer") as SpreadViewer;
      const host = document.querySelector<HTMLElement>("#spread-fixture");
      const frame = host?.querySelector<HTMLIFrameElement>("iframe");
      if (host === null || frame === null || frame.contentDocument === null) {
        throw new Error("Missing spread lifecycle fixture.");
      }
      const initialPages = [...frame.contentDocument.querySelectorAll("[data-imposia-page]")];
      const frameWindow = frame.contentWindow;
      if (frameWindow === null) throw new Error("Missing canonical frame window.");
      let framePrints = 0;
      frameWindow.print = () => {
        framePrints += 1;
      };
      viewer.goToPage(3);
      const nextDocument = await controller.update(source);
      viewer.refresh(nextDocument);
      const refreshedPages = [
        ...frame.contentDocument.querySelectorAll<HTMLElement>("[data-imposia-page]"),
      ];
      const positions = refreshedPages.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: Math.round(rect.left), top: Math.round(rect.top) };
      });
      const refreshed = {
        sameFrame: nextDocument.iframe === frame && host.querySelectorAll("iframe").length === 1,
        replacedGenerationPages: initialPages.every((node) => !refreshedPages.includes(node)),
        numbers: refreshedPages.map((node) => node.dataset.imposiaPageNumber),
        sides: refreshedPages.map((node) => node.dataset.imposiaPageSide),
        state: viewer.state,
        presentationStyles: frame.contentDocument.querySelectorAll(
          "style[data-imposia-viewer-style]",
        ).length,
        pair: [positions[1], positions[2]],
      };
      await viewer.print();
      viewer.destroy();
      const restored = {
        frameFirst: host.firstElementChild === frame,
        frameClass: frame.getAttribute("class"),
        frameStyle: frame.getAttribute("style"),
        hostClass: host.getAttribute("class"),
        mode: host.dataset.mode,
        effectiveMode: host.dataset.effectiveMode,
        presentationStyles: frame.contentDocument.querySelectorAll(
          "style[data-imposia-viewer-style]",
        ).length,
        frameMode: frame.contentDocument.documentElement.getAttribute(
          "data-imposia-viewer-presentation",
        ),
        frameCover: frame.contentDocument.documentElement.getAttribute("data-imposia-viewer-cover"),
        coverWidth: frame.contentDocument.body.style.getPropertyValue(
          "--imposia-viewer-cover-width",
        ),
      };
      await controller.destroy();
      return { refreshed, framePrints, restored };
    }, PAGED_SOURCE);

    expect(observation.refreshed).toMatchObject({
      sameFrame: true,
      replacedGenerationPages: true,
      numbers: ["1", "2", "3", "4", "5"],
      sides: ["right", "left", "right", "left", "right"],
      state: { page: 3, pageCount: 5, mode: "spread", effectiveMode: "spread", generation: 2 },
      presentationStyles: 1,
    });
    if (browserName === "chromium") {
      expect(observation.refreshed.pair[0]?.top).toBe(observation.refreshed.pair[1]?.top);
      expect(observation.refreshed.pair[0]?.left).toBeLessThan(
        observation.refreshed.pair[1]?.left ?? -Infinity,
      );
    }
    expect(observation.framePrints).toBe(1);
    expect(observation.restored).toEqual({
      frameFirst: true,
      frameClass: null,
      frameStyle: null,
      hostClass: null,
      mode: undefined,
      effectiveMode: undefined,
      presentationStyles: 0,
      frameMode: null,
      frameCover: null,
      coverWidth: "",
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
