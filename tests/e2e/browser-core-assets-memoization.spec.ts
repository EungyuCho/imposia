import { expect, test } from "@playwright/test";
import { assertNoBrowserErrors, openAssetPage } from "./browser-core-assets-support.js";

// Equivalence oracle for within-generation asset resolution memoization
// (ASA-427): duplicate references to the same (kind, absolutized URL) resolve
// through one host resolver call, while every occurrence keeps its own policy
// veto, limit accounting, and substitution. The memoized document must stay
// structurally identical to a per-occurrence surrogate (unique URLs, same
// bytes), with blob: URLs normalized to hashes of their fetched bytes.

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("memoizes duplicate asset references per absolutized URL without changing committed output", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = await openAssetPage(page, browserName);

  try {
    const observation = await page.evaluate(async (pngBase64) => {
      type Resolution =
        | { status: "resolved"; bytes: Uint8Array; mimeType: string; resolvedUrl?: string }
        | { status: "blocked" };
      type PageDocument = Readonly<{
        readonly iframe: HTMLIFrameElement;
        readonly pages: readonly Readonly<{
          readonly blank: boolean;
          readonly bodyText: unknown;
          readonly name?: string;
          readonly geometry: unknown;
        }>[];
        readonly warnings: readonly Readonly<Record<string, unknown>>[];
      }>;
      type Controller = Readonly<{
        readonly ready: Promise<PageDocument>;
        destroy(): Promise<void>;
      }>;
      type Core = Readonly<{
        mountPageDocument(
          host: HTMLElement,
          source: Readonly<{ html: string }>,
          options?: Record<string, unknown>,
        ): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const png = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));
      const css = new TextEncoder().encode(
        '.themed { background-image: url("../plate-1.png"); min-height: 12px; }',
      );

      const documentHtml = (urlFor: (index: number) => string) => `
        <style>
          @page { size: 360px 300px; margin: 30px; }
          body { margin: 0; font: 13px/1.5 Arial, sans-serif; }
          img { width: 60px; height: 45px; }
          .decorated { background-image: url("${urlFor(4)}"); min-height: 12px; }
        </style>
        <link rel="stylesheet" href="https://assets.example.test/styles/theme.css">
        <p><img src="${urlFor(1)}" alt="one"></p>
        <p><img src="${urlFor(2)}" alt="two"></p>
        <p><img src="${urlFor(3)}" alt="three"></p>
        <p class="decorated">decorated paragraph</p>
        <p class="decorated">decorated paragraph twin</p>
        <p class="themed">themed paragraph</p>
      `;

      const render = async (urlFor: (index: number) => string) => {
        const requests: string[] = [];
        const resolver = async ({
          url,
          kind,
        }: Readonly<{ url: string; kind: string }>): Promise<Resolution> => {
          requests.push(`${kind} ${url}`);
          if (kind === "stylesheet") {
            return {
              status: "resolved",
              bytes: css,
              mimeType: "text/css",
              resolvedUrl: "https://assets.example.test/styles/theme.css",
            };
          }
          return { status: "resolved", bytes: png, mimeType: "image/png" };
        };
        const host = document.body.appendChild(document.createElement("div"));
        const controller = core.mountPageDocument(
          host,
          { html: documentHtml(urlFor) },
          { assetResolver: resolver },
        );
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const digests = new Map<string, string>();
          const normalize = async (html: string): Promise<string> => {
            const blobUrls = [...new Set(html.match(/blob:[^"')\s\\]+/gu) ?? [])];
            for (const blobUrl of blobUrls) {
              if (!digests.has(blobUrl)) {
                const bytes = new Uint8Array(await (await fetch(blobUrl)).arrayBuffer());
                const digest = await crypto.subtle.digest("SHA-256", bytes);
                digests.set(
                  blobUrl,
                  [...new Uint8Array(digest)]
                    .map((byte) => byte.toString(16).padStart(2, "0"))
                    .join(""),
                );
              }
            }
            let normalized = html;
            for (const [blobUrl, digest] of digests) {
              normalized = normalized.split(blobUrl).join(`asset:${digest}`);
            }
            return normalized;
          };
          const pagesHtml = [];
          for (const element of frameDocument.querySelectorAll<HTMLElement>(
            "[data-imposia-page]",
          )) {
            pagesHtml.push(await normalize(element.innerHTML));
          }
          return {
            requests,
            pages: ready.pages.map((pageResult, index) => ({
              blank: pageResult.blank,
              bodyText: pageResult.bodyText,
              ...(pageResult.name === undefined ? {} : { name: pageResult.name }),
              geometry: pageResult.geometry,
              html: pagesHtml[index] ?? "",
            })),
            warnings: ready.warnings.map((warning) => JSON.parse(JSON.stringify(warning))),
          };
        } finally {
          await controller.destroy();
          host.remove();
        }
      };

      // Memoized run: the same image URL appears three times as <img>, twice
      // through an inline CSS url(), and once through the linked stylesheet's
      // relative "../plate-1.png" (absolutizes to the same resource).
      const memoized = await render(() => "https://assets.example.test/plate-1.png");
      // Surrogate for the per-occurrence path: unique URLs, identical bytes.
      const surrogate = await render(
        (index) => `https://assets.example.test/plate-1.png?occurrence=${index}`,
      );
      return { memoized, surrogate };
    }, PNG_BASE64);

    const imageRequests = observation.memoized.requests.filter((entry) =>
      entry.startsWith("image "),
    );
    // Engagement proof: one resolver call per unique (kind, absolutized URL).
    expect(imageRequests).toEqual(["image https://assets.example.test/plate-1.png"]);
    expect(
      observation.memoized.requests.filter((entry) => entry.startsWith("stylesheet ")),
    ).toHaveLength(1);
    // The surrogate resolves every occurrence separately (4 unique image URLs
    // from the authored document + 1 via the linked stylesheet).
    expect(
      observation.surrogate.requests.filter((entry) => entry.startsWith("image ")),
    ).toHaveLength(5);

    // Structural equivalence between memoized and per-occurrence resolution.
    expect(observation.memoized.pages).toEqual(observation.surrogate.pages);
    expect(observation.memoized.warnings).toEqual(observation.surrogate.warnings);
  } finally {
    assertNoBrowserErrors(errors, pageErrors);
  }
});

test("keeps occurrence-level policy vetoes and duplicate-inclusive limits with memoization", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = await openAssetPage(page, browserName);

  try {
    const observation = await page.evaluate(async (pngBase64) => {
      type Resolution =
        | { status: "resolved"; bytes: Uint8Array; mimeType: string }
        | { status: "blocked" };
      type PageDocument = Readonly<{
        readonly iframe: HTMLIFrameElement;
        readonly warnings: readonly Readonly<{
          code: string;
          sourceIdentity: string | undefined;
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
          options?: Record<string, unknown>,
        ): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const png = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));
      const html = `
        <style>@page { size: 360px 300px; margin: 30px; } img { width: 60px; height: 45px; }</style>
        <p><img src="https://assets.example.test/plate-1.png" alt="one"></p>
        <p><img src="https://assets.example.test/plate-1.png" alt="two"></p>
        <p><img src="https://assets.example.test/plate-1.png" alt="three"></p>
      `;

      // Policy oracle: an extension vetoes only the second occurrence.
      const policyRequests: string[] = [];
      const policyResolver = async ({ url }: Readonly<{ url: string }>): Promise<Resolution> => {
        policyRequests.push(url);
        return { status: "resolved", bytes: png, mimeType: "image/png" };
      };
      let seen = 0;
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(
        host,
        { html },
        {
          assetResolver: policyResolver,
          extensions: [
            {
              name: "acme/veto-second-occurrence",
              allowAsset() {
                seen += 1;
                return seen !== 2;
              },
            },
          ],
        },
      );
      let policy: {
        blockedWarning: { code: string; sourceIdentity: string | undefined } | undefined;
        imageSources: (string | null)[];
        resolverCalls: number;
      };
      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        policy = {
          blockedWarning: ready.warnings.find((warning) => warning.code === "RESOURCE_BLOCKED"),
          imageSources: [...frameDocument.querySelectorAll("img")].map((image) =>
            image.getAttribute("src"),
          ),
          resolverCalls: policyRequests.length,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }

      // Limit oracles: byte accounting stays duplicate-inclusive and the
      // reference limit stays per occurrence.
      const failureCode = async (options: Record<string, unknown>): Promise<string> => {
        const failureHost = document.body.appendChild(document.createElement("div"));
        const failureController = core.mountPageDocument(failureHost, { html }, options);
        try {
          await failureController.ready;
          return "none";
        } catch (error: unknown) {
          return error instanceof Error && "code" in error ? String(error.code) : "unknown";
        } finally {
          await failureController.destroy();
          failureHost.remove();
        }
      };
      const resolver = async (): Promise<Resolution> => ({
        status: "resolved",
        bytes: png,
        mimeType: "image/png",
      });
      const bytesCode = await failureCode({
        assetResolver: resolver,
        // Larger than one copy, smaller than the duplicate-inclusive sum.
        limits: { maxAssetBytes: png.byteLength * 3 - 1 },
      });
      const referenceCode = await failureCode({
        assetResolver: resolver,
        limits: { maxAssetReferences: 2 },
      });
      return { policy, bytesCode, referenceCode };
    }, PNG_BASE64);

    // The veto applies to exactly the vetoed occurrence: the first and third
    // occurrences share one resolved outcome while the vetoed second
    // occurrence is sanitized away (the pre-memoization behavior), and the
    // single RESOURCE_BLOCKED warning carries the vetoed occurrence's source
    // identity (resource-1, the second discovered request).
    expect(observation.policy.resolverCalls).toBe(1);
    expect(observation.policy.blockedWarning?.sourceIdentity).toBe("resource-1");
    expect(observation.policy.imageSources).toHaveLength(2);
    expect(observation.policy.imageSources[0]).toMatch(/^blob:/u);
    expect(observation.policy.imageSources[1]).toMatch(/^blob:/u);
    expect(observation.policy.imageSources[0]).toBe(observation.policy.imageSources[1]);

    expect(observation.bytesCode).toBe("ASSET_BYTES_LIMIT");
    expect(observation.referenceCode).toBe("ASSET_REFERENCE_LIMIT");
  } finally {
    assertNoBrowserErrors(errors, pageErrors);
  }
});
