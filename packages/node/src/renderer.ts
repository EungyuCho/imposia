import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { ImposiaError, prepareDocument } from "@imposia/core";
import type { Browser, Page } from "playwright";
import { type BrowserSession, launchBrowserSession } from "./browser-session.js";
import { buildCoreDocument, discardCoreDocument } from "./core-export.js";
import { withTimeout } from "./input-boundary.js";
import { renderPdfWithPageSides } from "./page-sides.js";
import { inspectPdf, pdfOptions } from "./pdf-output.js";
import {
  configureResourceBoundary,
  DEFAULT_TIMEOUT_MS,
  injectBaseUrl,
  loadDocument,
} from "./render-source.js";
import { trackPageResources } from "./resource-readiness.js";
import type {
  Renderer,
  RenderInput,
  RenderOptions,
  RenderResult,
  RenderTimings,
  RenderWarning,
} from "./types.js";

const MAX_IDLE_PAGES = 1;

export function createRenderer(): Renderer {
  let browserSessionPromise: Promise<BrowserSession> | undefined;
  let state: "active" | "closing" | "closed" = "active";
  let shutdownPromise: Promise<void> | undefined;
  const idlePages: Page[] = [];
  const renderContext = new AsyncLocalStorage<symbol>();
  const activeRenders = new Map<symbol, Promise<void>>();

  function assertActive(): void {
    if (state !== "active") throw new ImposiaError("RENDERER_CLOSED", "Renderer is closed.");
  }

  async function browser(): Promise<{ instance: Browser; startupMs: number }> {
    assertActive();
    if (browserSessionPromise !== undefined) {
      let session: BrowserSession;
      try {
        session = await browserSessionPromise;
      } catch (error) {
        browserSessionPromise = undefined;
        throw error;
      }
      assertActive();
      return { instance: session.browser, startupMs: 0 };
    }
    const startedAt = performance.now();
    const executablePath = process.env.IMPOSIA_CHROMIUM_EXECUTABLE;
    browserSessionPromise = launchBrowserSession(executablePath);
    let session: BrowserSession;
    try {
      session = await browserSessionPromise;
    } catch (error) {
      browserSessionPromise = undefined;
      throw error;
    }
    assertActive();
    return { instance: session.browser, startupMs: performance.now() - startedAt };
  }

  async function acquirePage(instance: Browser): Promise<Page> {
    let page = idlePages.pop();
    while (page?.isClosed()) page = idlePages.pop();
    return page ?? instance.newPage();
  }

  async function releasePage(page: Page, reusable: boolean): Promise<void> {
    if (page.isClosed()) return;
    if (!reusable || state !== "active") {
      await page.close();
      return;
    }
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
    if (state === "active" && idlePages.length < MAX_IDLE_PAGES) idlePages.push(page);
    else await page.close();
  }

  async function performRender(input: RenderInput, options: RenderOptions): Promise<RenderResult> {
    try {
      assertActive();
      const startedAt = performance.now();
      await options.onStart?.();
      assertActive();
      const loaded = await loadDocument(input, options);
      assertActive();
      const prepared = prepareDocument(loaded.html, {
        ...(options.headerTemplate === undefined ? {} : { headerTemplate: options.headerTemplate }),
        ...(options.footerTemplate === undefined ? {} : { footerTemplate: options.footerTemplate }),
        ...(options.allowRemoteResources === undefined
          ? {}
          : { allowRemoteResources: options.allowRemoteResources }),
      });
      const warnings: RenderWarning[] = [...prepared.warnings];
      for (const warning of warnings) await options.onWarning?.(warning);
      assertActive();

      const launched = await browser();
      assertActive();
      const page = await acquirePage(launched.instance);
      let reusable = false;
      let finalTimings: RenderTimings | undefined;
      try {
        await configureResourceBoundary(page, options);
        await page.emulateMedia({ media: "print" });
        let resourceWaitMs: number;
        let coreDocument: Awaited<ReturnType<typeof buildCoreDocument>> | undefined;
        try {
          if (options.engine === "core") {
            coreDocument = await buildCoreDocument(
              page,
              {
                html: prepared.html,
                ...(loaded.baseUrl === undefined ? {} : { baseUrl: loaded.baseUrl }),
              },
              {
                ...(prepared.headerTemplate === undefined
                  ? {}
                  : { headerTemplate: prepared.headerTemplate }),
                ...(prepared.footerTemplate === undefined
                  ? {}
                  : { footerTemplate: prepared.footerTemplate }),
              },
              options,
            );
            resourceWaitMs = coreDocument.resourceMs;
            for (const warning of coreDocument.warnings) {
              const code: RenderWarning["code"] | undefined =
                warning.code === "UNSUPPORTED_LAYOUT"
                  ? "UNSUPPORTED_CSS_FEATURE"
                  : warning.code === "PAGE_OVERFLOW" ||
                      warning.code === "RESOURCE_BLOCKED" ||
                      warning.code === "UNSUPPORTED_DECORATION_TOKEN"
                    ? warning.code
                    : undefined;
              if (code === undefined || warnings.some((existing) => existing.code === code))
                continue;
              const mapped: RenderWarning = { code, severity: "warning", message: warning.message };
              warnings.push(mapped);
              await options.onWarning?.(mapped);
            }
          } else {
            const resourceStartedAt = performance.now();
            const resourceTracker = trackPageResources(page);
            try {
              await page.setContent(injectBaseUrl(prepared.html, loaded.baseUrl), {
                waitUntil: "load",
                timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
              });
              await withTimeout(
                resourceTracker.waitForReady(),
                options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                "resources",
              );
            } finally {
              resourceTracker.dispose();
            }
            resourceWaitMs = performance.now() - resourceStartedAt;
          }
          await options.onResourcesReady?.();

          const printPreparationStartedAt = performance.now();
          await page.evaluate(() => document.documentElement.getBoundingClientRect().height);
          const printPreparationMs = performance.now() - printPreparationStartedAt;

          const pdfGenerationStartedAt = performance.now();
          const pdf =
            options.engine === "core"
              ? new Uint8Array(await page.pdf(pdfOptions()))
              : await renderPdfWithPageSides(
                  page,
                  pdfOptions(prepared.headerTemplate, prepared.footerTemplate),
                );
          const pdfGenerationMs = performance.now() - pdfGenerationStartedAt;
          const inspected = await inspectPdf(pdf);
          if (inspected.pages.length === 0 || inspected.pages[0] === undefined) {
            throw new ImposiaError("EMPTY_PDF", "Chromium produced a PDF with no pages.");
          }

          const timings: RenderTimings = {
            totalMs: performance.now() - startedAt,
            browserStartupMs: launched.startupMs,
            resourceWaitMs,
            printPreparationMs,
            pdfGenerationMs,
          };
          finalTimings = timings;
          const firstPage = inspected.pages[0];
          const withoutPdf = {
            pages: inspected.pages,
            pageCount: inspected.pages.length,
            pageSize: {
              widthPoints: firstPage.widthPoints,
              heightPoints: firstPage.heightPoints,
            },
            warnings,
            timings,
          };
          await options.onPaginated?.(withoutPdf);
          assertActive();
          await options.onPdfReady?.(pdf);
          assertActive();
          timings.totalMs = performance.now() - startedAt;
          const result: RenderResult = { ...withoutPdf, timings, pdf };
          reusable = options.allowRemoteResources !== true;
          return result;
        } finally {
          if (coreDocument !== undefined) await discardCoreDocument(page, coreDocument);
        }
      } finally {
        await releasePage(page, reusable);
        if (finalTimings !== undefined) finalTimings.totalMs = performance.now() - startedAt;
      }
    } catch (error) {
      if (state !== "active") {
        throw new ImposiaError("RENDERER_CLOSED", "Renderer is closed.");
      }
      throw error;
    }
  }

  async function shutdownBrowser(): Promise<void> {
    const pending = browserSessionPromise;
    if (pending === undefined) return;
    try {
      const session = await pending;
      await session.close();
    } finally {
      idlePages.length = 0;
      browserSessionPromise = undefined;
    }
  }

  return {
    render(input, options = {}) {
      if (state !== "active") {
        return Promise.reject(new ImposiaError("RENDERER_CLOSED", "Renderer is closed."));
      }
      const token = Symbol("render");
      let finish: (() => void) | undefined;
      const completion = new Promise<void>((resolve) => {
        finish = resolve;
      });
      activeRenders.set(token, completion);
      const operation = renderContext.run(token, () => performRender(input, options));
      void operation.then(
        () => {
          activeRenders.delete(token);
          finish?.();
          if (state === "closing" && activeRenders.size === 0) state = "closed";
        },
        () => {
          activeRenders.delete(token);
          finish?.();
          if (state === "closing" && activeRenders.size === 0) state = "closed";
        },
      );
      return operation;
    },

    async close() {
      const caller = renderContext.getStore();
      if (state === "active") state = "closing";
      const pending = [...activeRenders.entries()]
        .filter(([token]) => token !== caller)
        .map(([, completion]) => completion);
      await Promise.all(pending);
      shutdownPromise ??= shutdownBrowser();
      await shutdownPromise;
      if (activeRenders.size === 0) state = "closed";
    },
  };
}
