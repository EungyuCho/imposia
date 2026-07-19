import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type SearchFixture = {
  controller: { destroy(): Promise<void> };
  viewer: { destroy(): void };
  host: HTMLElement;
};

const INITIAL_SNAPSHOT = {
  metadata: { title: "Search fixture" },
  entries: [
    {
      id: "opening",
      title: "Opening",
      html: [
        "<style>.concealed { display: none; } .token::before { content: 'style-token'; } [data-footnote] { float: footnote; }</style>",
        "<h1>Opening</h1>",
        "<p>Need<em>le</em></p>",
        "<p>line<br>break</p>",
        "<div>rule-first<hr>rule-second</div>",
        "<p>phantom</p><p>bridge</p>",
        '<p><span data-footnote-anchor="semantic-note">Note anchor.</span></p>',
        '<aside data-footnote="semantic-note">footnote-token</aside>',
        "<p hidden>cloak-token</p>",
        "<p inert>inert-token</p>",
        '<p aria-hidden="true">aria-token</p>',
        '<p class="concealed">css-token</p>',
        "<template>template-token</template>",
        "<script>globalThis.scriptToken = 'script-token'</script>",
      ].join(""),
    },
    {
      id: "chapter",
      title: "Chapter",
      html: [
        '<h1 style="break-before: page">Chapter</h1>',
        "<p>The chapter keeps another needle beside useful context.</p>",
      ].join(""),
    },
  ],
} as const;

async function installSearchFixture(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/examples/book.html");
  await page.evaluate(async (snapshot) => {
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
    const host = document.createElement("div");
    host.style.width = "960px";
    host.style.height = "760px";
    document.body.replaceChildren(host);
    const controller = client.mountPublication(host, snapshot, {
      page: { size: { width: "360px", height: "560px" }, margin: "32px" },
      experimental: { footnotes: true },
      headerTemplate:
        '<span data-imposia-publication-entry="0">decoration-token must stay out</span>',
    });
    const publication = await controller.ready;
    let navigateCalls = 0;
    const readerController = {
      ready: controller.ready,
      get current() {
        return controller.current;
      },
      resolveDestination: (id: string) => controller.resolveDestination(id),
      navigate(destination: unknown) {
        navigateCalls += 1;
        controller.navigate(destination);
      },
      search: (query: string) => controller.search(query),
      update: (nextSnapshot: unknown, options?: { signal?: AbortSignal }) =>
        controller.update(nextSnapshot, options),
      print: () => controller.print(),
      destroy: () => controller.destroy(),
    };
    const viewer = viewerModule.mountPageViewer(host, publication, {
      mode: "single",
      reader: { controller: readerController },
    });
    Reflect.set(globalThis, "__publicationSearchFixture", {
      controller,
      viewer,
      host,
      publication,
      get navigateCalls() {
        return navigateCalls;
      },
    });
  }, INITIAL_SNAPSHOT);
  await expect(page.getByRole("button", { name: "Search publication" })).toBeVisible();
}

async function removeSearchFixture(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const fixture = Reflect.get(globalThis, "__publicationSearchFixture") as
      | SearchFixture
      | undefined;
    fixture?.viewer.destroy();
    await fixture?.controller.destroy();
    fixture?.host.remove();
    Reflect.deleteProperty(globalThis, "__publicationSearchFixture");
  });
}

test("searches committed semantic text and navigates results through the public destination path", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installSearchFixture(page);
  try {
    const opener = page.getByRole("button", { name: "Search publication" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const search = page.getByRole("search", { name: "Publication search" });
    const input = search.getByRole("searchbox", { name: "Search publication text" });
    await input.fill("needle");
    await input.press("Enter");
    const resultButtons = search.locator(".imposia-search-result");
    await expect(resultButtons).toHaveCount(2);
    await expect(search.getByRole("status")).toHaveText("2 results");
    const nextResult = search.getByRole("button", { name: "Next search result" });
    const previousResult = search.getByRole("button", { name: "Previous search result" });
    await nextResult.press("Enter");
    await expect(resultButtons.first()).toHaveAttribute("aria-current", "true");
    await expect(search.getByRole("status")).toHaveText("Result 1 of 2, Opening, page 1");
    await previousResult.press("Space");
    await expect(resultButtons.nth(1)).toHaveAttribute("aria-current", "true");
    await expect(search.getByRole("status")).toHaveText("Result 2 of 2, Chapter, page 2");
    await resultButtons.nth(1).press("Enter");
    await expect(search).toBeHidden();
    await expect(page.locator('iframe[data-imposia-frame="page-document"]')).toBeFocused();
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(input).toBeFocused();
    await input.press("Escape");
    await expect(search).toBeHidden();
    await expect(opener).toBeFocused();
    await opener.click();
    await page.getByRole("button", { name: "Contents" }).click();
    await expect(search).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "Publication table of contents" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    const observation = await page.evaluate(() => {
      type Result = {
        entry: { id: string; title: string; pageRange: { start: number; end: number } };
        page: number;
        excerpt: string;
        destination: { id: string; entryId: string; page: number; generation: number };
      };
      const fixture = Reflect.get(globalThis, "__publicationSearchFixture") as {
        controller: {
          search(query: string): readonly Result[];
          resolveDestination(id: string): Result["destination"] | undefined;
        };
        viewer: {
          reader: {
            search(query: string): readonly Result[];
            nextSearchResult(): Result | undefined;
            previousSearchResult(): Result | undefined;
            selectSearchResult(result: Result): void;
            readonly state: {
              searchQuery: string;
              searchResults: readonly Result[];
              searchResultIndex: number | undefined;
            };
          };
          readonly state: { page: number; generation: number };
        };
        host: HTMLElement;
        publication: { iframe: HTMLIFrameElement };
        navigateCalls: number;
      };
      const direct = fixture.controller.search("NeEdLe");
      const excluded = {
        hidden: fixture.controller.search("cloak-token").length,
        inert: fixture.controller.search("inert-token").length,
        aria: fixture.controller.search("aria-token").length,
        css: fixture.controller.search("css-token").length,
        template: fixture.controller.search("template-token").length,
        script: fixture.controller.search("script-token").length,
        style: fixture.controller.search("style-token").length,
        decoration: fixture.controller.search("decoration-token").length,
        explicitBreak: fixture.controller.search("line break").length,
        collapsedBreak: fixture.controller.search("linebreak").length,
        horizontalRule: fixture.controller.search("rule-first rule-second").length,
        collapsedRule: fixture.controller.search("rule-firstrule-second").length,
        blockBoundary: fixture.controller.search("phantombridge").length,
      };
      const footnotes = fixture.controller.search("footnote-token");
      const results = fixture.viewer.reader.search("needle");
      const first = fixture.viewer.reader.nextSearchResult();
      const second = fixture.viewer.reader.nextSearchResult();
      const previous = fixture.viewer.reader.previousSearchResult();
      if (second === undefined) throw new Error("Expected a second search result.");
      fixture.viewer.reader.selectSearchResult(second);
      return {
        direct: direct.map((result) => ({
          entry: result.entry,
          page: result.page,
          excerpt: result.excerpt,
          destination: result.destination,
        })),
        excluded,
        resultCount: results.length,
        resolved: direct.map((result) =>
          fixture.controller.resolveDestination(result.destination.id),
        ),
        footnotes: footnotes.map((result) => ({ entryId: result.entry.id, page: result.page })),
        footnotePlaced:
          fixture.publication.iframe.contentDocument?.querySelector(
            "[data-imposia-footnote-area] [data-imposia-footnote]",
          ) !== null,
        immutable:
          Object.isFrozen(direct) &&
          direct.every(
            (result) =>
              Object.isFrozen(result) &&
              Object.isFrozen(result.entry) &&
              Object.isFrozen(result.entry.pageRange) &&
              Object.isFrozen(result.destination),
          ) &&
          Object.isFrozen(fixture.viewer.reader.state.searchResults),
        selectedPages: [first?.page, second.page, previous?.page, fixture.viewer.state.page],
        readerState: fixture.viewer.reader.state,
        navigateCalls: fixture.navigateCalls,
        canonicalIdentity: fixture.host.querySelector("iframe") === fixture.publication.iframe,
        canonicalFrames: fixture.host.querySelectorAll("iframe").length,
        serialized: JSON.stringify(direct),
      };
    });

    expect(observation.direct.map(({ entry }) => entry.id)).toEqual(["opening", "chapter"]);
    expect(observation.direct.map(({ page }) => page)).toEqual([1, 2]);
    expect(observation.direct.every(({ excerpt }) => /needle/i.test(excerpt))).toBe(true);
    expect(observation.direct.every(({ destination, page }) => destination.page === page)).toBe(
      true,
    );
    expect(observation.excluded).toEqual({
      hidden: 0,
      inert: 0,
      aria: 0,
      css: 0,
      template: 0,
      script: 0,
      style: 0,
      decoration: 0,
      explicitBreak: 1,
      collapsedBreak: 0,
      horizontalRule: 1,
      collapsedRule: 0,
      blockBoundary: 0,
    });
    expect(observation.footnotes).toEqual([{ entryId: "opening", page: 1 }]);
    expect(observation.footnotePlaced).toBe(true);
    expect(observation.immutable).toBe(true);
    expect(observation.resultCount).toBe(2);
    expect(observation.resolved).toEqual(observation.direct.map(({ destination }) => destination));
    expect(observation.selectedPages).toEqual([1, 2, 1, 2]);
    expect(observation.readerState.searchQuery).toBe("needle");
    expect(observation.readerState.searchResultIndex).toBe(1);
    expect(observation.navigateCalls).toBe(7);
    expect(observation.canonicalIdentity).toBe(true);
    expect(observation.canonicalFrames).toBe(1);
    expect(observation.serialized).not.toContain("<");
    expect(observation.serialized).not.toContain("scriptToken");
  } finally {
    await removeSearchFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("refresh removes stale results and rebuilds search from the new committed snapshot", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installSearchFixture(page);
  try {
    const observation = await page.evaluate(async () => {
      type Result = {
        page: number;
        destination: { id: string; entryId: string; page: number; generation: number };
      };
      const fixture = Reflect.get(globalThis, "__publicationSearchFixture") as {
        controller: {
          search(query: string): readonly Result[];
          update(snapshot: unknown): Promise<{ iframe: HTMLIFrameElement; generation: number }>;
        };
        viewer: {
          refresh(document: unknown): void;
          reader: {
            search(query: string): readonly Result[];
            selectSearchResult(result: Result): void;
            readonly state: { searchResults: readonly Result[]; searchResultIndex?: number };
          };
          readonly state: { page: number; generation: number };
        };
        host: HTMLElement;
        publication: { iframe: HTMLIFrameElement };
      };
      const legacy = await fixture.controller.update({
        metadata: { title: "Legacy search" },
        entries: [{ id: "legacy", title: "Legacy", html: "<h1>Legacy</h1><p>legacy-token</p>" }],
      });
      fixture.viewer.refresh(legacy);
      const oldResult = fixture.viewer.reader.search("legacy-token")[0];
      if (oldResult === undefined) throw new Error("Missing legacy search result.");
      const replacement = fixture.controller.update({
        metadata: { title: "Fresh search" },
        entries: [{ id: "fresh", title: "Fresh", html: "<h1>Fresh</h1><p>fresh-token</p>" }],
      });
      const duringUpdate = {
        legacy: fixture.controller.search("legacy-token").length,
        fresh: fixture.controller.search("fresh-token").length,
      };
      const updated = await replacement;
      fixture.viewer.refresh(updated);
      let staleCode: string | undefined;
      try {
        fixture.viewer.reader.selectSearchResult(oldResult);
      } catch (error: unknown) {
        staleCode = (error as { code?: string }).code;
      }
      const fresh = fixture.viewer.reader.search("fresh-token")[0];
      if (fresh === undefined) throw new Error("Missing fresh search result.");
      fixture.viewer.reader.selectSearchResult(fresh);
      return {
        staleCode,
        duringUpdate,
        legacyResults: fixture.controller.search("legacy-token").length,
        freshGeneration: fresh.destination.generation,
        viewerGeneration: fixture.viewer.state.generation,
        viewerPage: fixture.viewer.state.page,
        readerState: fixture.viewer.reader.state,
        canonicalIdentity: updated.iframe === fixture.publication.iframe,
        canonicalFrames: fixture.host.querySelectorAll("iframe").length,
      };
    });

    expect(observation.staleCode).toBe("STALE_PUBLICATION_DESTINATION");
    expect(observation.duringUpdate).toEqual({ legacy: 1, fresh: 0 });
    expect(observation.legacyResults).toBe(0);
    expect(observation.freshGeneration).toBe(observation.viewerGeneration);
    expect(observation.viewerPage).toBe(1);
    expect(observation.readerState.searchResults).toHaveLength(1);
    expect(observation.readerState.searchResultIndex).toBe(0);
    expect(observation.canonicalIdentity).toBe(true);
    expect(observation.canonicalFrames).toBe(1);
  } finally {
    await removeSearchFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("destroy clears Reader search state and rejects every later Reader action", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installSearchFixture(page);
  try {
    const observation = await page.evaluate(() => {
      type Result = {
        destination: { id: string; entryId: string; page: number; generation: number };
      };
      type Reader = {
        openTableOfContents(): void;
        closeTableOfContents(): void;
        toggleTableOfContents(): void;
        openSearch(): void;
        closeSearch(): void;
        toggleSearch(): void;
        search(query: string): readonly Result[];
        nextSearchResult(): Result | undefined;
        previousSearchResult(): Result | undefined;
        selectSearchResult(result: Result): void;
        navigate(destination: Result["destination"]): void;
        restoreDeepLink(value: string): Result["destination"] | undefined;
        readonly state: {
          tocOpen: boolean;
          destination: Result["destination"] | undefined;
          deepLink: string | undefined;
          searchOpen: boolean;
          searchQuery: string;
          searchResults: readonly Result[];
          searchResultIndex: number | undefined;
        };
      };
      const fixture = Reflect.get(globalThis, "__publicationSearchFixture") as {
        viewer: { reader: Reader; destroy(): void };
        host: HTMLElement;
      };
      const reader = fixture.viewer.reader;
      const result = reader.search("needle")[0];
      if (result === undefined) throw new Error("Destroy fixture search result is unavailable.");
      reader.openSearch();
      const retainedPanel = fixture.host.querySelector(".imposia-search-panel");
      const retainedPrevious = retainedPanel?.querySelector<HTMLButtonElement>(
        '[aria-label="Previous search result"]',
      );
      fixture.viewer.destroy();
      retainedPrevious?.click();
      const actions: Array<() => void> = [
        () => reader.openTableOfContents(),
        () => reader.closeTableOfContents(),
        () => reader.toggleTableOfContents(),
        () => reader.openSearch(),
        () => reader.closeSearch(),
        () => reader.toggleSearch(),
        () => {
          reader.search("needle");
        },
        () => {
          reader.nextSearchResult();
        },
        () => {
          reader.previousSearchResult();
        },
        () => reader.selectSearchResult(result),
        () => reader.navigate(result.destination),
        () => {
          reader.restoreDeepLink(`v1.${encodeURIComponent(result.destination.id)}`);
        },
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
          tocOpen: reader.state.tocOpen,
          destination: reader.state.destination,
          deepLink: reader.state.deepLink,
          searchOpen: reader.state.searchOpen,
          searchQuery: reader.state.searchQuery,
          searchResults: reader.state.searchResults.length,
          searchResultIndex: reader.state.searchResultIndex,
        },
        searchControls: fixture.host.querySelectorAll(
          ".imposia-search-toggle,.imposia-search-panel",
        ).length,
        detachedResults: retainedPanel?.querySelectorAll(".imposia-search-result").length,
        detachedInteractive: retainedPanel?.querySelectorAll("button,input,form").length,
        retainedPanelConnected: retainedPanel?.isConnected,
        retainedPreviousConnected: retainedPrevious?.isConnected,
        tocControls: fixture.host.querySelectorAll(".imposia-toc-toggle,.imposia-toc-panel").length,
        rootSearchOpen: fixture.host.dataset.searchOpen,
        rootTocOpen: fixture.host.dataset.tocOpen,
      };
    });

    expect(observation.actionErrors).toEqual(
      Array.from({ length: 12 }, () => "Publication reader has been destroyed."),
    );
    expect(observation.state).toEqual({
      tocOpen: false,
      destination: undefined,
      deepLink: undefined,
      searchOpen: false,
      searchQuery: "",
      searchResults: 0,
      searchResultIndex: undefined,
    });
    expect(observation.searchControls).toBe(0);
    expect(observation.detachedResults).toBe(0);
    expect(observation.detachedInteractive).toBe(0);
    expect(observation.retainedPanelConnected).toBe(false);
    expect(observation.retainedPreviousConnected).toBe(false);
    expect(observation.tocControls).toBe(0);
    expect(observation.rootSearchOpen).toBeUndefined();
    expect(observation.rootTocOpen).toBeUndefined();
  } finally {
    await removeSearchFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React Publication handle exposes the current Reader search surface", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");
  try {
    const host = page.locator(".react-publication-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    const observation = await page.evaluate(() => {
      type Result = {
        page: number;
        excerpt: string;
        destination: { generation: number };
      };
      type Handle = {
        openSearch(): void;
        closeSearch(): void;
        toggleSearch(): void;
        search(query: string): readonly Result[];
        nextSearchResult(): Result | undefined;
        previousSearchResult(): Result | undefined;
        selectSearchResult(result: Result): void;
      };
      const root = document.querySelector<HTMLElement>(".react-publication-host");
      const frame = root?.querySelector<HTMLIFrameElement>("iframe");
      const handle = (
        globalThis as {
          imposiaPublicationObservation: { handle: Handle | undefined };
        }
      ).imposiaPublicationObservation.handle;
      if (root === null || frame === null || frame === undefined || handle === undefined) {
        throw new Error("React Publication search fixture is unavailable.");
      }
      handle.openSearch();
      const opened = root.dataset.searchOpen;
      const results = handle.search("publication copy");
      const next = handle.nextSearchResult();
      const previous = handle.previousSearchResult();
      if (results[0] === undefined) throw new Error("React search result is unavailable.");
      handle.selectSearchResult(results[0]);
      handle.toggleSearch();
      handle.closeSearch();
      return {
        opened,
        resultCount: results.length,
        excerpt: results[0].excerpt,
        generations: [results[0].destination.generation, next?.destination.generation],
        previousPage: previous?.page,
        generation: Number(root.dataset.imposiaGeneration),
        closed: root.dataset.searchOpen,
        canonicalFrame: root.querySelector("iframe") === frame,
        frameCount: root.querySelectorAll("iframe").length,
      };
    });

    expect(observation.opened).toBe("true");
    expect(observation.resultCount).toBe(1);
    expect(observation.excerpt).toContain("Initial publication copy");
    expect(observation.generations).toEqual([observation.generation, observation.generation]);
    expect(observation.previousPage).toBe(1);
    expect(observation.closed).toBe("false");
    expect(observation.canonicalFrame).toBe(true);
    expect(observation.frameCount).toBe(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React controller replacement rejects results from an earlier controller identity", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");
  try {
    const host = page.locator(".react-publication-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    const before = await page.evaluate(() => {
      type Result = {
        destination: { id: string; entryId: string; page: number; generation: number };
      };
      type Handle = {
        search(query: string): readonly Result[];
        selectSearchResult(result: Result): void;
      };
      const observation = (
        globalThis as {
          imposiaPublicationObservation: {
            handle: Handle | undefined;
            readyTitles: string[];
            bumpOptionsRevision: (() => void) | undefined;
          };
        }
      ).imposiaPublicationObservation;
      const root = document.querySelector<HTMLElement>(".react-publication-host");
      const frame = root?.querySelector<HTMLIFrameElement>("iframe");
      const result = observation.handle?.search("publication copy")[0];
      if (
        root === null ||
        frame === null ||
        frame === undefined ||
        result === undefined ||
        observation.bumpOptionsRevision === undefined
      ) {
        throw new Error("React replacement search fixture is unavailable.");
      }
      Reflect.set(globalThis, "__imposiaOldSearchResult", result);
      Reflect.set(globalThis, "__imposiaOldSearchFrame", frame);
      const readyCount = observation.readyTitles.length;
      observation.bumpOptionsRevision();
      return {
        readyCount,
        resultId: result.destination.id,
        generation: result.destination.generation,
      };
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as {
                imposiaPublicationObservation: { readyTitles: string[] };
              }
            ).imposiaPublicationObservation.readyTitles.length,
        ),
      )
      .toBe(before.readyCount + 1);
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");

    const after = await page.evaluate(() => {
      type Result = {
        destination: { id: string; entryId: string; page: number; generation: number };
      };
      type Handle = {
        search(query: string): readonly Result[];
        selectSearchResult(result: Result): void;
      };
      const handle = (
        globalThis as {
          imposiaPublicationObservation: { handle: Handle | undefined };
        }
      ).imposiaPublicationObservation.handle;
      const oldResult = Reflect.get(globalThis, "__imposiaOldSearchResult") as Result;
      const oldFrame = Reflect.get(globalThis, "__imposiaOldSearchFrame") as HTMLIFrameElement;
      const root = document.querySelector<HTMLElement>(".react-publication-host");
      if (handle === undefined || root === null)
        throw new Error("Replacement handle is unavailable.");
      let staleCode: string | undefined;
      try {
        handle.selectSearchResult(oldResult);
      } catch (error: unknown) {
        staleCode = (error as { code?: string }).code;
      }
      const current = handle.search("publication copy")[0];
      if (current === undefined) throw new Error("Replacement search result is unavailable.");
      handle.selectSearchResult(current);
      return {
        staleCode,
        resultId: current.destination.id,
        generation: current.destination.generation,
        frameReplaced: root.querySelector("iframe") !== oldFrame,
        frameCount: root.querySelectorAll("iframe").length,
      };
    });

    expect(before.generation).toBe(1);
    expect(after.generation).toBe(1);
    expect(after.resultId).not.toBe(before.resultId);
    expect(after.staleCode).toBe("STALE_PUBLICATION_DESTINATION");
    expect(after.frameReplaced).toBe(true);
    expect(after.frameCount).toBe(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("search panel remains reachable in a narrow Reader container", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Responsive search geometry is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await installSearchFixture(page);
  try {
    await page.evaluate(async () => {
      const fixture = Reflect.get(globalThis, "__publicationSearchFixture") as {
        host: HTMLElement;
      };
      fixture.host.style.width = "320px";
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const opener = page.getByRole("button", { name: "Search publication" });
    await opener.click();
    const search = page.getByRole("search", { name: "Publication search" });
    const input = search.getByRole("searchbox", { name: "Search publication text" });
    await input.fill("needle");
    await input.press("Enter");
    await expect(search.locator(".imposia-search-result")).toHaveCount(2);
    const geometry = await page.evaluate(() => {
      const fixture = Reflect.get(globalThis, "__publicationSearchFixture") as {
        host: HTMLElement;
        publication: { iframe: HTMLIFrameElement };
      };
      const panel = fixture.host.querySelector<HTMLElement>(".imposia-search-panel");
      const rail = fixture.host.querySelector<HTMLElement>(".imposia-rail");
      const input = fixture.host.querySelector<HTMLInputElement>(".imposia-search-input");
      if (panel === null || rail === null || input === null) {
        throw new Error("Narrow search geometry is unavailable.");
      }
      return {
        host: fixture.host.getBoundingClientRect().toJSON(),
        panel: panel.getBoundingClientRect().toJSON(),
        rail: rail.getBoundingClientRect().toJSON(),
        input: input.getBoundingClientRect().toJSON(),
        canonicalFrame: fixture.host.querySelector("iframe") === fixture.publication.iframe,
        frameCount: fixture.host.querySelectorAll("iframe").length,
      };
    });
    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.host.left);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.host.right);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.rail.bottom - 1);
    expect(geometry.input.left).toBeGreaterThanOrEqual(geometry.panel.left);
    expect(geometry.input.right).toBeLessThanOrEqual(geometry.panel.right);
    expect(geometry.canonicalFrame).toBe(true);
    expect(geometry.frameCount).toBe(1);
    await input.press("Escape");
    await expect(opener).toBeFocused();
  } finally {
    await removeSearchFixture(page);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
