import { expect, test } from "@playwright/test";
import type { AssetResolution, AssetResolver, Controller } from "./browser-core-assets-support.js";
import { assertNoBrowserErrors, openAssetPage } from "./browser-core-assets-support.js";

type PageLimits = Readonly<Partial<Record<string, number>>>;
type BrowserImposiaError = Error & { readonly code: string };
type BrowserOptions = { readonly assetResolver?: AssetResolver; readonly limits?: PageLimits };
type BrowserCoreModule = {
  readonly ImposiaError: new (code: string, message: string) => BrowserImposiaError;
  mountPageDocument(
    container: HTMLElement,
    source: { readonly html: string; readonly baseUrl?: string },
    options?: BrowserOptions,
  ): Controller;
};
type Failure = { readonly code: string; readonly message: string };

const PNG_BYTES =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.describe("browser core asset limits (Chromium)", () => {
  test("validates ceilings and fails at reference, byte, and depth crossings", async ({ page }) => {
    const { errors, pageErrors } = await openAssetPage(page, "chromium");
    try {
      const observation = await page.evaluate(async (pngBase64) => {
        const core = (await import("/packages/core/dist/index.js")) as BrowserCoreModule;
        const png = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));
        const run = async (html: string, options: BrowserOptions): Promise<Failure | undefined> => {
          const host = document.body.appendChild(document.createElement("div"));
          let controller: Controller | undefined;
          try {
            controller = core.mountPageDocument(host, { html }, options);
            await controller.ready;
            return undefined;
          } catch (error: unknown) {
            return error instanceof core.ImposiaError
              ? { code: error.code, message: error.message }
              : { code: "", message: error instanceof Error ? error.message : "unknown" };
          } finally {
            await controller?.destroy();
          }
        };
        const hard = {
          maxInputBytes: 5 * 1024 * 1024,
          maxNodes: 100_000,
          maxAssetBytes: 25 * 1024 * 1024,
          maxAssetDepth: 8,
          maxAssetReferences: 512,
          resourceDeadlineMs: 30_000,
          maxPages: 10_000,
        } as const;
        const keys = Object.keys(hard) as (keyof typeof hard)[];
        const reject = (limits: PageLimits): boolean => {
          try {
            core.mountPageDocument(document.body, { html: "<p>empty</p>" }, { limits });
            return false;
          } catch (error: unknown) {
            return error instanceof Error;
          }
        };
        const acceptedHard = (await run("<p>empty</p>", { limits: hard })) === undefined;
        const referenceRequests: string[] = [];
        const referenceFailure = await run('<img src="first.png"><img src="second.png">', {
          limits: { maxAssetReferences: 1 },
          assetResolver: async ({ url }) => {
            referenceRequests.push(url);
            return { status: "resolved", bytes: png, mimeType: "image/png" };
          },
        });
        const rejectedBytes = Uint8Array.from([1, 2, 3, 4]);
        const byteRequests: string[] = [];
        const byteFailure = await run(
          '<img src="rejected.png"><img src="crossing.png"><img src="unseen.png">',
          {
            limits: { maxAssetBytes: rejectedBytes.byteLength + png.byteLength - 1 },
            assetResolver: async ({ url }) => {
              byteRequests.push(url);
              return url === "rejected.png"
                ? { status: "resolved", bytes: rejectedBytes, mimeType: "text/plain" }
                : url === "crossing.png"
                  ? { status: "resolved", bytes: png, mimeType: "image/png" }
                  : { status: "resolved", bytes: Uint8Array.from([9]), mimeType: "text/plain" };
            },
          },
        );
        const depthRun = async (maxAssetDepth: number) => {
          const requests: string[] = [];
          const failure = await run('<link rel="stylesheet" href="root.css">', {
            limits: { maxAssetDepth },
            assetResolver: async ({ url }) => {
              requests.push(url);
              if (url === "root.css") {
                return {
                  status: "resolved",
                  bytes: new TextEncoder().encode(
                    '@import "nested.css"; .direct{background:url(direct.png)}',
                  ),
                  mimeType: "text/css",
                };
              }
              if (url === "nested.css") {
                return {
                  status: "resolved",
                  bytes: new TextEncoder().encode(".nested{background:url(nested.png)}"),
                  mimeType: "text/css",
                };
              }
              return { status: "resolved", bytes: png, mimeType: "image/png" };
            },
          });
          return { requests, failure };
        };
        return {
          accepted: [acceptedHard, !reject({ maxAssetReferences: 512 })],
          invalid: keys.flatMap((key) => [reject({ [key]: hard[key] + 1 }), reject({ [key]: 0 })]),
          fractionalReference: reject({ maxAssetReferences: 1.5 }),
          reference: { requests: referenceRequests, failure: referenceFailure },
          bytes: { requests: byteRequests, failure: byteFailure },
          depth: { direct: await depthRun(1), nested: await depthRun(2) },
        };
      }, PNG_BYTES);
      expect(observation.accepted).toEqual([true, true]);
      expect(observation.invalid).toEqual(new Array(14).fill(true));
      expect(observation.fractionalReference).toBe(true);
      expect(observation.reference.requests).toEqual(["first.png"]);
      expect(observation.reference.failure).toEqual({
        code: "ASSET_REFERENCE_LIMIT",
        message: "Asset reference limit exceeded.",
      });
      expect(observation.bytes.requests.slice(0, 2)).toEqual(["rejected.png", "crossing.png"]);
      expect(observation.bytes.failure).toEqual({
        code: "ASSET_BYTES_LIMIT",
        message: "Asset byte limit exceeded.",
      });
      expect(observation.depth.direct.requests).toEqual(["root.css", "direct.png"]);
      expect(observation.depth.nested.requests).toEqual(["root.css", "nested.css", "direct.png"]);
      expect(observation.depth.direct.failure).toEqual({
        code: "ASSET_DEPTH_LIMIT",
        message: "Asset depth limit exceeded.",
      });
      expect(observation.depth.nested.failure).toEqual(observation.depth.direct.failure);
    } finally {
      assertNoBrowserErrors(errors, pageErrors);
    }
  });

  test("keeps an eight-call frontier and deterministic DOM across settlements", async ({
    page,
  }) => {
    const { errors, pageErrors } = await openAssetPage(page, "chromium");
    try {
      const observations = await page.evaluate(async (pngBase64) => {
        const core = (await import("/packages/core/dist/index.js")) as BrowserCoreModule;
        const png = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));
        const roots = "root.css a.png b.png blocked.png c.png d.png e.png f.png g.png".split(" ");
        const run = async (settlementOrder: "reverse" | "random") => {
          const requests: string[] = [];
          const pending = new Map<string, (resolution: AssetResolution) => void>();
          const callWaiters: Array<() => void> = [];
          let active = 0;
          let maximumActive = 0;
          let settledRoots = 0;
          let childBeforeFrontier = false;
          let resolveChild: (() => void) | undefined;
          const child = new Promise<void>((resolve) => {
            resolveChild = resolve;
          });
          const waitForCalls = async (count: number): Promise<void> => {
            if (requests.length >= count) return;
            await new Promise<void>((resolve) => callWaiters.push(resolve));
          };
          const resolver: AssetResolver = async ({ url }) => {
            requests.push(url);
            for (const resolve of callWaiters.splice(0)) resolve();
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            if (url === "child.png" && settledRoots < roots.length) childBeforeFrontier = true;
            return new Promise<AssetResolution>((resolve) => {
              pending.set(url, (resolution) => {
                active -= 1;
                if (roots.some((root) => root === url)) settledRoots += 1;
                resolve(resolution);
              });
              if (url === "child.png") resolveChild?.();
            });
          };
          const settle = (url: string): void => {
            const release = pending.get(url);
            if (release === undefined) throw new Error(`Missing pending asset: ${url}`);
            pending.delete(url);
            release(
              url === "root.css"
                ? {
                    status: "resolved",
                    bytes: new TextEncoder().encode(".child{background:url(child.png)}"),
                    mimeType: "text/css",
                  }
                : url === "blocked.png"
                  ? { status: "blocked", reason: "deterministic" }
                  : { status: "resolved", bytes: png, mimeType: "image/png" },
            );
          };
          const host = document.body.appendChild(document.createElement("div"));
          const html = `<link rel="stylesheet" href="root.css">${roots
            .slice(1)
            .map((url) => `<img src="${url}">`)
            .join("")}`;
          let controller: Controller | undefined;
          try {
            controller = core.mountPageDocument(host, { html }, { assetResolver: resolver });
            const readyWork = controller.ready;
            for (let settled = 0; settled < roots.length; settled += 1) {
              await waitForCalls(settled + 1);
              const available = roots.filter((url) => pending.has(url));
              const url =
                settlementOrder === "reverse"
                  ? available[available.length - 1]
                  : available[(settled * 3) % available.length];
              if (url === undefined) throw new Error("Missing frontier asset.");
              settle(url);
            }
            if (requests.slice(0, roots.length).join("\u0000") !== roots.join("\u0000")) {
              throw new Error("Asset frontier requests were not deterministic.");
            }
            if (childBeforeFrontier) {
              throw new Error("A child asset started before the root frontier settled.");
            }
            await child;
            settle("child.png");
            const ready = await readyWork;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            return {
              maximumActive,
              requests,
              warnings: ready.warnings,
              dom: frameDocument.documentElement.outerHTML.replace(/blob:[^"')\s]+/g, "blob:asset"),
            };
          } finally {
            await controller?.destroy();
          }
        };
        return {
          reverse: await run("reverse"),
          random: await run("random"),
        };
      }, PNG_BYTES);
      expect(
        Math.max(observations.reverse.maximumActive, observations.random.maximumActive),
      ).toBeLessThanOrEqual(8);
      expect(observations.reverse.requests).toEqual(observations.random.requests);
      expect(observations.reverse.warnings).toEqual(observations.random.warnings);
      expect(observations.reverse.dom).toBe(observations.random.dom);
    } finally {
      assertNoBrowserErrors(errors, pageErrors);
    }
  });
});
