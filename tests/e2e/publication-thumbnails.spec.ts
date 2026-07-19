import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type ThumbnailSnapshot = {
  readonly metadata: { readonly title: string };
  readonly entries: readonly [
    {
      readonly id: string;
      readonly title: string;
      readonly html: string;
    },
  ];
};

function thumbnailSnapshot(title: string, pageCount: number): ThumbnailSnapshot {
  return {
    metadata: { title },
    entries: [
      {
        id: "long-entry",
        title: "Long entry",
        html: Array.from({ length: pageCount }, (_, index) => {
          const number = index + 1;
          const breakStyle = index === 0 ? "" : ' style="break-before: page"';
          return `<section${breakStyle}><h1>Preview page ${number}</h1><p>Committed text block ${number}</p></section>`;
        }).join(""),
      },
    ],
  };
}

const INITIAL_SNAPSHOT = thumbnailSnapshot("Large thumbnail fixture", 48);
const UPDATED_SNAPSHOT = thumbnailSnapshot("Updated thumbnail fixture", 20);

async function installThumbnailFixture(
  page: import("@playwright/test").Page,
  width = "960px",
): Promise<void> {
  await page.goto("/examples/book.html");
  await page.evaluate(
    async ({ snapshot, width }) => {
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
        document.head.append(viewerStyles);
      });
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "@imposia/viewer": "/packages/viewer/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const client = await import("/packages/client/dist/index.js");
      const viewerModule = await import("/packages/viewer/dist/index.js");
      if (client.mountPageViewer !== viewerModule.mountPageViewer) {
        throw new Error("Client wrapped the Viewer thumbnail surface.");
      }
      const host = document.createElement("div");
      host.style.width = width;
      host.style.height = "760px";
      document.body.replaceChildren(host);
      const controller = client.mountPublication(host, snapshot, {
        page: { size: { width: "360px", height: "420px" }, margin: "32px" },
      });
      const publication = await controller.ready;
      const viewer = client.mountPageViewer(host, publication, {
        mode: "single",
        reader: { controller },
      });
      Reflect.set(globalThis, "__publicationThumbnailFixture", {
        controller,
        viewer,
        host,
        publication,
      });
    },
    { snapshot: INITIAL_SNAPSHOT, width },
  );
}

async function removeThumbnailFixture(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const fixture = Reflect.get(globalThis, "__publicationThumbnailFixture") as
      | {
          viewer: { destroy(): void };
          controller: { destroy(): Promise<void> };
          host: HTMLElement;
        }
      | undefined;
    fixture?.viewer.destroy();
    await fixture?.controller.destroy();
    fixture?.host.remove();
    Reflect.deleteProperty(globalThis, "__publicationThumbnailFixture");
  });
}

test("previews and navigates a large committed Publication without another layout authority", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installThumbnailFixture(page);
  try {
    const opener = page.getByRole("button", { name: "Page thumbnails" });
    await expect(opener).toBeVisible();
    await opener.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("navigation", { name: "Publication page thumbnails" });
    await expect(panel).toBeVisible();
    const buttons = panel.locator(".imposia-thumbnail-button");
    await expect(buttons).toHaveCount(48);
    await expect(buttons.first()).toHaveAttribute("aria-current", "page");
    await expect(buttons.first()).toBeFocused();
    await expect(buttons.nth(36)).toHaveAttribute("aria-label", "Go to page 37");
    expect(await panel.locator(".imposia-thumbnail-preview-line").count()).toBeLessThanOrEqual(
      48 * 6,
    );
    expect(
      await buttons.evaluateAll((items) =>
        Math.max(
          ...items.map((item) => item.querySelectorAll(".imposia-thumbnail-preview-line").length),
        ),
      ),
    ).toBeLessThanOrEqual(6);
    const renderedRatio = await buttons
      .first()
      .locator(".imposia-thumbnail-preview")
      .evaluate((preview) => {
        const bounds = preview.getBoundingClientRect();
        return bounds.width / bounds.height;
      });
    expect(renderedRatio).toBeCloseTo(360 / 420, 2);
    await page.keyboard.press("End");
    await expect(buttons.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(buttons.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(buttons.nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
    await page.keyboard.press("Enter");

    const initial = await page.evaluate(() => {
      type Thumbnail = {
        readonly page: number;
        readonly generation: number;
        readonly widthCssPx: number;
        readonly heightCssPx: number;
        readonly previewLineCount: number;
      };
      const fixture = Reflect.get(globalThis, "__publicationThumbnailFixture") as {
        controller: { current: { iframe: HTMLIFrameElement; pageCount: number } };
        publication: { iframe: HTMLIFrameElement; pageCount: number };
        viewer: {
          reader: {
            readonly state: { thumbnails: readonly Thumbnail[]; thumbnailsOpen: boolean };
            selectThumbnail(thumbnail: Thumbnail): void;
          };
          readonly state: { page: number; pageCount: number };
        };
        host: HTMLElement;
      };
      const thumbnails = fixture.viewer.reader.state.thumbnails;
      return {
        pageCount: fixture.publication.pageCount,
        thumbnailCount: thumbnails.length,
        frozen:
          Object.isFrozen(thumbnails) &&
          thumbnails.every((thumbnail) => Object.isFrozen(thumbnail)),
        pages: thumbnails.map((thumbnail) => thumbnail.page),
        generations: [...new Set(thumbnails.map((thumbnail) => thumbnail.generation))],
        bounded: thumbnails.every(
          (thumbnail) =>
            thumbnail.widthCssPx > 0 &&
            thumbnail.heightCssPx > 0 &&
            thumbnail.previewLineCount >= 0 &&
            thumbnail.previewLineCount <= 6,
        ),
        canonicalIdentity: fixture.controller.current.iframe === fixture.publication.iframe,
        canonicalFrames: fixture.host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
          .length,
        stagingFrames: fixture.host.querySelectorAll(
          'iframe[data-imposia-frame="page-document-staging"]',
        ).length,
        canonicalPages:
          fixture.publication.iframe.contentDocument?.querySelectorAll("[data-imposia-page]")
            .length,
      };
    });
    expect(initial.pageCount).toBe(48);
    expect(initial.thumbnailCount).toBe(48);
    expect(initial.frozen).toBe(true);
    expect(initial.pages).toEqual(Array.from({ length: 48 }, (_, index) => index + 1));
    expect(initial.generations).toEqual([1]);
    expect(initial.bounded).toBe(true);
    expect(initial.canonicalIdentity).toBe(true);
    expect(initial.canonicalFrames).toBe(1);
    expect(initial.stagingFrames).toBe(0);
    expect(initial.canonicalPages).toBe(48);

    await buttons.nth(36).focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    await expect(page.locator('iframe[data-imposia-frame="page-document"]')).toBeFocused();
    expect(
      await page.evaluate(() => {
        const fixture = Reflect.get(globalThis, "__publicationThumbnailFixture") as {
          viewer: { readonly state: { page: number } };
        };
        return fixture.viewer.state.page;
      }),
    ).toBe(37);
    await opener.focus();
    await page.keyboard.press("Space");
    await expect(buttons.nth(36)).toHaveAttribute("aria-current", "page");
    await expect(buttons.nth(36)).toBeFocused();

    await page.getByRole("button", { name: "Search publication" }).click();
    await expect(panel).toBeHidden();
    await opener.click();
    await page.getByRole("button", { name: "Contents" }).click();
    await expect(panel).toBeHidden();
    await page.keyboard.press("Escape");

    const updated = await page.evaluate(async (snapshot) => {
      type Thumbnail = {
        readonly page: number;
        readonly generation: number;
        readonly widthCssPx: number;
        readonly heightCssPx: number;
        readonly previewLineCount: number;
      };
      const fixture = Reflect.get(globalThis, "__publicationThumbnailFixture") as {
        controller: {
          update(next: typeof snapshot): Promise<{ iframe: HTMLIFrameElement; pageCount: number }>;
        };
        publication: { iframe: HTMLIFrameElement };
        viewer: {
          refresh(document: { iframe: HTMLIFrameElement; pageCount: number }): void;
          reader: {
            readonly state: { thumbnails: readonly Thumbnail[] };
            selectThumbnail(thumbnail: Thumbnail): void;
          };
          readonly state: { page: number; pageCount: number; generation: number };
        };
        host: HTMLElement;
      };
      const oldThumbnail = fixture.viewer.reader.state.thumbnails[36];
      const oldButton = fixture.host.querySelector<HTMLButtonElement>(
        '.imposia-thumbnail-button[data-page="37"]',
      );
      if (oldThumbnail === undefined || oldButton === null) {
        throw new Error("Old thumbnail fixture is unavailable.");
      }
      const next = await fixture.controller.update(snapshot);
      fixture.viewer.refresh(next);
      let staleMessage: string | undefined;
      try {
        fixture.viewer.reader.selectThumbnail(oldThumbnail);
      } catch (error: unknown) {
        staleMessage = error instanceof Error ? error.message : String(error);
      }
      const current = fixture.viewer.reader.state.thumbnails;
      fixture.viewer.reader.selectThumbnail(current[19] as Thumbnail);
      return {
        staleMessage,
        thumbnailCount: current.length,
        generations: [...new Set(current.map((thumbnail) => thumbnail.generation))],
        oldButtonConnected: oldButton.isConnected,
        page: fixture.viewer.state.page,
        pageCount: fixture.viewer.state.pageCount,
        canonicalIdentity: next.iframe === fixture.publication.iframe,
        canonicalFrames: fixture.host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
          .length,
        stagingFrames: fixture.host.querySelectorAll(
          'iframe[data-imposia-frame="page-document-staging"]',
        ).length,
        canonicalPages: next.iframe.contentDocument?.querySelectorAll("[data-imposia-page]").length,
      };
    }, UPDATED_SNAPSHOT);
    expect(updated).toEqual({
      staleMessage: "Publication thumbnail does not belong to the current committed generation.",
      thumbnailCount: 20,
      generations: [2],
      oldButtonConnected: false,
      page: 20,
      pageCount: 20,
      canonicalIdentity: true,
      canonicalFrames: 1,
      stagingFrames: 0,
      canonicalPages: 20,
    });
    await opener.click();
    await expect(buttons).toHaveCount(20);
  } finally {
    await removeThumbnailFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("destroy releases thumbnail state, controls, listeners, and preview subtrees", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installThumbnailFixture(page);
  try {
    const observation = await page.evaluate(() => {
      type Thumbnail = { readonly page: number; readonly generation: number };
      const fixture = Reflect.get(globalThis, "__publicationThumbnailFixture") as {
        viewer: {
          destroy(): void;
          reader: {
            openThumbnails(): void;
            closeThumbnails(): void;
            toggleThumbnails(): void;
            selectThumbnail(thumbnail: Thumbnail): void;
            readonly state: {
              thumbnailsOpen: boolean;
              thumbnails: readonly Thumbnail[];
            };
          };
        };
        host: HTMLElement;
      };
      const reader = fixture.viewer.reader;
      const oldThumbnail = reader.state.thumbnails[0];
      if (oldThumbnail === undefined) throw new Error("Destroy thumbnail fixture is unavailable.");
      reader.openThumbnails();
      const retainedPanel = fixture.host.querySelector<HTMLElement>(".imposia-thumbnail-panel");
      const retainedList =
        retainedPanel?.querySelector<HTMLOListElement>(".imposia-thumbnail-list");
      const retainedButton = retainedPanel?.querySelector<HTMLButtonElement>(
        ".imposia-thumbnail-button",
      );
      fixture.viewer.destroy();
      retainedButton?.click();
      const actions: Array<() => void> = [
        () => reader.openThumbnails(),
        () => reader.closeThumbnails(),
        () => reader.toggleThumbnails(),
        () => reader.selectThumbnail(oldThumbnail),
      ];
      const actionErrors = actions.map((action) => {
        try {
          action();
          return undefined;
        } catch (error: unknown) {
          return error instanceof Error ? error.message : String(error);
        }
      });
      return {
        actionErrors,
        state: {
          thumbnailsOpen: reader.state.thumbnailsOpen,
          thumbnails: reader.state.thumbnails.length,
        },
        controls: fixture.host.querySelectorAll(
          ".imposia-thumbnail-toggle,.imposia-thumbnail-panel",
        ).length,
        retainedPanelConnected: retainedPanel?.isConnected,
        retainedPanelChildren: retainedPanel?.childElementCount,
        retainedListChildren: retainedList?.childElementCount,
        retainedButtonConnected: retainedButton?.isConnected,
        rootThumbnailsOpen: fixture.host.dataset.thumbnailsOpen,
      };
    });
    expect(observation.actionErrors).toEqual(
      Array.from({ length: 4 }, () => "Publication reader has been destroyed."),
    );
    expect(observation.state).toEqual({ thumbnailsOpen: false, thumbnails: 0 });
    expect(observation.controls).toBe(0);
    expect(observation.retainedPanelConnected).toBe(false);
    expect(observation.retainedPanelChildren).toBe(0);
    expect(observation.retainedListChildren).toBe(0);
    expect(observation.retainedButtonConnected).toBe(false);
    expect(observation.rootThumbnailsOpen).toBeUndefined();
  } finally {
    await removeThumbnailFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("thumbnail panel remains reachable in a narrow Reader container", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Responsive thumbnail geometry is Chromium-reference only.",
  );
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installThumbnailFixture(page, "320px");
  try {
    const opener = page.getByRole("button", { name: "Page thumbnails" });
    await expect(opener).toBeVisible();
    await opener.click();
    const panel = page.getByRole("navigation", { name: "Publication page thumbnails" });
    await expect(panel).toBeVisible();
    await expect(panel.locator(".imposia-thumbnail-button").first()).toBeFocused();
    const geometry = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".imposia-page-viewer");
      const rail = root?.querySelector<HTMLElement>(".imposia-rail");
      const panel = root?.querySelector<HTMLElement>(".imposia-thumbnail-panel");
      if (root === null || root === undefined || rail === null || panel === null) {
        throw new Error("Narrow thumbnail geometry is unavailable.");
      }
      const rootBounds = root.getBoundingClientRect();
      const railBounds = rail.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      return {
        root: { left: rootBounds.left, right: rootBounds.right, bottom: rootBounds.bottom },
        railBottom: railBounds.bottom,
        panel: {
          left: panelBounds.left,
          right: panelBounds.right,
          top: panelBounds.top,
          bottom: panelBounds.bottom,
        },
        canonicalFrames: root.querySelectorAll('iframe[data-imposia-frame="page-document"]').length,
        canonicalPages: root
          .querySelector<HTMLIFrameElement>('iframe[data-imposia-frame="page-document"]')
          ?.contentDocument?.querySelectorAll("[data-imposia-page]").length,
      };
    });
    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.root.left);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.root.right);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.railBottom - 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.root.bottom + 1);
    expect(geometry.canonicalFrames).toBe(1);
    expect(geometry.canonicalPages).toBe(48);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
  } finally {
    await removeThumbnailFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React Publication handle exposes committed thumbnail navigation", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");
  try {
    const host = page.locator(".react-publication-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    const observation = await page.evaluate(() => {
      type Thumbnail = { readonly page: number; readonly generation: number };
      type Handle = {
        openThumbnails(): void;
        closeThumbnails(): void;
        toggleThumbnails(): void;
        getThumbnails(): readonly Thumbnail[];
        selectThumbnail(thumbnail: Thumbnail): void;
      };
      const root = document.querySelector<HTMLElement>(".react-publication-host");
      const handle = (
        globalThis as {
          imposiaPublicationObservation: { handle: Handle | undefined };
        }
      ).imposiaPublicationObservation.handle;
      if (root === null || handle === undefined) {
        throw new Error("React Publication thumbnail fixture is unavailable.");
      }
      const frame = root.querySelector<HTMLIFrameElement>(
        'iframe[data-imposia-frame="page-document"]',
      );
      const thumbnails = handle.getThumbnails();
      handle.openThumbnails();
      const opened = root.dataset.thumbnailsOpen;
      const thumbnail = thumbnails[0];
      if (thumbnail === undefined) throw new Error("React thumbnail is unavailable.");
      handle.selectThumbnail(thumbnail);
      handle.toggleThumbnails();
      handle.closeThumbnails();
      return {
        count: thumbnails.length,
        frozen: Object.isFrozen(thumbnails) && Object.isFrozen(thumbnail),
        generation: thumbnail.generation,
        rootGeneration: Number(root.dataset.imposiaGeneration),
        opened,
        closed: root.dataset.thumbnailsOpen,
        canonicalFrame: frame !== null && root.querySelectorAll("iframe").length === 1,
      };
    });
    expect(observation).toEqual({
      count: 1,
      frozen: true,
      generation: observation.rootGeneration,
      rootGeneration: observation.rootGeneration,
      opened: "true",
      closed: "false",
      canonicalFrame: true,
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
