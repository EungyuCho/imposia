import { expect, type Page, type Route, test } from "@playwright/test";
import type {
  AssetResolver,
  Controller,
  CoreModule,
  RequestRecord,
} from "./browser-core-assets-support.js";
import { captureBrowserErrors } from "./browser-core-support.js";

test.use({ browserName: "chromium" });

async function openZeroNetworkPage(page: Page, browserName: string) {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  const networkRequests: string[] = [];
  const blockRoute = async (route: Route) => {
    networkRequests.push(route.request().url());
    await route.abort();
  };
  await page.route("**://blocked.invalid/**", blockRoute);
  await page.route("**://assets.example.test/**", blockRoute);
  await page.goto("/examples/book.html");
  return { errors, pageErrors, networkRequests, blockRoute };
}

async function closeZeroNetworkPage(
  page: Page,
  opened: Awaited<ReturnType<typeof openZeroNetworkPage>>,
): Promise<void> {
  await page.unroute("**://blocked.invalid/**", opened.blockRoute);
  await page.unroute("**://assets.example.test/**", opened.blockRoute);
  expect(opened.errors).toEqual([]);
  expect(opened.pageErrors).toEqual([]);
}

const requestSignature = ({ url, kind, baseUrl, hasSignal }: RequestRecord): string =>
  `${kind}:${url}:${baseUrl ?? ""}:${hasSignal}`;

test("sanitizes unsupported contexts before resolver discovery and keeps blob CSP", async ({
  page,
  browserName,
}) => {
  const opened = await openZeroNetworkPage(page, browserName);
  try {
    const observation = await page.evaluate(async () => {
      const baseUrl = "https://assets.example.test/book/";
      const requests: RequestRecord[] = [];
      const resolver: AssetResolver = async ({ url, kind, baseUrl: requestBase, signal }) => {
        requests.push({
          url,
          kind,
          baseUrl: requestBase,
          hasSignal: signal instanceof AbortSignal,
        });
        return { status: "blocked" };
      };
      const core = (await import("/packages/core/dist/index.js")) as CoreModule;
      const host = document.body.appendChild(document.createElement("div"));
      let controller: Controller | undefined;
      const csp = (frameDocument: Document) =>
        frameDocument.querySelector("meta")?.getAttribute("content") ?? null;
      const metaCount = (frameDocument: Document) => frameDocument.querySelectorAll("meta").length;
      try {
        controller = core.mountPageDocument(
          host,
          {
            baseUrl,
            html: `<script style="background:url(https://blocked.invalid/script-style)" src="https://blocked.invalid/script.js">blocked.invalid</script>
              <form id="form" action="https://blocked.invalid/submit" style="background:url(https://blocked.invalid/form-style)"><input formaction="https://blocked.invalid/input"></form>
              <a id="nav" href="https://blocked.invalid/nav" ping="https://blocked.invalid/ping" target="_blank">Navigate</a>
              <iframe style="background:url(https://blocked.invalid/frame-style)" src="https://blocked.invalid/frame"></iframe>
              <object style="background:url(https://blocked.invalid/object-style)" data="https://blocked.invalid/object"></object>
              <embed style="background:url(https://blocked.invalid/embed-style)" src="https://blocked.invalid/embed">
              <frame style="background:url(https://blocked.invalid/frame-element-style)" src="https://blocked.invalid/frame-element">
              <portal style="background:url(https://blocked.invalid/portal-style)" src="https://blocked.invalid/portal"></portal>
              <meta style="background:url(https://blocked.invalid/meta-style)" name="author" content="blocked">
              <svg><use id="external-use" href="https://blocked.invalid/use#x"></use><rect style="background:url(https://blocked.invalid/svg-style)" filter="url(https://blocked.invalid/filter)" /></svg>`,
          },
          { assetResolver: resolver },
        );
        const initial = await controller.ready;
        const initialDocument = initial.iframe.contentDocument;
        if (initialDocument === null) throw new Error("Missing initial frame document.");
        const initialHtml = initialDocument.documentElement.outerHTML;
        const initialCsp = csp(initialDocument);
        const initialCspMetaCount = metaCount(initialDocument);
        const initialRemovedCount = initialDocument.querySelectorAll(
          "script,form,iframe,object,embed,frame,portal",
        ).length;
        const updated = await controller.update({
          baseUrl,
          html: '<img src="blocked.png" alt="blocked generation">',
        });
        const updatedDocument = updated.iframe.contentDocument;
        if (updatedDocument === null) throw new Error("Missing updated frame document.");
        return {
          requests,
          initialCsp,
          updatedCsp: csp(updatedDocument),
          initialHtml,
          updatedHtml: updatedDocument.documentElement.outerHTML,
          removedCount: initialRemovedCount,
          cspMetaCount: initialCspMetaCount,
          updatedCspMetaCount: metaCount(updatedDocument),
        };
      } finally {
        await controller?.destroy();
        host.remove();
      }
    });

    expect(observation.requests.map(requestSignature)).toEqual([
      "image:blocked.png:https://assets.example.test/book/:true",
    ]);
    expect(observation.initialCsp).toBe(observation.updatedCsp);
    for (const csp of [observation.initialCsp, observation.updatedCsp]) {
      expect(csp).toMatch(/img-src blob:;.*font-src blob:;.*media-src blob:/);
      expect(csp).not.toMatch(/(?:img|font|media)-src (?:'none'|data:)/);
    }
    expect(observation.removedCount).toBe(0);
    expect(observation.cspMetaCount).toBe(1);
    expect(observation.updatedCspMetaCount).toBe(1);
    expect(observation.initialHtml).not.toMatch(/blocked\.invalid|javascript:|url\(/i);
    expect(observation.updatedHtml).not.toMatch(/blocked\.png|assets\.example\.test/i);
    expect(opened.networkRequests).toEqual([]);
  } finally {
    await closeZeroNetworkPage(page, opened);
  }
});

test("isolates SVG fragments, raster blobs, and authored SVG URL schemes across updates", async ({
  page,
  browserName,
}) => {
  const opened = await openZeroNetworkPage(page, browserName);
  try {
    const observation = await page.evaluate(async () => {
      const baseUrl = "https://assets.example.test/svg/";
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      const requests: RequestRecord[] = [];
      const createdBlobUrls: string[] = [];
      const originalCreateObjectURL = URL.createObjectURL;
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: (value: Blob | MediaSource) => {
          const url = originalCreateObjectURL.call(URL, value);
          createdBlobUrls.push(url);
          return url;
        },
      });
      const resolver: AssetResolver = async ({ url, kind, baseUrl: requestBase, signal }) => {
        requests.push({
          url,
          kind,
          baseUrl: requestBase,
          hasSignal: signal instanceof AbortSignal,
        });
        if (url === "vector.svg") {
          return {
            status: "resolved",
            bytes: new TextEncoder().encode("<svg />"),
            mimeType: "image/svg+xml",
          };
        }
        return { status: "resolved", bytes: png, mimeType: "image/png" };
      };
      const frameTokens = (frameDocument: Document): readonly string[] =>
        [...frameDocument.querySelectorAll("*")]
          .flatMap((element) =>
            [...element.attributes]
              .filter((attribute) =>
                /^(?:href|src|xlink:href|style|fill|stroke|filter|mask|clip-path|cursor)$/i.test(
                  attribute.name,
                ),
              )
              .flatMap((attribute) =>
                /^(?:href|src|xlink:href)$/i.test(attribute.name)
                  ? [attribute.value.trim()]
                  : [...attribute.value.matchAll(/url\(\s*["']?([^"')\s]+)/gi)].map(
                      (match) => match[1] ?? "",
                    ),
              ),
          )
          .filter((token) => token !== "");
      const core = (await import("/packages/core/dist/index.js")) as CoreModule;
      const host = document.body.appendChild(document.createElement("div"));
      let controller: Controller | undefined;
      const source = (
        raster: string,
      ) => `<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="local-filter"/><mask id="local-mask"/><linearGradient id="local-paint"/><path id="local-cursor"/></defs>
        <use id="local-use" href=" &#35;frag " /><use id="encoded-use" href="%23frag" /><use id="external-use" href="https://blocked.invalid/use#frag" />
        <rect id="frag" filter="url(#local-filter)" mask="url(#local-mask)" fill="url(#local-paint)" cursor="url(#local-cursor)" style="stroke:url(#local-paint)" />
        <rect id="raw" fill="url(blob:https://caller.invalid/raw)" stroke="url(data:image/png;base64,AAAA)" filter="url(http://blocked.invalid/filter)" mask="url(file:///tmp/raw)" cursor="url(//blocked.invalid/raw)" style="fill:url(https://blocked.invalid/paint);background:url(https://blocked.invalid/raw)" />
        <image id="raster" href="${raster}" /><feImage id="raster-filter" href="${raster}" /><feImage id="vector" href="vector.svg" /><animate id="animation" href="https://blocked.invalid/animation" /></svg>`;
      const snapshot = (frameDocument: Document) => ({
        tokens: frameTokens(frameDocument),
        localUse: frameDocument.querySelector("#local-use")?.getAttribute("href") ?? null,
        encodedUse: frameDocument.querySelector("#encoded-use")?.getAttribute("href") ?? null,
        vectorHref: frameDocument.querySelector("#vector")?.getAttribute("href") ?? null,
        animationCount: frameDocument.querySelectorAll(
          "animate,animateMotion,animateTransform,set,discard",
        ).length,
      });
      try {
        controller = core.mountPageDocument(
          host,
          { baseUrl, html: source("raster.png") },
          { assetResolver: resolver },
        );
        const initial = await controller.ready;
        const initialDocument = initial.iframe.contentDocument;
        if (initialDocument === null) throw new Error("Missing initial SVG document.");
        const before = snapshot(initialDocument);
        const updated = await controller.update({ baseUrl, html: source("texture.png") });
        const updatedDocument = updated.iframe.contentDocument;
        if (updatedDocument === null) throw new Error("Missing updated SVG document.");
        return { before, after: snapshot(updatedDocument), requests, createdBlobUrls };
      } finally {
        await controller?.destroy();
        Object.defineProperty(URL, "createObjectURL", {
          configurable: true,
          value: originalCreateObjectURL,
        });
        host.remove();
      }
    });

    expect(observation.requests.map(requestSignature)).toEqual([
      "image:raster.png:https://assets.example.test/svg/:true",
      "image:raster.png:https://assets.example.test/svg/:true",
      "image:vector.svg:https://assets.example.test/svg/:true",
      "image:texture.png:https://assets.example.test/svg/:true",
      "image:texture.png:https://assets.example.test/svg/:true",
      "image:vector.svg:https://assets.example.test/svg/:true",
    ]);
    expect(observation.before.localUse).toBe("#frag");
    expect(observation.before.encodedUse).toBeNull();
    expect(observation.before.vectorHref).toBeNull();
    expect(observation.after.localUse).toBe("#frag");
    expect(observation.after.vectorHref).toBeNull();
    expect(observation.before.animationCount).toBe(0);
    expect(observation.after.animationCount).toBe(0);
    for (const token of [...observation.before.tokens, ...observation.after.tokens]) {
      expect(token.startsWith("#") || observation.createdBlobUrls.includes(token)).toBe(true);
    }
    expect(observation.createdBlobUrls.length).toBe(4);
    expect(opened.networkRequests).toEqual([]);
  } finally {
    await closeZeroNetworkPage(page, opened);
  }
});
