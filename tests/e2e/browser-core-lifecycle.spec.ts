import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("prints the newest canonical iframe and preserves current after a failed update", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type DocumentResult = {
        iframe: HTMLIFrameElement;
        pages: readonly { bodyText: readonly string[] }[];
        generation: number;
      };
      type Controller = {
        ready: Promise<DocumentResult>;
        current: DocumentResult | undefined;
        update(source: { html: string } | { lightDom: Element }): Promise<DocumentResult>;
        print(): Promise<void>;
        destroy(): Promise<void>;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      let controller: Controller | undefined;
      try {
        const core = (await import("/packages/core/dist/index.js")) as {
          mountPageDocument(
            container: HTMLElement,
            source: { html: string },
            options: Record<string, never>,
          ): Controller;
        };
        controller = core.mountPageDocument(host, { html: "<p>initial</p>" }, {});
        const initial = await controller.ready;
        const canonicalWindow = initial.iframe.contentWindow;
        if (canonicalWindow === null) throw new Error("Missing canonical iframe window.");
        let canonicalPrintCalls = 0;
        let parentPrintCalls = 0;
        const originalCanonicalPrint = canonicalWindow.print;
        const originalParentPrint = window.print;
        Object.defineProperty(canonicalWindow, "print", {
          configurable: true,
          writable: true,
          value: () => {
            canonicalPrintCalls += 1;
          },
        });
        Object.defineProperty(window, "print", {
          configurable: true,
          writable: true,
          value: () => {
            parentPrintCalls += 1;
          },
        });
        const stalePromise = controller.update({ html: "<p>stale</p>" });
        const printPromise = controller.print();
        const winningPromise = controller.update({ html: "<p>winner</p>" });
        const stale = await stalePromise.then(
          () => ({ status: "fulfilled" as const }),
          (error: unknown) => ({
            status: "rejected" as const,
            name: error instanceof DOMException ? error.name : "unknown",
          }),
        );
        const winning = await winningPromise;
        try {
          await printPromise;
          const failed = await controller.update({ lightDom: {} as Element }).then(
            () => ({ status: "fulfilled" as const }),
            (error: unknown) => ({
              status: "rejected" as const,
              name: error instanceof TypeError ? "TypeError" : "unknown",
            }),
          );
          const preserved = controller.current === winning;
          await controller.print();
          return {
            stale,
            winningGeneration: winning.generation,
            winningText: [...winning.pages[0].bodyText],
            failed,
            preserved,
            canonicalPrintCalls,
            parentPrintCalls,
            frameCount: host.querySelectorAll("iframe").length,
          };
        } finally {
          Object.defineProperty(canonicalWindow, "print", {
            configurable: true,
            writable: true,
            value: originalCanonicalPrint,
          });
          Object.defineProperty(window, "print", {
            configurable: true,
            writable: true,
            value: originalParentPrint,
          });
        }
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.stale).toEqual({ status: "rejected", name: "AbortError" });
    expect(observation.winningGeneration).toBe(2);
    expect(observation.winningText).toContain("winner");
    expect(observation.failed).toEqual({ status: "rejected", name: "TypeError" });
    expect(observation.preserved).toBe(true);
    expect(observation.canonicalPrintCalls).toBe(2);
    expect(observation.parentPrintCalls).toBe(0);
    expect(observation.frameCount).toBe(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps failed initial generations atomic and rejects print without current", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: { onProgress?: () => void },
        ): {
          ready: Promise<unknown>;
          current: unknown;
          print(): Promise<void>;
          destroy(): Promise<void>;
        };
      };
      const progressHost = document.createElement("div");
      document.body.append(progressHost);
      let progressCalls = 0;
      const progressController = core.mountPageDocument(
        progressHost,
        { html: "<p>old committed page</p>" },
        {
          onProgress: () => {
            progressCalls += 1;
            if (progressCalls === 2) throw new Error("progress callback failed");
          },
        },
      );
      const progressReady = await progressController.ready;
      const progressFrame = progressHost.querySelector("iframe");
      const progressDocument = progressFrame?.contentDocument;
      const oldFrameText = progressDocument?.body.textContent ?? "";
      let progressError = "";
      try {
        await progressController.update({ html: "<p>new page must not commit</p>" });
      } catch (error: unknown) {
        progressError = error instanceof Error ? error.message : "unknown";
      }

      const initialHost = document.createElement("div");
      document.body.append(initialHost);
      const initialController = core.mountPageDocument(
        initialHost,
        { lightDom: {} as Element } as { html: string },
        {},
      );
      let initialError = "";
      try {
        await initialController.ready;
      } catch (error: unknown) {
        initialError = error instanceof TypeError ? "TypeError" : "unknown";
      }
      let printError = "";
      try {
        await initialController.print();
      } catch (error: unknown) {
        printError = error instanceof TypeError ? "TypeError" : "unknown";
      }
      const result = {
        progressError,
        progressCurrentSame: progressController.current === progressReady,
        progressFrameText: progressDocument?.body.textContent ?? "",
        oldFrameText,
        progressPageText: progressDocument?.querySelector("[data-imposia-page-flow]")?.textContent,
        initialError,
        initialCurrent: initialController.current === undefined,
        printError,
      };
      await progressController.destroy();
      await initialController.destroy();
      return result;
    });

    expect(observation.progressError).toBe("progress callback failed");
    expect(observation.progressCurrentSame).toBe(true);
    expect(observation.progressFrameText).toBe(observation.oldFrameText);
    expect(observation.progressPageText).toContain("old committed page");
    expect(observation.initialError).toBe("TypeError");
    expect(observation.initialCurrent).toBe(true);
    expect(observation.printError).toBe("TypeError");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
