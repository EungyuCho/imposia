import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("React adapter updates the canonical iframe, reports failures, and cleans up on unmount", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical page presentation is Chromium-reference only.");
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
    expect(failed.states).toEqual(["loading", "ready", "loading", "ready", "loading", "error"]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React source revisions reprocess identical HTML in the same canonical iframe", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical page presentation is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(".react-adapter-host iframe");
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
          document.querySelector(".react-adapter-host iframe"),
      ),
    ).toBe(true);
    await expect(host.locator("iframe").contentFrame().locator("body")).toContainText(
      "Initial page",
    );
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React document option revisions replace the controller with the new configuration", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical page presentation is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(".react-adapter-host iframe");
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

    await expect(host.locator("iframe").contentFrame().locator("body")).toContainText(
      "Options revision applied",
    );
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaOptionsRevisionFrame") !==
          document.querySelector(".react-adapter-host iframe"),
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
  test.skip(browserName !== "chromium", "Canonical page presentation is Chromium-reference only.");
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
    expect(initial.framePrints).toBe(1);
    expect(initial.parentPrints).toBe(0);
    expect(exported.isBlob).toBe(true);
    expect(exported.type).toBe("application/epub+zip");
    expect(exported.size).toBeGreaterThan(100);
    expect(exported.signature).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(updated.generation).toBe(2);
    expect(updated.text).toContain("Second generation");
    expect(updated.sameFrame).toBe(true);
    expect(updated.framePrints).toBe(2);
    expect(updated.parentPrints).toBe(0);
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
