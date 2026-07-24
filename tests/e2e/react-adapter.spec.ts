import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("React adapter updates the canonical iframe, reports failures, and cleans up on unmount", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    await expect(
      page.locator(".react-adapter-host[data-imposia-react-status='ready']"),
    ).toBeVisible();
    await expect(page.locator(".react-adapter-host iframe")).toHaveCount(1);

    const initial = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".react-adapter-host");
      const frame = host?.querySelector("iframe");
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            ready: number;
            errors: string[];
            states: string[];
            setSource: ((source: { html: string }) => void) | undefined;
          };
        }
      ).imposiaReactObservation;
      if (host === null || frame === null || observation.setSource === undefined) {
        throw new Error("React fixture did not initialize.");
      }
      (globalThis as { initialReactFrame?: HTMLIFrameElement }).initialReactFrame = frame;
      return { ready: observation.ready, text: frame.contentDocument?.body.textContent ?? "" };
    });

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setSource: (source: { html: string }) => void;
          };
        }
      ).imposiaReactObservation;
      observation.setSource({ html: "<h1>Updated React document</h1><p>Second generation</p>" });
    });
    await expect(page.locator(".react-adapter-host[data-imposia-generation='2']")).toHaveCount(1);

    const updated = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".react-adapter-host");
      const observation = (globalThis as { imposiaReactObservation: { ready: number } })
        .imposiaReactObservation;
      const frame = host?.querySelector("iframe");
      return {
        sameFrame:
          frame === (globalThis as { initialReactFrame?: HTMLIFrameElement }).initialReactFrame,
        text: frame?.contentDocument?.body.textContent ?? "",
        ready: observation.ready,
      };
    });

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setSource: (source: { html: string }) => void;
          };
        }
      ).imposiaReactObservation;
      observation.setSource({ html: null } as unknown as { html: string });
    });
    await expect(
      page.locator(".react-adapter-host[data-imposia-react-status='error']"),
    ).toHaveCount(1);

    const failed = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".react-adapter-host");
      const observation = (globalThis as { imposiaReactObservation: { errors: string[] } })
        .imposiaReactObservation;
      return {
        frameCount: host?.querySelectorAll("iframe").length ?? 0,
        text: host?.querySelector("iframe")?.contentDocument?.body.textContent ?? "",
        errors: observation.errors,
        states: (globalThis as { imposiaReactObservation: { states: string[] } })
          .imposiaReactObservation.states,
      };
    });

    await page.evaluate(() => {
      const observation = (globalThis as { imposiaReactObservation: { unmount: () => void } })
        .imposiaReactObservation;
      observation.unmount();
    });
    await expect(page.locator(".react-adapter-host")).toHaveCount(0);

    expect(initial.ready).toBe(1);
    expect(initial.text).toContain("Initial page");
    expect(updated.text).toContain("Second generation");
    expect(updated.ready).toBe(2);
    expect(updated.sameFrame).toBe(true);
    expect(failed.frameCount).toBe(1);
    expect(failed.text).toContain("Second generation");
    expect(failed.errors).toEqual(["Page source html must be a string."]);
    expect(failed.states).toEqual([
      "loading",
      "loading",
      "ready",
      "loading",
      "ready",
      "loading",
      "error",
    ]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React updates Viewer theme tokens without remounting the document", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    const initial = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".react-adapter-host");
      const frame = root?.querySelector("iframe");
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            ready: number;
            setTheme:
              | ((
                  theme: Readonly<Record<`--imposia-viewer-${string}`, string>> | undefined,
                ) => void)
              | undefined;
          };
        }
      ).imposiaReactObservation;
      if (root === null || frame === null || observation.setTheme === undefined) {
        throw new Error("React theme fixture did not initialize.");
      }
      Reflect.set(globalThis, "__imposiaThemeFrame", frame);
      observation.setTheme({
        "--imposia-viewer-color-accent": "#7357ff",
        "--imposia-viewer-control-size": "42px",
      });
      return {
        generation: root.dataset.imposiaGeneration,
        ready: observation.ready,
      };
    });

    await expect(host).toHaveCSS("--imposia-viewer-color-accent", "#7357ff");
    await expect(host).toHaveCSS("--imposia-viewer-control-size", "42px");
    const themed = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".react-adapter-host");
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            ready: number;
            setTheme: (theme: undefined) => void;
          };
        }
      ).imposiaReactObservation;
      const result = {
        sameFrame: Reflect.get(globalThis, "__imposiaThemeFrame") === root?.querySelector("iframe"),
        generation: root?.dataset.imposiaGeneration,
        ready: observation.ready,
      };
      observation.setTheme(undefined);
      return result;
    });
    await expect(host).toHaveCSS("--imposia-viewer-color-accent", "#ef6a3b");
    await expect(host).toHaveCSS("--imposia-viewer-control-size", "36px");

    expect(themed.sameFrame).toBe(true);
    expect(themed.generation).toBe(initial.generation);
    expect(themed.ready).toBe(initial.ready);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React updates spread options and imperative controls without replacing the canonical iframe", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    const initial = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".react-adapter-host");
      const frame = root?.querySelector<HTMLIFrameElement>("iframe");
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            readyViewerControls: number;
            setSource: ((source: { html: string }) => void) | undefined;
            setViewerOptions:
              | ((options: { mode: "spread"; spread: { cover: boolean } }) => void)
              | undefined;
          };
        }
      ).imposiaReactObservation;
      if (
        root === null ||
        frame === undefined ||
        frame === null ||
        observation.setViewerOptions === undefined
      ) {
        throw new Error("React spread fixture did not initialize.");
      }
      Reflect.set(globalThis, "__imposiaSpreadFrame", frame);
      observation.setViewerOptions({ mode: "spread", spread: { cover: true } });
      return {
        generation: root.dataset.imposiaGeneration,
        readyViewerControls: observation.readyViewerControls,
      };
    });

    await expect(host).toHaveAttribute("data-mode", "spread");
    await expect(host).toHaveAttribute("data-effective-mode", "spread");
    expect(initial.readyViewerControls).toBe(1);
    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setSource: ((source: { html: string }) => void) | undefined;
          };
        }
      ).imposiaReactObservation;
      if (observation.setSource === undefined)
        throw new Error("React spread source updater is unavailable.");
      observation.setSource({ html: "<h1>Spread update</h1><p>Second generation.</p>" });
    });
    await expect(host).toHaveAttribute("data-imposia-generation", "2");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as { imposiaReactObservation: { readyViewerControls: number } })
              .imposiaReactObservation.readyViewerControls,
        ),
      )
      .toBe(2);
    await page.evaluate(() => {
      type Handle = {
        setMode(mode: "continuous" | "single" | "spread"): void;
        setSpreadCover(cover: boolean): void;
      };
      const handle = (globalThis as { imposiaReactObservation: { handle: Handle | undefined } })
        .imposiaReactObservation.handle;
      if (handle === undefined) throw new Error("React spread handle is unavailable.");
      handle.setMode("single");
      handle.setSpreadCover(false);
      handle.setMode("spread");
    });
    await expect(host).toHaveAttribute("data-mode", "spread");
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaSpreadFrame") ===
          document.querySelector(".react-adapter-host iframe"),
      ),
    ).toBe(true);
    expect(initial.generation).toBe("1");
    await expect(host).toHaveAttribute("data-imposia-generation", "2");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React Inspector handles and option toggles preserve the reading position", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setSource: ((source: { html: string }) => void) | undefined;
          };
        }
      ).imposiaReactObservation;
      if (observation.setSource === undefined)
        throw new Error("React source updater is unavailable.");
      observation.setSource({
        html: `
          <h1>React Inspector</h1>
          <section style="display: flex; flex-direction: row; break-before: page">
            <span>Unsupported A</span><span>Unsupported B</span>
          </section>
        `,
      });
    });
    await expect(host).toHaveAttribute("data-imposia-generation", "2");
    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setViewerOptions:
              | ((options: { mode: "single"; inspector: boolean }) => void)
              | undefined;
          };
        }
      ).imposiaReactObservation;
      if (observation.setViewerOptions === undefined) {
        throw new Error("React Viewer option updater is unavailable.");
      }
      const frame = document.querySelector<HTMLIFrameElement>(
        '.react-adapter-host iframe[data-imposia-frame="page-document"]',
      );
      if (frame === null) throw new Error("React canonical frame is unavailable.");
      Reflect.set(globalThis, "__imposiaInspectorReactFrame", frame);
      observation.setViewerOptions({ mode: "single", inspector: true });
    });
    const diagnostics = page.getByRole("button", { name: "Diagnostics" });
    await expect(diagnostics).toBeVisible();
    await expect(host).toHaveAttribute("data-mode", "single");

    const delegated = await page.evaluate(() => {
      type Handle = {
        readonly current:
          | { warnings: readonly { code: string; location: { page?: number } }[] }
          | undefined;
        openInspector(): void;
        closeInspector(): void;
        toggleInspector(): void;
        selectWarning(warning: { code: string; location: { page?: number } }): void;
      };
      const handle = (globalThis as { imposiaReactObservation: { handle: Handle | undefined } })
        .imposiaReactObservation.handle;
      if (handle === undefined) throw new Error("React Inspector handle is unavailable.");
      handle.openInspector();
      handle.toggleInspector();
      handle.openInspector();
      handle.closeInspector();
      const warning = handle.current?.warnings.find(
        (candidate) =>
          candidate.code === "UNSUPPORTED_LAYOUT" && candidate.location.page !== undefined,
      );
      if (warning === undefined) throw new Error("React Core warning is unavailable.");
      handle.selectWarning(warning);
      return { code: warning.code, page: warning.location.page };
    });
    expect(delegated).toEqual({ code: "UNSUPPORTED_LAYOUT", page: 2 });
    await expect(host.getByTestId("page-indicator")).toHaveText("2 / 2");
    await expect(host.locator(".imposia-inspector-highlight")).toBeVisible();

    const immediateResize = await page.evaluate(() => {
      type Warning = { code: string; location: { page?: number } };
      type Handle = {
        readonly current: { warnings: readonly Warning[] } | undefined;
        selectWarning(warning: Warning): void;
      };
      const handle = (globalThis as { imposiaReactObservation: { handle: Handle | undefined } })
        .imposiaReactObservation.handle;
      const warning = handle?.current?.warnings.find(
        (candidate) =>
          candidate.code === "UNSUPPORTED_LAYOUT" && candidate.location.page !== undefined,
      );
      const viewerHost = document.querySelector<HTMLElement>(".react-adapter-host");
      const highlight = viewerHost?.querySelector<HTMLElement>(".imposia-inspector-highlight");
      if (
        handle === undefined ||
        warning === undefined ||
        viewerHost === null ||
        highlight === null
      ) {
        throw new Error("React Inspector resize fixture is unavailable.");
      }
      handle.selectWarning(warning);
      const visibleBeforeResize = !highlight.hidden;
      viewerHost.style.width = "700px";
      return { visibleBeforeResize };
    });
    expect(immediateResize).toEqual({ visibleBeforeResize: true });
    await expect(host.locator(".imposia-inspector-highlight")).toBeHidden();

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setViewerOptions: (options: {
              mode: "single";
              inspector: boolean;
              theme?: Readonly<Record<string, unknown>>;
            }) => void;
          };
        }
      ).imposiaReactObservation;
      observation.setViewerOptions({
        mode: "single",
        inspector: false,
        theme: { color: "red" },
      });
    });
    await expect(host).toHaveAttribute("data-imposia-react-status", "error");
    await expect(diagnostics).toBeVisible();
    await expect(host.getByTestId("page-indicator")).toHaveText("2 / 2");
    const atomicRejection = await page.evaluate(() => ({
      sameFrame:
        Reflect.get(globalThis, "__imposiaInspectorReactFrame") ===
        document.querySelector('.react-adapter-host iframe[data-imposia-frame="page-document"]'),
      mode: document.querySelector<HTMLElement>(".react-adapter-host")?.dataset.mode,
      generation:
        document.querySelector<HTMLElement>(".react-adapter-host")?.dataset.imposiaGeneration,
      errors: [
        ...(globalThis as { imposiaReactObservation: { errors: string[] } }).imposiaReactObservation
          .errors,
      ],
    }));
    expect(atomicRejection).toEqual({
      sameFrame: true,
      mode: "single",
      generation: "2",
      errors: ["Viewer theme entries must be string --imposia-viewer-* properties."],
    });

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setViewerOptions: (options: { mode: "single"; inspector: boolean }) => void;
          };
        }
      ).imposiaReactObservation;
      observation.setViewerOptions({ mode: "single", inspector: false });
    });
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await expect(diagnostics).toHaveCount(0);
    await expect(host.getByTestId("page-indicator")).toHaveText("2 / 2");
    await expect(host).toHaveAttribute("data-mode", "single");
    await expect(host).toHaveAttribute("data-imposia-generation", "2");

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setViewerOptions: (options: { mode: "single"; inspector: boolean }) => void;
          };
        }
      ).imposiaReactObservation;
      observation.setViewerOptions({ mode: "single", inspector: true });
    });
    await expect(diagnostics).toBeVisible();
    await expect(host.getByTestId("page-indicator")).toHaveText("2 / 2");
    const preserved = await page.evaluate(() => ({
      sameFrame:
        Reflect.get(globalThis, "__imposiaInspectorReactFrame") ===
        document.querySelector('.react-adapter-host iframe[data-imposia-frame="page-document"]'),
      canonicalFrames: document.querySelectorAll(
        '.react-adapter-host iframe[data-imposia-frame="page-document"]',
      ).length,
    }));
    expect(preserved).toEqual({ sameFrame: true, canonicalFrames: 1 });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React rejects invalid Viewer options atomically and reports the error", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    const initial = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".react-adapter-host");
      const frame = root?.querySelector("iframe");
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            ready: number;
            setViewerOptions:
              | ((options: {
                  mode?: "continuous" | "single";
                  theme?: Readonly<Record<string, unknown>>;
                }) => void)
              | undefined;
          };
        }
      ).imposiaReactObservation;
      if (root === null || frame === null || observation.setViewerOptions === undefined) {
        throw new Error("React Viewer options fixture did not initialize.");
      }
      Reflect.set(globalThis, "__imposiaInvalidOptionsFrame", frame);
      observation.setViewerOptions({ mode: "single", theme: { color: "red" } });
      return {
        generation: root.dataset.imposiaGeneration,
        ready: observation.ready,
      };
    });

    await expect(host).toHaveAttribute("data-imposia-react-status", "error");
    const rejected = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".react-adapter-host");
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            errors: string[];
            ready: number;
            setViewerOptions: (options: {
              mode: "single";
              theme: Readonly<Record<`--imposia-viewer-${string}`, string>>;
            }) => void;
          };
        }
      ).imposiaReactObservation;
      const result = {
        sameFrame:
          Reflect.get(globalThis, "__imposiaInvalidOptionsFrame") === root?.querySelector("iframe"),
        generation: root?.dataset.imposiaGeneration,
        mode: root?.dataset.mode,
        accent: root?.style.getPropertyValue("--imposia-viewer-color-accent"),
        errors: [...observation.errors],
        ready: observation.ready,
      };
      observation.setViewerOptions({
        mode: "single",
        theme: { "--imposia-viewer-color-accent": "#7357ff" },
      });
      return result;
    });

    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await expect(host).toHaveAttribute("data-mode", "single");
    await expect(host).toHaveCSS("--imposia-viewer-color-accent", "#7357ff");
    expect(rejected.sameFrame).toBe(true);
    expect(rejected.generation).toBe(initial.generation);
    expect(rejected.mode).toBe("continuous");
    expect(rejected.accent).toBe("");
    expect(rejected.errors).toEqual([
      "Viewer theme entries must be string --imposia-viewer-* properties.",
    ]);
    expect(rejected.ready).toBe(initial.ready);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React source revisions reprocess identical HTML in the same canonical iframe", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(
        '.react-adapter-host iframe[data-imposia-frame="page-document"]',
      );
      if (frame === null) throw new Error("React fixture canonical frame is missing.");
      Reflect.set(globalThis, "__imposiaRevisionFrame", frame);
    });

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: { bumpSourceRevision: (() => void) | undefined };
        }
      ).imposiaReactObservation;
      if (observation.bumpSourceRevision === undefined) {
        throw new Error("React fixture cannot bump its source revision.");
      }
      observation.bumpSourceRevision();
    });

    await expect(host).toHaveAttribute("data-imposia-generation", "2");
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaRevisionFrame") ===
          document.querySelector('.react-adapter-host iframe[data-imposia-frame="page-document"]'),
      ),
    ).toBe(true);
    const canonicalFrame = host.locator('iframe[data-imposia-frame="page-document"]');
    await expect(canonicalFrame).toHaveCount(1);
    await expect(host.locator('iframe[data-imposia-frame="page-document-staging"]')).toHaveCount(0);
    await expect(canonicalFrame.contentFrame().locator("body")).toContainText("Initial page");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React document option revisions replace the controller with the new configuration", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(
        '.react-adapter-host iframe[data-imposia-frame="page-document"]',
      );
      if (frame === null) throw new Error("React fixture canonical frame is missing.");
      Reflect.set(globalThis, "__imposiaOptionsRevisionFrame", frame);
    });

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            bumpDocumentOptionsRevision: (() => void) | undefined;
          };
        }
      ).imposiaReactObservation;
      if (observation.bumpDocumentOptionsRevision === undefined) {
        throw new Error("React fixture cannot revise document options.");
      }
      observation.bumpDocumentOptionsRevision();
    });

    const canonicalFrame = host.locator('iframe[data-imposia-frame="page-document"]');
    await expect(canonicalFrame).toHaveCount(1);
    await expect(host.locator('iframe[data-imposia-frame="page-document-staging"]')).toHaveCount(0);
    await expect(canonicalFrame.contentFrame().locator("body")).toContainText(
      "Options revision applied",
    );
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaOptionsRevisionFrame") !==
          document.querySelector('.react-adapter-host iframe[data-imposia-frame="page-document"]'),
      ),
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React imperative handle exposes the current document, print, and EPUB export", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  const metadata = {
    title: "React handle fixture",
    language: "en",
    identifier: "urn:imposia:react-handle",
    modified: "2026-07-18T00:00:00Z",
  };
  await page.goto("/examples/react/");

  try {
    await expect(
      page.locator(".react-adapter-host[data-imposia-react-status='ready']"),
    ).toBeVisible();
    await expect(page.locator(".react-adapter-host iframe")).toHaveCount(1);

    const initial = await page.evaluate(async () => {
      type PageDocumentView = {
        iframe: HTMLIFrameElement;
        generation: number;
        pageCount: number;
      };
      type EpubExportOptions = {
        metadata: {
          title: string;
          language: string;
          identifier: string;
          modified?: string;
        };
      };
      type Handle = {
        readonly current: PageDocumentView | undefined;
        print(): Promise<void>;
        exportEpub(options: EpubExportOptions): Promise<Blob>;
      };
      type Observation = {
        handle: Handle | undefined;
        retainedHandle: Handle | undefined;
      };
      const observation = (globalThis as { imposiaReactObservation: Observation })
        .imposiaReactObservation;
      const handle = observation.handle;
      if (handle === undefined)
        throw new Error("React fixture did not expose an imperative handle.");
      const current = handle.current;
      if (current === undefined)
        throw new Error("React imperative handle has no current document.");
      const frameWindow = current.iframe.contentWindow;
      if (frameWindow === null)
        throw new Error("React fixture is missing the canonical frame window.");
      const originalFramePrint = frameWindow.print;
      const originalParentPrint = window.print;
      const printObservation = { frame: 0, parent: 0 };
      Object.defineProperty(frameWindow, "print", {
        configurable: true,
        writable: true,
        value: () => {
          printObservation.frame += 1;
        },
      });
      Object.defineProperty(window, "print", {
        configurable: true,
        writable: true,
        value: () => {
          printObservation.parent += 1;
          window.dispatchEvent(new Event("afterprint"));
        },
      });
      (globalThis as { initialReactFrame?: HTMLIFrameElement }).initialReactFrame = current.iframe;
      (
        globalThis as { reactHandlePrintObservation?: typeof printObservation }
      ).reactHandlePrintObservation = printObservation;
      (globalThis as { reactHandlePrintRestore?: () => void }).reactHandlePrintRestore = () => {
        Object.defineProperty(frameWindow, "print", {
          configurable: true,
          writable: true,
          value: originalFramePrint,
        });
        Object.defineProperty(window, "print", {
          configurable: true,
          writable: true,
          value: originalParentPrint,
        });
      };
      const printResult = handle.print();
      const printIsPromise = typeof (printResult as Promise<void> | undefined)?.then === "function";
      await printResult;
      observation.retainedHandle = handle;
      return {
        generation: current.generation,
        pageCount: current.pageCount,
        text: current.iframe.contentDocument?.body.textContent ?? "",
        printIsPromise,
        framePrints: printObservation.frame,
        parentPrints: printObservation.parent,
      };
    });

    const exported = await page.evaluate(
      async (options) => {
        type EpubExportOptions = {
          metadata: {
            title: string;
            language: string;
            identifier: string;
            modified?: string;
          };
        };
        type Handle = {
          exportEpub(nextOptions: EpubExportOptions): Promise<Blob>;
        };
        const observation = (
          globalThis as { imposiaReactObservation: { handle: Handle | undefined } }
        ).imposiaReactObservation;
        const handle = observation.handle;
        if (handle === undefined) throw new Error("React fixture lost the imperative handle.");
        const blob = await handle.exportEpub(options);
        const signature = [...new Uint8Array(await blob.slice(0, 4).arrayBuffer())];
        return {
          isBlob: blob instanceof Blob,
          type: blob.type,
          size: blob.size,
          signature,
        };
      },
      { metadata },
    );

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setSource: ((source: { html: string }) => void) | undefined;
          };
        }
      ).imposiaReactObservation;
      if (observation.setSource === undefined)
        throw new Error("React fixture cannot update its source.");
      observation.setSource({
        html: "<h1>Updated React handle document</h1><p>Second generation</p>",
      });
    });
    await expect(page.locator(".react-adapter-host[data-imposia-generation='2']")).toHaveCount(1);

    const updated = await page.evaluate(async () => {
      type PageDocumentView = {
        iframe: HTMLIFrameElement;
        generation: number;
      };
      type Handle = {
        readonly current: PageDocumentView | undefined;
        print(): Promise<void>;
      };
      type Observation = { handle: Handle | undefined };
      const observation = (globalThis as { imposiaReactObservation: Observation })
        .imposiaReactObservation;
      const handle = observation.handle;
      if (handle === undefined || handle.current === undefined) {
        throw new Error("React imperative handle lost its current document after update.");
      }
      observation.retainedHandle = handle;
      await handle.print();
      const printObservation = (
        globalThis as { reactHandlePrintObservation?: { frame: number; parent: number } }
      ).reactHandlePrintObservation;
      return {
        generation: handle.current.generation,
        text: handle.current.iframe.contentDocument?.body.textContent ?? "",
        sameFrame:
          handle.current.iframe ===
          (globalThis as { initialReactFrame?: HTMLIFrameElement }).initialReactFrame,
        framePrints: printObservation?.frame ?? 0,
        parentPrints: printObservation?.parent ?? 0,
      };
    });

    await page.evaluate(() => {
      const observation = (
        globalThis as { imposiaReactObservation: { unmount: (() => void) | undefined } }
      ).imposiaReactObservation;
      if (observation.unmount === undefined) throw new Error("React fixture cannot unmount.");
      observation.unmount();
    });
    await expect(page.locator(".react-adapter-host")).toHaveCount(0);

    const disposed = await page.evaluate(
      async (options) => {
        type EpubExportOptions = {
          metadata: {
            title: string;
            language: string;
            identifier: string;
            modified?: string;
          };
        };
        type Handle = {
          readonly current: unknown;
          print(): Promise<void>;
          exportEpub(nextOptions: EpubExportOptions): Promise<Blob>;
        };
        const observation = (
          globalThis as { imposiaReactObservation: { retainedHandle: Handle | undefined } }
        ).imposiaReactObservation;
        const handle = observation.retainedHandle;
        if (handle === undefined)
          throw new Error("React fixture did not retain its imperative handle.");
        const rejected = async (operation: () => Promise<unknown>): Promise<boolean> => {
          try {
            await operation();
            return false;
          } catch {
            return true;
          }
        };
        return {
          currentUndefined: handle.current === undefined,
          printRejected: await rejected(() => handle.print()),
          exportRejected: await rejected(() => handle.exportEpub(options)),
        };
      },
      { metadata },
    );

    await page.evaluate(() => {
      (globalThis as { reactHandlePrintRestore?: () => void }).reactHandlePrintRestore?.();
    });

    expect(initial.generation).toBe(1);
    expect(initial.pageCount).toBeGreaterThan(0);
    expect(initial.text).toContain("Initial page");
    expect(initial.printIsPromise).toBe(true);
    expect(initial.framePrints).toBe(0);
    expect(initial.parentPrints).toBe(1);
    expect(exported.isBlob).toBe(true);
    expect(exported.type).toBe("application/epub+zip");
    expect(exported.size).toBeGreaterThan(100);
    expect(exported.signature).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(updated.generation).toBe(2);
    expect(updated.text).toContain("Second generation");
    expect(updated.sameFrame).toBe(true);
    expect(updated.framePrints).toBe(0);
    expect(updated.parentPrints).toBe(2);
    expect(disposed).toEqual({
      currentUndefined: true,
      printRejected: true,
      exportRejected: true,
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
