import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const containmentTokens = Array.from(
  { length: 72 },
  (_, index) => `CONTAIN-${String(index + 1).padStart(3, "0")}`,
);

test("preserves committed source order when pages use layout containment", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async (tokens) => {
      type PageDocument = Readonly<{
        readonly iframe: HTMLIFrameElement;
      }>;
      type Controller = Readonly<{
        readonly ready: Promise<PageDocument>;
        destroy(): Promise<void>;
      }>;
      type Core = Readonly<{
        mountPageDocument(host: HTMLElement, source: Readonly<{ html: string }>): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(host, {
        html: `
          <style>
            @page { size: 360px 420px; margin: 28px; }
            body { margin: 0; font: 12px/1.4 sans-serif; }
            p { min-height: 31px; margin: 0; border-top: 1px solid #888; }
          </style>
          <main>
            ${tokens
              .map((token) => `<p><span data-containment-token="${token}">${token}</span></p>`)
              .join("")}
          </main>
        `,
      });

      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
        const committedTokens = pages.flatMap((pageElement) =>
          [...pageElement.querySelectorAll<HTMLElement>("[data-containment-token]")]
            .map((element) => element.dataset.containmentToken)
            .filter((token): token is string => token !== undefined),
        );
        return {
          committedTokens,
          containment: pages.map((pageElement) => getComputedStyle(pageElement).contain),
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    }, containmentTokens);

    expect(observation.committedTokens).toEqual(containmentTokens);
    expect(observation.containment.length).toBeGreaterThan(1);
    expect(observation.containment.every((value) => value.includes("layout"))).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("keeps cooperative pagination structurally equivalent to uninterrupted pagination", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type ComposeOptions = Readonly<{
        yieldBudgetMs?: number;
        scheduler?: () => Promise<void>;
      }>;
      type PageDocument = Readonly<{
        readonly iframe: HTMLIFrameElement;
        readonly pages: readonly Readonly<{
          readonly blank: boolean;
          readonly bodyText: string;
          readonly name?: string;
        }>[];
      }>;
      type Controller = Readonly<{
        readonly ready: Promise<PageDocument>;
        destroy(): Promise<void>;
      }>;
      type Core = Readonly<{
        mountPageDocument(
          host: HTMLElement,
          source: Readonly<{ html: string }>,
          options?: Readonly<{ compose?: ComposeOptions }>,
        ): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const source = {
        html: `
          <style>
            @page { size: 360px 420px; margin: 28px; }
            body { margin: 0; font: 12px/1.4 sans-serif; }
            section { break-before: page; }
            p { margin: 0 0 8px; }
          </style>
          <main>
            ${Array.from(
              { length: 90 },
              (_, index) =>
                `<p data-order="${index + 1}">Paragraph ${index + 1}: deterministic cooperative pagination.</p>`,
            ).join("")}
          </main>
        `,
      };

      const render = async (
        compose: ComposeOptions,
      ): Promise<
        readonly Readonly<{
          readonly blank: boolean;
          readonly bodyText: string;
          readonly name?: string;
          readonly html: string;
        }>[]
      > => {
        const host = document.body.appendChild(document.createElement("div"));
        const controller = core.mountPageDocument(host, source, { compose });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const elements = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
          return ready.pages.map((pageResult, index) => ({
            blank: pageResult.blank,
            bodyText: pageResult.bodyText,
            ...(pageResult.name === undefined ? {} : { name: pageResult.name }),
            html: elements[index]?.innerHTML ?? "",
          }));
        } finally {
          await controller.destroy();
          host.remove();
        }
      };

      const uninterrupted = await render({ yieldBudgetMs: Number.POSITIVE_INFINITY });
      let schedulerCalls = 0;
      const cooperative = await render({
        yieldBudgetMs: 0,
        scheduler: async () => {
          schedulerCalls += 1;
          await Promise.resolve();
        },
      });

      return { uninterrupted, cooperative, schedulerCalls };
    });

    expect(observation.schedulerCalls).toBeGreaterThan(0);
    expect(observation.cooperative).toEqual(observation.uninterrupted);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("aborts a yielded generation before a superseding generation starts", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = Readonly<{
        readonly pages: readonly Readonly<{ readonly bodyText: string }>[];
      }>;
      type Controller = Readonly<{
        readonly ready: Promise<PageDocument>;
        readonly current: PageDocument | undefined;
        update(source: Readonly<{ html: string }>): Promise<PageDocument>;
        destroy(): Promise<void>;
      }>;
      type Core = Readonly<{
        mountPageDocument(
          host: HTMLElement,
          source: Readonly<{ html: string }>,
          options: Readonly<{
            compose: Readonly<{
              yieldBudgetMs: number;
              scheduler: () => Promise<void>;
            }>;
          }>,
        ): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      let blockNextYield = false;
      let releaseBlockedYield: (() => void) | undefined;
      let reportBlockedYield: (() => void) | undefined;
      const blockedYieldEntered = new Promise<void>((resolve) => {
        reportBlockedYield = resolve;
      });
      const controller = core.mountPageDocument(
        host,
        { html: "<p>COMMITTED-BASE</p>" },
        {
          compose: {
            yieldBudgetMs: 0,
            scheduler: () => {
              if (!blockNextYield) return Promise.resolve();
              blockNextYield = false;
              reportBlockedYield?.();
              return new Promise<void>((resolve) => {
                releaseBlockedYield = resolve;
              });
            },
          },
        },
      );

      try {
        await controller.ready;
        let maximumStagingFrames = 0;
        const countStagingFrames = () => {
          maximumStagingFrames = Math.max(
            maximumStagingFrames,
            host.querySelectorAll('iframe[data-imposia-frame="page-document-staging"]').length,
          );
        };
        const observer = new MutationObserver(countStagingFrames);
        observer.observe(host, { childList: true });

        blockNextYield = true;
        let losingStatus = "pending";
        const losing = controller
          .update({
            html: `<main>${Array.from(
              { length: 150 },
              (_, index) => `<p>LOSING-${index + 1}</p>`,
            ).join("")}</main>`,
          })
          .then(
            () => {
              losingStatus = "resolved";
            },
            (error: unknown) => {
              losingStatus = error instanceof DOMException ? error.name : "rejected";
            },
          );
        await blockedYieldEntered;
        countStagingFrames();
        const committedWhileYielded = controller.current?.pages[0]?.bodyText ?? "";

        const winning = await controller.update({ html: "<p>COMMITTED-WINNER</p>" });
        await Promise.resolve();
        const losingStatusBeforeRelease = losingStatus;
        releaseBlockedYield?.();
        await losing;
        observer.disconnect();

        return {
          committedWhileYielded,
          winningText: winning.pages[0]?.bodyText ?? "",
          losingStatusBeforeRelease,
          maximumStagingFrames,
        };
      } finally {
        releaseBlockedYield?.();
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.committedWhileYielded).toContain("COMMITTED-BASE");
    expect(observation.winningText).toContain("COMMITTED-WINNER");
    expect(observation.losingStatusBeforeRelease).toBe("AbortError");
    expect(observation.maximumStagingFrames).toBeLessThanOrEqual(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("yields within one deeply fragmenting text node", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type Controller = Readonly<{
        readonly ready: Promise<Readonly<{ readonly pageCount: number }>>;
        destroy(): Promise<void>;
      }>;
      type Core = Readonly<{
        mountPageDocument(
          host: HTMLElement,
          source: Readonly<{ html: string }>,
          options: Readonly<{
            compose: Readonly<{
              yieldBudgetMs: number;
              scheduler: () => Promise<void>;
            }>;
          }>,
        ): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      let schedulerCalls = 0;
      const controller = core.mountPageDocument(
        host,
        {
          html: `
            <style>
              @page { size: 320px 360px; margin: 24px; }
              body { margin: 0; font: 12px/1.4 sans-serif; }
              p { margin: 0; }
            </style>
            <p>${Array.from({ length: 600 }, (_, index) => `fragment-${index + 1}`).join(" ")}</p>
          `,
        },
        {
          compose: {
            yieldBudgetMs: 0,
            scheduler: async () => {
              schedulerCalls += 1;
              await Promise.resolve();
            },
          },
        },
      );

      try {
        const ready = await controller.ready;
        return { schedulerCalls, pageCount: ready.pageCount };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.pageCount).toBeGreaterThan(1);
    expect(observation.schedulerCalls).toBeGreaterThan(10);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("reports provisional progress as each page is allocated", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type Progress = Readonly<{
        completedPages: number;
        pass: number;
        provisional: true;
      }>;
      type Controller = Readonly<{
        readonly ready: Promise<Readonly<{ readonly pageCount: number }>>;
        destroy(): Promise<void>;
      }>;
      type Core = Readonly<{
        mountPageDocument(
          host: HTMLElement,
          source: Readonly<{ html: string }>,
          options: Readonly<{ onProgress(progress: Progress): void }>,
        ): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const progress: Array<Progress & Readonly<{ stagingPages: number; canonicalPages: number }>> =
        [];
      const controller = core.mountPageDocument(
        host,
        {
          html: `
            <style>
              @page { size: 320px 360px; margin: 24px; }
              body { margin: 0; font: 12px/1.4 sans-serif; }
              p { min-height: 72px; margin: 0; }
            </style>
            <main>${Array.from({ length: 40 }, (_, index) => `<p>PROGRESS-${index + 1}</p>`).join(
              "",
            )}</main>
          `,
        },
        {
          onProgress(event) {
            const staging = host.querySelector<HTMLIFrameElement>(
              'iframe[data-imposia-frame="page-document-staging"]',
            );
            const canonical = host.querySelector<HTMLIFrameElement>(
              'iframe[data-imposia-frame="page-document"]',
            );
            progress.push({
              ...event,
              stagingPages:
                staging?.contentDocument?.querySelectorAll("[data-imposia-page]").length ?? 0,
              canonicalPages:
                canonical?.contentDocument?.querySelectorAll("[data-imposia-page]").length ?? 0,
            });
          },
        },
      );

      try {
        const ready = await controller.ready;
        return { progress, pageCount: ready.pageCount };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.pageCount).toBeGreaterThan(2);
    expect(observation.progress[0]).toEqual({
      completedPages: 1,
      pass: 1,
      provisional: true,
      stagingPages: 1,
      canonicalPages: 0,
    });
    expect(observation.progress.at(-1)?.completedPages).toBe(observation.pageCount);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("counts scheduler waits against the wall-clock resource deadline", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type Controller = Readonly<{
        readonly ready: Promise<unknown>;
        destroy(): Promise<void>;
      }>;
      type Core = Readonly<{
        mountPageDocument(
          host: HTMLElement,
          source: Readonly<{ html: string }>,
          options: Readonly<{
            limits: Readonly<{ resourceDeadlineMs: number }>;
            compose: Readonly<{
              yieldBudgetMs: number;
              scheduler: () => Promise<void>;
            }>;
          }>,
        ): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(
        host,
        { html: "<p>deadline-bound pagination</p>" },
        {
          limits: { resourceDeadlineMs: 50 },
          compose: {
            yieldBudgetMs: 0,
            scheduler: () => new Promise<void>(() => undefined),
          },
        },
      );
      const startedAt = performance.now();
      try {
        await controller.ready;
        return { code: "resolved", elapsedMs: performance.now() - startedAt };
      } catch (error: unknown) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "unknown";
        return { code, elapsedMs: performance.now() - startedAt };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.code).toBe("RESOURCE_TIMEOUT");
    expect(observation.elapsedMs).toBeLessThan(1_000);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
