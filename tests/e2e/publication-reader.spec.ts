import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type ReaderFixture = {
  controller: { destroy(): Promise<void> };
  viewer: { destroy(): void };
  host: HTMLElement;
};

async function installReaderFixture(
  page: import("@playwright/test").Page,
  hostWidth?: string,
): Promise<void> {
  await page.goto("/examples/book.html");
  await page.evaluate(async (width) => {
    const importMap = document.createElement("script");
    importMap.type = "importmap";
    importMap.textContent = JSON.stringify({
      imports: {
        "@imposia/core": "/packages/core/dist/index.js",
        "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
      },
    });
    document.head.append(importMap);
    const core = await import("/packages/core/dist/index.js");
    const viewerModule = await import("/packages/viewer/dist/index.js");
    const host = document.createElement("div");
    if (width !== undefined) host.style.width = width;
    document.body.replaceChildren(host);
    const controller = core.mountPublication(host, {
      metadata: { title: "Reader fixture" },
      entries: [
        {
          id: "opening",
          title: "Opening",
          html: '<h1 id="welcome">Welcome</h1><h2 id="context">Context</h2>',
        },
        {
          id: "chapter",
          title: "Chapter",
          html: [
            '<h1 id="main" style="break-before: page">Main chapter</h1>',
            '<h2 id="detail">Deep detail</h2>',
          ].join(""),
        },
      ],
    });
    const publication = await controller.ready;
    const deepLinks: Array<string | undefined> = [];
    const viewer = viewerModule.mountPageViewer(host, publication, {
      mode: "single",
      reader: {
        controller,
        onDeepLinkChange: (value: string | undefined) => deepLinks.push(value),
      },
    });
    (
      window as Window & {
        __publicationReaderFixture?: ReaderFixture & {
          publication: typeof publication;
          deepLinks: Array<string | undefined>;
        };
      }
    ).__publicationReaderFixture = { controller, viewer, host, publication, deepLinks };
  }, hostWidth);
}

async function removeReaderFixture(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const browserWindow = window as Window & { __publicationReaderFixture?: ReaderFixture };
    const fixture = browserWindow.__publicationReaderFixture;
    fixture?.viewer.destroy();
    await fixture?.controller.destroy();
    fixture?.host.remove();
    delete browserWindow.__publicationReaderFixture;
  });
}

test("projects the immutable outline as a hierarchical keyboard-accessible TOC", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installReaderFixture(page);
  try {
    const opener = page.getByRole("button", { name: "Contents" });
    const toc = page.getByRole("navigation", { name: "Publication table of contents" });
    await expect(opener).toHaveAttribute("aria-expanded", "false");
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    await expect(toc).toBeVisible();
    await expect(toc.locator(":scope > ol > li")).toHaveCount(2);
    await expect(toc.locator(":scope > ol > li").first().locator(":scope > ol > li")).toHaveCount(
      1,
    );
    await expect(toc.getByRole("button").first()).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(toc.getByRole("button", { name: "Welcome" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(toc.getByRole("button", { name: "Deep detail" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(toc.getByRole("button", { name: "Opening" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toc).toBeHidden();
    await expect(opener).toBeFocused();

    await page.keyboard.press("Enter");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(toc).toBeHidden();
    await expect(page.locator('iframe[data-imposia-frame="page-document"]')).toBeFocused();

    const observation = await page.evaluate(() => {
      const fixture = (
        window as Window & {
          __publicationReaderFixture?: ReaderFixture & {
            viewer: {
              reader?: {
                navigate(destination: unknown): void;
                readonly state: {
                  destination?: { id: string; page: number };
                  deepLink?: string;
                };
              };
              readonly state: { page: number };
            };
            publication: { iframe: HTMLIFrameElement; outline: readonly unknown[] };
            deepLinks: Array<string | undefined>;
          };
        }
      ).__publicationReaderFixture;
      if (fixture?.viewer.reader === undefined) throw new Error("Reader fixture is unavailable.");
      const tocState = {
        destination: fixture.viewer.reader.state.destination,
        deepLink: fixture.viewer.reader.state.deepLink,
        page: fixture.viewer.state.page,
      };
      const destination = fixture.viewer.reader.state.destination;
      if (destination === undefined) throw new Error("TOC did not select a destination.");
      fixture.viewer.reader.navigate(destination);
      return {
        tocState,
        publicState: {
          destination: fixture.viewer.reader.state.destination,
          deepLink: fixture.viewer.reader.state.deepLink,
          page: fixture.viewer.state.page,
        },
        callbacks: fixture.deepLinks,
        canonicalIdentity:
          fixture.host.querySelector('iframe[data-imposia-frame="page-document"]') ===
          fixture.publication.iframe,
        canonicalFrames: fixture.host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
          .length,
        canvases: fixture.host.querySelectorAll("canvas").length,
      };
    });
    expect(observation.tocState.destination?.id).toContain("id-detail");
    expect(observation.tocState).toEqual(observation.publicState);
    expect(observation.callbacks).toEqual([
      observation.tocState.deepLink,
      observation.tocState.deepLink,
    ]);
    expect(observation.canonicalIdentity).toBe(true);
    expect(observation.canonicalFrames).toBe(1);
    expect(observation.canvases).toBe(0);
  } finally {
    await removeReaderFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("restores URL-safe links against the current generation and rejects stale destinations", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installReaderFixture(page);
  try {
    const observation = await page.evaluate(async () => {
      const viewerModule = await import("/packages/viewer/dist/index.js");
      const fixture = (
        window as Window & {
          __publicationReaderFixture?: ReaderFixture & {
            controller: {
              resolveDestination(
                id: string,
              ): { id: string; entryId: string; page: number; generation: number } | undefined;
              update(snapshot: unknown): Promise<{
                iframe: HTMLIFrameElement;
                generation: number;
              }>;
            };
            viewer: {
              refresh(document: unknown): void;
              reader?: {
                navigate(destination: unknown): void;
                restoreDeepLink(
                  value: string,
                ): { id: string; page: number; generation: number } | undefined;
                readonly state: {
                  destination?: { id: string; page: number; generation: number };
                  deepLink?: string;
                };
              };
            };
            publication: { iframe: HTMLIFrameElement };
            deepLinks: Array<string | undefined>;
          };
        }
      ).__publicationReaderFixture;
      if (fixture?.viewer.reader === undefined) throw new Error("Reader fixture is unavailable.");
      const oldDestination = fixture.controller.resolveDestination(
        "imposia-entry-chapter--id-detail",
      );
      if (oldDestination === undefined) throw new Error("Missing destination.");
      const link = viewerModule.serializePublicationDeepLink(oldDestination);
      const firstRestore = fixture.viewer.reader.restoreDeepLink(link);
      fixture.viewer.reader.openTableOfContents();
      fixture.host
        .querySelector<HTMLButtonElement>(`[data-destination-id="${oldDestination.id}"]`)
        ?.focus();
      const updated = await fixture.controller.update({
        metadata: { title: "Reader fixture updated" },
        entries: [
          {
            id: "chapter",
            title: "Chapter updated",
            html: '<h1 id="main">Main updated</h1><h2 id="detail" style="break-before: page">Deep detail updated</h2>',
          },
        ],
      });
      fixture.viewer.refresh(updated);
      const focusAfterRefresh =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.dataset.destinationId
          : undefined;
      fixture.viewer.reader.toggleTableOfContents();
      const toggleReturnedFocus =
        document.activeElement === fixture.host.querySelector(".imposia-toc-toggle");
      const beforeStale = {
        state: fixture.viewer.reader.state,
        callbacks: fixture.deepLinks.length,
      };
      let staleCode: string | undefined;
      try {
        fixture.viewer.reader.navigate(oldDestination);
      } catch (error) {
        staleCode = (error as { code?: string }).code;
      }
      const afterStale = {
        state: fixture.viewer.reader.state,
        callbacks: fixture.deepLinks.length,
      };
      const currentRestore = fixture.viewer.reader.restoreDeepLink(link);
      const malformed = fixture.viewer.reader.restoreDeepLink("v1.%not-encoded");
      const callbacksBeforeRemoval = fixture.deepLinks.length;
      const removed = await fixture.controller.update({
        metadata: { title: "Destination removed" },
        entries: [{ id: "other", title: "Other", html: "<h1>Other destination</h1>" }],
      });
      fixture.viewer.refresh(removed);
      return {
        link,
        firstRestore,
        staleCode,
        beforeStale,
        afterStale,
        currentRestore,
        malformed,
        focusAfterRefresh,
        toggleReturnedFocus,
        clearedState: fixture.viewer.reader.state,
        clearCallback: fixture.deepLinks.at(-1),
        callbacksBeforeRemoval,
        callbacksAfterRemoval: fixture.deepLinks.length,
        canonicalIdentity: updated.iframe === fixture.publication.iframe,
        canonicalFrames: fixture.host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
          .length,
      };
    });
    expect(observation.link).toMatch(/^v1\.[^\s/?#]+$/u);
    expect(observation.firstRestore?.generation).toBe(1);
    expect(observation.staleCode).toBe("STALE_PUBLICATION_DESTINATION");
    expect(observation.afterStale).toEqual(observation.beforeStale);
    expect(observation.currentRestore?.generation).toBe(2);
    expect(observation.currentRestore?.id).toBe(observation.firstRestore?.id);
    expect(observation.malformed).toBeUndefined();
    expect(observation.focusAfterRefresh).toBe(observation.firstRestore?.id);
    expect(observation.toggleReturnedFocus).toBe(true);
    expect(observation.clearedState.destination).toBeUndefined();
    expect(observation.clearedState.deepLink).toBeUndefined();
    expect(observation.clearCallback).toBeUndefined();
    expect(observation.callbacksAfterRemoval).toBe(observation.callbacksBeforeRemoval + 1);
    expect(observation.canonicalIdentity).toBe(true);
    expect(observation.canonicalFrames).toBe(1);
  } finally {
    await removeReaderFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("rejects invalid Reader ownership before mutating the Viewer host", async ({
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
      const [core, viewerModule] = await Promise.all([
        import("/packages/core/dist/index.js"),
        import("/packages/viewer/dist/index.js"),
      ]);
      const firstHost = document.body.appendChild(document.createElement("div"));
      const secondHost = document.body.appendChild(document.createElement("div"));
      const firstController = core.mountPublication(firstHost, {
        metadata: { title: "First" },
        entries: [{ id: "first", title: "First", html: "<h1>First</h1>" }],
      });
      const secondController = core.mountPublication(secondHost, {
        metadata: { title: "Second" },
        entries: [{ id: "second", title: "Second", html: "<h1>Second</h1>" }],
      });
      try {
        const [first, second] = await Promise.all([firstController.ready, secondController.ready]);
        const original = {
          hostClass: firstHost.getAttribute("class"),
          hostLabel: firstHost.getAttribute("aria-label"),
          iframeClass: first.iframe.getAttribute("class"),
          iframeTitle: first.iframe.getAttribute("title"),
        };
        let rejected = false;
        try {
          viewerModule.mountPageViewer(firstHost, first, {
            reader: { controller: secondController },
          });
        } catch {
          rejected = true;
        }
        let callbackRejected = false;
        const initialDeepLink = viewerModule.serializePublicationDeepLink(
          first.outline[0].destination,
        );
        try {
          viewerModule.mountPageViewer(firstHost, first, {
            reader: {
              controller: firstController,
              initialDeepLink,
              onDeepLinkChange: () => {
                throw new Error("Consumer callback failure.");
              },
            },
          });
        } catch {
          callbackRejected = true;
        }
        const randomUuidDescriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
        Object.defineProperty(crypto, "randomUUID", {
          configurable: true,
          value: undefined,
        });
        let insecureCompatible = false;
        let callbackNavigateRejected = false;
        let selectionClosed = false;
        let selectionFocusedFrame = false;
        try {
          const readerViewer = viewerModule.mountPageViewer(firstHost, first, {
            reader: {
              controller: firstController,
              onDeepLinkChange: () => {
                throw new Error("Post-mount callback failure.");
              },
            },
          });
          insecureCompatible = readerViewer.reader !== undefined;
          readerViewer.reader?.openTableOfContents();
          try {
            readerViewer.reader?.navigate(first.outline[0].destination);
          } catch {
            callbackNavigateRejected = true;
          }
          selectionClosed = readerViewer.reader?.state.tocOpen === false;
          selectionFocusedFrame = document.activeElement === first.iframe;
          readerViewer.destroy();
        } finally {
          if (randomUuidDescriptor !== undefined) {
            Object.defineProperty(crypto, "randomUUID", randomUuidDescriptor);
          } else Reflect.deleteProperty(crypto, "randomUUID");
        }
        let ownedPublication = first;
        const delegatedController = {
          ready: firstController.ready,
          get current() {
            return ownedPublication;
          },
          resolveDestination: firstController.resolveDestination.bind(firstController),
          navigate: firstController.navigate.bind(firstController),
          update: firstController.update.bind(firstController),
          print: firstController.print.bind(firstController),
          destroy: firstController.destroy.bind(firstController),
        };
        const refreshViewer = viewerModule.mountPageViewer(firstHost, first, {
          reader: { controller: delegatedController },
        });
        const updatedFirst = await firstController.update({
          metadata: { title: "First updated" },
          entries: [{ id: "first", title: "First", html: "<h1>First updated</h1>" }],
        });
        ownedPublication = undefined as unknown as typeof first;
        const beforeInvalidRefresh = refreshViewer.state;
        let refreshRejected = false;
        try {
          refreshViewer.refresh(updatedFirst);
        } catch {
          refreshRejected = true;
        }
        const invalidRefreshAtomic =
          JSON.stringify(refreshViewer.state) === JSON.stringify(beforeInvalidRefresh);
        refreshViewer.destroy();
        const clearViewer = viewerModule.mountPageViewer(firstHost, updatedFirst, {
          reader: {
            controller: firstController,
            onDeepLinkChange: (value: string | undefined) => {
              if (value === undefined) throw new Error("Clear callback failure.");
            },
          },
        });
        const selected = firstController.resolveDestination("imposia-entry-first");
        if (selected === undefined) throw new Error("Updated destination is unavailable.");
        clearViewer.reader?.navigate(selected);
        const removedFirst = await firstController.update({
          metadata: { title: "First removed" },
          entries: [{ id: "other", title: "Other", html: "<h1>Other</h1>" }],
        });
        let clearCallbackRejected = false;
        try {
          clearViewer.refresh(removedFirst);
        } catch {
          clearCallbackRejected = true;
        }
        const clearRefreshSynchronized =
          clearViewer.state.generation === removedFirst.generation &&
          firstHost.querySelector('[data-testid="page-indicator"]')?.textContent ===
            `${clearViewer.state.page} / ${clearViewer.state.pageCount}`;
        clearViewer.destroy();
        return {
          rejected,
          callbackRejected,
          insecureCompatible,
          callbackNavigateRejected,
          selectionClosed,
          selectionFocusedFrame,
          refreshRejected,
          invalidRefreshAtomic,
          clearCallbackRejected,
          clearRefreshSynchronized,
          original,
          after: {
            hostClass: firstHost.getAttribute("class"),
            hostLabel: firstHost.getAttribute("aria-label"),
            iframeClass: first.iframe.getAttribute("class"),
            iframeTitle: first.iframe.getAttribute("title"),
          },
          sameFrame: firstHost.firstElementChild === first.iframe,
          rails: firstHost.querySelectorAll(".imposia-rail").length,
          panels: firstHost.querySelectorAll(".imposia-toc-panel").length,
          secondCurrent: secondController.current === second,
        };
      } finally {
        await Promise.all([firstController.destroy(), secondController.destroy()]);
        firstHost.remove();
        secondHost.remove();
      }
    });
    expect(observation.rejected).toBe(true);
    expect(observation.callbackRejected).toBe(true);
    expect(observation.insecureCompatible).toBe(true);
    expect(observation.callbackNavigateRejected).toBe(true);
    expect(observation.selectionClosed).toBe(true);
    expect(observation.selectionFocusedFrame).toBe(true);
    expect(observation.refreshRejected).toBe(true);
    expect(observation.invalidRefreshAtomic).toBe(true);
    expect(observation.clearCallbackRejected).toBe(true);
    expect(observation.clearRefreshSynchronized).toBe(true);
    expect(observation.after).toEqual(observation.original);
    expect(observation.sameFrame).toBe(true);
    expect(observation.rails).toBe(0);
    expect(observation.panels).toBe(0);
    expect(observation.secondCurrent).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("positions the TOC below a container-responsive mobile toolbar", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.setViewportSize({ width: 1000, height: 800 });
  await installReaderFixture(page, "600px");
  try {
    await page.getByRole("button", { name: "Contents" }).click();
    const geometry = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(".imposia-page-viewer .imposia-rail");
      const panel = document.querySelector<HTMLElement>(".imposia-toc-panel");
      if (rail === null || panel === null) throw new Error("Reader geometry is unavailable.");
      const railRect = rail.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        railBottom: railRect.bottom,
        panelTop: panelRect.top,
        panelBottom: panelRect.bottom,
        viewportHeight: innerHeight,
      };
    });
    expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.railBottom - 1);
    expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  } finally {
    await removeReaderFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
