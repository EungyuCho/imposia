import { expect, type TestInfo, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";
import {
  CONFORMANCE_FIXTURES,
  type ConformanceStatus,
  PERFORMANCE_FIXTURES,
} from "./conformance-performance-fixtures.js";

type PageDocument = Readonly<{
  iframe: HTMLIFrameElement;
  generation: number;
  pageCount: number;
  warnings: readonly { readonly code: string }[];
  timings: Readonly<{ totalMs: number; resourceMs: number; paginationMs: number }>;
}>;

type PageController = Readonly<{
  ready: Promise<PageDocument>;
  current: PageDocument | undefined;
  update(source: { html: string }): Promise<PageDocument>;
  destroy(): Promise<void>;
}>;

type CoreModule = Readonly<{
  mountPageDocument(
    host: HTMLElement,
    source: { html: string },
    options?: Readonly<{
      assetResolver?: (request: { url: string; signal: AbortSignal }) => Promise<{
        status: "resolved";
        bytes: Uint8Array;
        mimeType: string;
      }>;
    }>,
  ): PageController;
}>;

const attachJson = async (testInfo: TestInfo, name: string, value: unknown): Promise<void> => {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"),
    contentType: "application/json",
  });
};

const continuityTokens = Array.from(
  { length: 96 },
  (_, index) => `FLOW-${String(index + 1).padStart(3, "0")}`,
);

const continuityHtml = `
  <style>
    @page { size: 360px 420px; margin: 28px; }
    body { margin: 0; font: 12px/1.4 sans-serif; }
    main { border-bottom: 1px solid #888; }
    p {
      display: grid;
      min-height: 31px;
      grid-template-columns: 72px 1fr;
      align-items: center;
      gap: 10px;
      margin: 0;
      border-top: 1px solid #888;
      break-inside: avoid;
    }
  </style>
  <main>
    ${continuityTokens
      .map(
        (token) =>
          `<p><span data-continuity-token="${token}">${token}</span><span>source continuity</span></p>`,
      )
      .join("")}
  </main>
`;

test.describe("public browser conformance corpus", () => {
  for (const fixture of CONFORMANCE_FIXTURES) {
    test(`${fixture.id}: ${fixture.description}`, async ({ page, browserName }, testInfo) => {
      const { errors, pageErrors } = captureBrowserErrors(page, browserName);
      await page.goto("/examples/book.html");

      try {
        const observation = await page.evaluate(async ({ id, html, markers }) => {
          const modulePath = "/packages/core/dist/index.js";
          const core = (await import(modulePath)) as CoreModule;
          const host = document.createElement("div");
          document.body.replaceChildren(host);
          const controller = core.mountPageDocument(host, { html });
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const text = [
              ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]"),
            ]
              .map((flow) => flow.textContent ?? "")
              .join("\n");
            const markerCounts = Object.fromEntries(
              markers.map((marker) => [marker, text.split(marker).length - 1]),
            );
            const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
            const pageMembership = markers.map((marker) => ({
              marker,
              page: pages.findIndex((pageElement) =>
                [...pageElement.querySelectorAll<HTMLElement>("[data-conformance-marker]")].some(
                  (element) => element.dataset.conformanceMarker === marker,
                ),
              ),
            }));
            const actualMarkerOrder = pages.flatMap((pageElement) =>
              [...pageElement.querySelectorAll<HTMLElement>("[data-conformance-marker]")]
                .map((element) => element.dataset.conformanceMarker)
                .filter((marker): marker is string =>
                  marker === undefined ? false : markers.includes(marker),
                ),
            );
            const contentPageCount = new Set(pageMembership.map((membership) => membership.page))
              .size;
            const warningCodes = ready.warnings.map((warning) => warning.code);
            const status: ConformanceStatus = warningCodes.includes("UNSUPPORTED_LAYOUT")
              ? "fallback"
              : "supported";
            const styleOf = (selector: string): CSSStyleDeclaration | undefined => {
              const element = frameDocument.querySelector<HTMLElement>(selector);
              return element === null ? undefined : getComputedStyle(element);
            };
            const geometry = (() => {
              if (id === "flex") {
                const style = styleOf(".fixture-flex");
                return { display: style?.display, flexDirection: style?.flexDirection };
              }
              if (id === "grid") {
                const style = styleOf(".fixture-grid");
                return { display: style?.display, gridTemplateColumns: style?.gridTemplateColumns };
              }
              if (id === "table") {
                const tablePages = pages.filter((pageElement) =>
                  pageElement.querySelector("table"),
                );
                return {
                  display: styleOf("table")?.display,
                  pagesWithTable: tablePages.length,
                  pagesWithHeader: tablePages.filter((pageElement) =>
                    pageElement.querySelector("thead"),
                  ).length,
                  pagesWithFooter: tablePages.filter((pageElement) =>
                    pageElement.querySelector("tfoot"),
                  ).length,
                };
              }
              if (id === "multicol") {
                const style = styleOf(".fixture-multicol");
                const spanners = [
                  ...frameDocument.querySelectorAll<HTMLElement>(".fixture-multicol-span"),
                ];
                return {
                  columnCount: style?.columnCount,
                  columnFill: style?.columnFill,
                  spannerCount: spanners.length,
                  fullWidthSpanners: spanners.filter((spanner) => {
                    const container = spanner.closest<HTMLElement>(".fixture-multicol");
                    const containerWidth = container?.getBoundingClientRect().width ?? 0;
                    return [...spanner.getClientRects()].some(
                      (rect) => rect.width > containerWidth * 0.9,
                    );
                  }).length,
                };
              }
              if (id === "cjk") {
                const keepAllStyle = styleOf(".fixture-ko");
                const verticalStyle = styleOf(".fixture-vertical");
                const hyphenStyle = styleOf(".fixture-hyphen");
                return {
                  wordBreak: keepAllStyle?.wordBreak,
                  lineBreak: keepAllStyle?.lineBreak,
                  writingMode: verticalStyle?.writingMode,
                  hyphens: hyphenStyle?.hyphens,
                  rubyCount: frameDocument.querySelectorAll("ruby").length,
                };
              }
              throw new Error(`Unknown conformance fixture: ${id}`);
            })();
            return {
              status,
              generation: ready.generation,
              pageCount: ready.pageCount,
              canonicalFrameCount: host.querySelectorAll(
                'iframe[data-imposia-frame="page-document"]',
              ).length,
              stagingFrameCount: host.querySelectorAll(
                'iframe[data-imposia-frame="page-document-staging"]',
              ).length,
              markerCounts,
              pageMembership,
              actualMarkerOrder,
              contentPageCount,
              geometry,
              warningCodes,
              timings: ready.timings,
            };
          } finally {
            await controller.destroy();
            host.remove();
          }
        }, fixture);

        const report = {
          fixture: fixture.id,
          browser: browserName,
          expectedStatus: fixture.expectedStatus[browserName],
          expectedWarningCodes: fixture.expectedWarningCodes,
          ...observation,
        };
        await attachJson(testInfo, `${fixture.id}-${browserName}-conformance`, report);
        testInfo.annotations.push({
          type: "conformance",
          description: `${fixture.id}: ${observation.status}; pages=${observation.pageCount}; warnings=${observation.warningCodes.join(",") || "none"}`,
        });

        expect(observation.pageCount).toBeGreaterThan(0);
        expect(observation.generation).toBe(1);
        expect(observation.canonicalFrameCount).toBe(1);
        expect(observation.stagingFrameCount).toBe(0);
        expect(observation.markerCounts).toEqual(
          Object.fromEntries(fixture.markers.map((marker) => [marker, 1])),
        );
        expect(observation.pageMembership.map((membership) => membership.marker)).toEqual(
          fixture.markers,
        );
        expect(observation.actualMarkerOrder).toEqual(fixture.markers);
        expect(observation.pageMembership.every((membership) => membership.page >= 0)).toBe(true);
        expect(observation.pageMembership.map((membership) => membership.page)).toEqual(
          [...observation.pageMembership]
            .map((membership) => membership.page)
            .sort((left, right) => left - right),
        );
        expect(observation.contentPageCount).toBeGreaterThan(0);
        expect(observation.status).toBe(fixture.expectedStatus[browserName]);
        expect(observation.warningCodes).toEqual(fixture.expectedWarningCodes);
        if (fixture.id === "flex") {
          expect(observation.geometry).toMatchObject({ display: "flex", flexDirection: "column" });
          if (browserName === "chromium") expect(observation.contentPageCount).toBeGreaterThan(1);
        } else if (fixture.id === "grid") {
          expect(observation.geometry).toMatchObject({ display: "grid" });
          expect(observation.geometry.gridTemplateColumns).not.toBe("");
          for (let index = 0; index < observation.pageMembership.length; index += 2) {
            expect(observation.pageMembership[index]?.page).toBe(
              observation.pageMembership[index + 1]?.page,
            );
          }
          if (browserName === "chromium") expect(observation.contentPageCount).toBeGreaterThan(1);
        } else if (fixture.id === "table") {
          expect(observation.geometry.display).toBe("table");
          expect(observation.geometry.pagesWithTable).toBeGreaterThan(1);
          expect(observation.geometry.pagesWithHeader).toBe(observation.geometry.pagesWithTable);
          expect(observation.geometry.pagesWithFooter).toBe(observation.geometry.pagesWithTable);
          expect(observation.pageMembership[0]?.page).toBe(observation.pageMembership[1]?.page);
        } else if (fixture.id === "multicol") {
          expect(observation.geometry).toMatchObject({
            columnCount: "2",
            columnFill: "auto",
            spannerCount: 2,
            fullWidthSpanners: 2,
          });
        } else {
          expect(observation.geometry).toMatchObject({
            wordBreak: "keep-all",
            lineBreak: "auto",
            writingMode: "vertical-rl",
            hyphens: "auto",
            rubyCount: 1,
          });
        }
      } finally {
        expect(errors).toEqual([]);
        expect(pageErrors).toEqual([]);
      }
    });
  }
});

test("records exact source continuity at every committed page boundary", async ({
  page,
  browserName,
}, testInfo) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(
      async ({ html, sourceTokens }) => {
        const modulePath = "/packages/core/dist/index.js";
        const core = (await import(modulePath)) as CoreModule;
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const controller = core.mountPageDocument(host, { html });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const pageRanges = [
            ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]"),
          ].flatMap((pageElement, pageIndex) => {
            const tokens = [
              ...pageElement.querySelectorAll<HTMLElement>("[data-continuity-token]"),
            ].flatMap((element) => {
              const token = element.dataset.continuityToken;
              return token === undefined ? [] : [token];
            });
            const first = tokens[0];
            const last = tokens.at(-1);
            return first === undefined || last === undefined
              ? []
              : [{ page: pageIndex + 1, first, last, count: tokens.length, tokens }];
          });
          const committedTokens = pageRanges.flatMap((range) => range.tokens);
          return {
            generation: ready.generation,
            pageCount: ready.pageCount,
            warningCodes: ready.warnings.map((warning) => warning.code),
            canonicalFrameCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
              .length,
            stagingFrameCount: host.querySelectorAll(
              'iframe[data-imposia-frame="page-document-staging"]',
            ).length,
            pageRanges: pageRanges.map(({ tokens: _tokens, ...range }) => range),
            committedTokens,
            exactSequence:
              committedTokens.length === sourceTokens.length &&
              committedTokens.every((token, index) => token === sourceTokens[index]),
          };
        } finally {
          await controller.destroy();
          host.remove();
        }
      },
      { html: continuityHtml, sourceTokens: continuityTokens },
    );

    await attachJson(testInfo, `continuity-${browserName}-conformance`, {
      browser: browserName,
      sourceTokenCount: continuityTokens.length,
      ...observation,
    });
    testInfo.annotations.push({
      type: "continuity",
      description: `${browserName}: ${observation.committedTokens.length}/${continuityTokens.length} tokens across ${observation.pageRanges.length} content pages`,
    });

    expect(observation.generation).toBe(1);
    expect(observation.pageCount).toBeGreaterThan(2);
    expect(observation.warningCodes).toEqual([]);
    expect(observation.canonicalFrameCount).toBe(1);
    expect(observation.stagingFrameCount).toBe(0);
    expect(observation.pageRanges.length).toBeGreaterThan(2);
    expect(observation.committedTokens).toEqual(continuityTokens);
    expect(observation.exactSequence).toBe(true);
    for (let index = 1; index < observation.pageRanges.length; index += 1) {
      const previous = observation.pageRanges[index - 1];
      const current = observation.pageRanges[index];
      if (previous === undefined || current === undefined) {
        throw new Error("Continuity page range is missing.");
      }
      expect(continuityTokens.indexOf(current.first)).toBe(
        continuityTokens.indexOf(previous.last) + 1,
      );
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test.describe("public browser performance corpus", () => {
  for (const fixture of PERFORMANCE_FIXTURES) {
    test(`${fixture.id} mount and update stay inside the reviewed budget`, async ({
      page,
      browserName,
    }, testInfo) => {
      test.skip(browserName !== "chromium", "Chromium is the structural performance reference.");
      const { errors, pageErrors } = captureBrowserErrors(page, browserName);
      test.setTimeout(60_000);
      await page.goto("/examples/book.html");

      try {
        const metrics = await page.evaluate(async ({ initialHtml, updateHtml }) => {
          const modulePath = "/packages/core/dist/index.js";
          const core = (await import(modulePath)) as CoreModule;
          const host = document.createElement("div");
          document.body.replaceChildren(host);
          const mountStartedAt = performance.now();
          const controller = core.mountPageDocument(host, { html: initialHtml });
          try {
            const mounted = await controller.ready;
            const mountMs = performance.now() - mountStartedAt;
            const updateStartedAt = performance.now();
            const updated = await controller.update({ html: updateHtml });
            const updateMs = performance.now() - updateStartedAt;
            const canonicalDocument = updated.iframe.contentDocument;
            if (canonicalDocument === null) throw new Error("Missing canonical frame document.");
            return {
              mount: {
                elapsedMs: mountMs,
                timings: mounted.timings,
                pageCount: mounted.pageCount,
                generation: mounted.generation,
              },
              update: {
                elapsedMs: updateMs,
                timings: updated.timings,
                pageCount: updated.pageCount,
                generation: updated.generation,
              },
              canonicalNodeCount: canonicalDocument.querySelectorAll("*").length,
              canonicalFrameCount: host.querySelectorAll(
                'iframe[data-imposia-frame="page-document"]',
              ).length,
              stagingFrameCount: host.querySelectorAll(
                'iframe[data-imposia-frame="page-document-staging"]',
              ).length,
              cleanup: await controller.destroy().then(() => ({
                childCount: host.childElementCount,
                canonicalFrameCount: host.querySelectorAll(
                  'iframe[data-imposia-frame="page-document"]',
                ).length,
                stagingFrameCount: host.querySelectorAll(
                  'iframe[data-imposia-frame="page-document-staging"]',
                ).length,
                currentIsUndefined: controller.current === undefined,
              })),
            };
          } finally {
            await controller.destroy();
            host.remove();
          }
        }, fixture);

        const report = {
          fixture: fixture.id,
          browser: browserName,
          sourceNodeCount: fixture.sourceNodeCount,
          budgets: { mountMs: fixture.maxMountMs, updateMs: fixture.maxUpdateMs },
          metrics,
          result: {
            mount: metrics.mount.elapsedMs <= fixture.maxMountMs ? "pass" : "regression",
            update: metrics.update.elapsedMs <= fixture.maxUpdateMs ? "pass" : "regression",
          },
        };
        await attachJson(testInfo, `${fixture.id}-${browserName}-performance`, report);
        testInfo.annotations.push({
          type: "performance",
          description: `${fixture.id}: mount=${metrics.mount.elapsedMs.toFixed(1)}ms/${metrics.mount.pageCount}p, update=${metrics.update.elapsedMs.toFixed(1)}ms/${metrics.update.pageCount}p, nodes=${metrics.canonicalNodeCount}`,
        });

        expect(metrics.mount.elapsedMs).toBeLessThanOrEqual(fixture.maxMountMs);
        expect(metrics.update.elapsedMs).toBeLessThanOrEqual(fixture.maxUpdateMs);
        expect(metrics.mount.timings.totalMs).toBeGreaterThan(0);
        expect(metrics.mount.timings.paginationMs).toBeGreaterThanOrEqual(0);
        expect(metrics.mount.timings.resourceMs).toBeGreaterThanOrEqual(0);
        expect(metrics.update.timings.totalMs).toBeGreaterThan(0);
        expect(metrics.update.timings.paginationMs).toBeGreaterThanOrEqual(0);
        expect(metrics.update.timings.resourceMs).toBeGreaterThanOrEqual(0);
        expect(metrics.mount.pageCount).toBeGreaterThan(0);
        expect(metrics.update.pageCount).toBeGreaterThan(0);
        expect(metrics.mount.generation).toBe(1);
        expect(metrics.update.generation).toBe(2);
        expect(metrics.canonicalNodeCount).toBeGreaterThan(fixture.sourceNodeCount);
        expect(metrics.canonicalFrameCount).toBe(1);
        expect(metrics.stagingFrameCount).toBe(0);
        expect(metrics.cleanup).toEqual({
          childCount: 0,
          canonicalFrameCount: 0,
          stagingFrameCount: 0,
          currentIsUndefined: true,
        });
      } finally {
        expect(errors).toEqual([]);
        expect(pageErrors).toEqual([]);
      }
    });
  }
});

test("supersede and destroy remove staged generations and abort temporary work", async ({
  page,
  browserName,
}, testInfo) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModule;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      let staleResolverStarted: (() => void) | undefined;
      const staleResolverReady = new Promise<void>((resolve) => {
        staleResolverStarted = resolve;
      });
      let staleResolverAborted = false;
      const controller = core.mountPageDocument(
        host,
        { html: "<p>COMMITTED-GENERATION</p>" },
        {
          assetResolver: async ({ url, signal }) => {
            if (url === "stale.png") {
              staleResolverStarted?.();
              await new Promise<never>((_resolve, reject) => {
                signal.addEventListener(
                  "abort",
                  () => {
                    staleResolverAborted = true;
                    reject(new DOMException("superseded", "AbortError"));
                  },
                  { once: true },
                );
              });
            }
            return {
              status: "resolved",
              bytes: new Uint8Array([137, 80, 78, 71]),
              mimeType: "image/png",
            };
          },
        },
      );
      const committed = await controller.ready;
      const staleUpdate = controller.update({
        html: '<p>STALE-GENERATION</p><img src="stale.png" alt="">',
      });
      const staleResultPromise = staleUpdate.then(
        () => ({ status: "fulfilled" as const, name: "" }),
        (error: unknown) => ({
          status: "rejected" as const,
          name: error instanceof DOMException ? error.name : "unknown",
        }),
      );
      await staleResolverReady;
      const whileStaging = {
        canonicalFrameCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
          .length,
        stagingFrameCount: host.querySelectorAll(
          'iframe[data-imposia-frame="page-document-staging"]',
        ).length,
        canonicalText: committed.iframe.contentDocument?.body.textContent ?? "",
      };
      const winner = await controller.update({ html: "<p>WINNING-GENERATION</p>" });
      const staleResult = await staleResultPromise;
      const afterSupersede = {
        canonicalFrameCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
          .length,
        stagingFrameCount: host.querySelectorAll(
          'iframe[data-imposia-frame="page-document-staging"]',
        ).length,
        canonicalText: winner.iframe.contentDocument?.body.textContent ?? "",
        generation: winner.generation,
        staleResolverAborted,
        staleResult,
      };
      await controller.destroy();
      return {
        whileStaging,
        afterSupersede,
        afterDestroy: {
          childCount: host.childElementCount,
          canonicalFrameCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
            .length,
          stagingFrameCount: host.querySelectorAll(
            'iframe[data-imposia-frame="page-document-staging"]',
          ).length,
          currentIsUndefined: controller.current === undefined,
        },
      };
    });

    await attachJson(testInfo, `lifecycle-${browserName}-cleanup`, {
      browser: browserName,
      ...observation,
    });
    testInfo.annotations.push({
      type: "cleanup",
      description: `${browserName}: supersede aborted temporary resolver; destroy children=${observation.afterDestroy.childCount}`,
    });

    expect(observation.whileStaging.canonicalFrameCount).toBe(1);
    expect(observation.whileStaging.stagingFrameCount).toBe(1);
    expect(observation.whileStaging.canonicalText).toContain("COMMITTED-GENERATION");
    expect(observation.afterSupersede).toMatchObject({
      canonicalFrameCount: 1,
      stagingFrameCount: 0,
      generation: 2,
      staleResolverAborted: true,
      staleResult: { status: "rejected", name: "AbortError" },
    });
    expect(observation.afterSupersede.canonicalText).toContain("WINNING-GENERATION");
    expect(observation.afterSupersede.canonicalText).not.toContain("STALE-GENERATION");
    expect(observation.afterDestroy).toEqual({
      childCount: 0,
      canonicalFrameCount: 0,
      stagingFrameCount: 0,
      currentIsUndefined: true,
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
