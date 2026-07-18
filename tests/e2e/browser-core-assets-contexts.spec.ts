import { expect, test } from "@playwright/test";
import type {
  AssetKind,
  AssetResolution,
  AssetResolver,
  Controller,
  CoreModule,
  RequestRecord,
} from "./browser-core-assets-support.js";
import { captureBrowserErrors } from "./browser-core-support.js";

test.describe("Chromium Core asset contexts", () => {
  test("discovers, rewrites, and awaits every supported asset context", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    const authoredHostRequests: string[] = [];
    const routePatterns = [
      "http://assets.example.test/**",
      "https://assets.example.test/**",
    ] as const;
    const abortAuthoredHost = async (route: import("@playwright/test").Route): Promise<void> => {
      authoredHostRequests.push(route.request().url());
      await route.abort();
    };
    for (const pattern of routePatterns) await page.route(pattern, abortAuthoredHost);

    try {
      await page.goto("/examples/book.html");
      const observation = await page.evaluate(async () => {
        const baseUrl = "https://assets.example.test/book/";
        const dataComma = "data:image/png,inline,payload";
        const png = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          ),
          (character) => character.charCodeAt(0),
        );
        const requests: RequestRecord[] = [];
        const expected = [
          { url: "https://assets.example.test/styles.css", kind: "stylesheet" },
          { url: "http://assets.example.test/img-http.png", kind: "image" },
          { url: "https://assets.example.test/set-1.png", kind: "image" },
          { url: "//assets.example.test/set-2.png", kind: "image" },
          { url: dataComma, kind: "image" },
          { url: "file:///tmp/picture.png", kind: "image" },
          { url: "blob:https://caller.example.test/picture.png", kind: "image" },
          { url: "data:image/png,input-token", kind: "image" },
          { url: "blob:https://caller.example.test/poster.png", kind: "image" },
          { url: "file:///tmp/audio.mp4", kind: "media" },
          { url: "https://assets.example.test/video.mp4", kind: "media" },
          { url: "//assets.example.test/media.mp4", kind: "media" },
          { url: "data:text/vtt,WEBVTT%0A", kind: "media" },
          { url: "file:///tmp/probe.woff2", kind: "font" },
          { url: "data:image/png,css-image", kind: "image" },
        ] as const;
        const resolutions = {
          stylesheet: {
            status: "resolved",
            bytes: new TextEncoder().encode(".linked { color: rgb(1 2 3); }"),
            mimeType: "text/css",
          },
          font: { status: "resolved", bytes: new Uint8Array([0]), mimeType: "font/woff2" },
          media: { status: "resolved", bytes: new Uint8Array([0]), mimeType: "video/mp4" },
          image: { status: "resolved", bytes: png, mimeType: "image/png" },
        } satisfies Record<AssetKind, AssetResolution>;
        const resolver: AssetResolver = async ({ url, kind, baseUrl: requestBase, signal }) => {
          requests.push({
            url,
            kind,
            baseUrl: requestBase,
            hasSignal: signal instanceof AbortSignal,
          });
          return resolutions[kind];
        };
        let releaseImage: (() => void) | undefined;
        let releaseFont: (() => void) | undefined;
        let releaseMedia: (() => void) | undefined;
        const imageGate = new Promise<void>((resolve) => {
          releaseImage = resolve;
        });
        const fontGate = new Promise<void>((resolve) => {
          releaseFont = resolve;
        });
        const mediaGate = new Promise<void>((resolve) => {
          releaseMedia = resolve;
        });
        let imageStartedResolve: (() => void) | undefined;
        let fontStartedResolve: (() => void) | undefined;
        let mediaStartedResolve: (() => void) | undefined;
        const imageStarted = new Promise<void>((resolve) => {
          imageStartedResolve = resolve;
        });
        const fontStarted = new Promise<void>((resolve) => {
          fontStartedResolve = resolve;
        });
        const mediaStarted = new Promise<void>((resolve) => {
          mediaStartedResolve = resolve;
        });
        const calls = { image: 0, font: 0, media: 0 };
        const completed = { image: 0, font: 0, media: 0 };
        const originalCreateImageBitmap = window.createImageBitmap;
        const originalFontLoad = FontFace.prototype.load;
        const originalMediaLoad = HTMLMediaElement.prototype.load;
        const host = document.body.appendChild(document.createElement("div"));
        let controller: Controller | undefined;
        let readySettled = false;
        try {
          window.createImageBitmap = function (
            source: ImageBitmapSource,
            options?: ImageBitmapOptions,
          ): Promise<ImageBitmap> {
            calls.image += 1;
            imageStartedResolve?.();
            return imageGate
              .then(() => originalCreateImageBitmap(source, options))
              .then((bitmap) => {
                completed.image += 1;
                return bitmap;
              });
          };
          FontFace.prototype.load = async function (): Promise<FontFace> {
            calls.font += 1;
            fontStartedResolve?.();
            await fontGate;
            completed.font += 1;
            return this;
          };
          HTMLMediaElement.prototype.load = function (): void {
            calls.media += 1;
            mediaStartedResolve?.();
            void mediaGate.then(() => {
              completed.media += 1;
              this.dispatchEvent(new Event("loadedmetadata"));
            });
          };

          const core = (await import("/packages/core/dist/index.js")) as CoreModule;
          controller = core.mountPageDocument(
            host,
            {
              baseUrl,
              html: `<!doctype html><html><head>
                <link rel="stylesheet" href="https://assets.example.test/styles.css">
                <style>
                  @font-face { font-family: Probe; src: local("Arial"), url("file:///tmp/probe.woff2") format("woff2"); }
                  .css-image { background-image: url("data:image/png,css-image"); }
                </style>
              </head><body>
                <img id="img-src" src="http://assets.example.test/img-http.png" alt="">
                <img id="img-srcset" srcset="https://assets.example.test/set-1.png 1x, //assets.example.test/set-2.png 2x, ${dataComma} 2x, https://assets.example.test/malformed.png 3q, https://assets.example.test/two-descriptors.png 1x 2x">
                <picture><source id="picture-source" srcset="file:///tmp/picture.png 320w, blob:https://caller.example.test/picture.png 640w"></picture>
                <input id="input-image" type="image" src="data:image/png,input-token" alt="">
                <video id="video-poster" preload="none" poster="blob:https://caller.example.test/poster.png"></video>
                <audio id="audio-src" preload="none" src="file:///tmp/audio.mp4"></audio>
                <video id="video-src" preload="none" src="https://assets.example.test/video.mp4"></video>
                <video id="media-container" preload="none"><source id="media-source" src="//assets.example.test/media.mp4"><track id="track" src="data:text/vtt,WEBVTT%0A" kind="captions"></video>
                <div class="css-image">asset contexts</div>
              </body></html>`,
            },
            { assetResolver: resolver },
          );
          const ready = controller.ready.then(
            (value) => {
              readySettled = true;
              return value;
            },
            (error: unknown) => {
              readySettled = true;
              throw error;
            },
          );
          const readySignal = ready.then(
            () => "ready" as const,
            () => "ready" as const,
          );
          await Promise.race([imageStarted.then(() => "image" as const), readySignal]);
          const readyBeforeImageRelease = !readySettled && calls.image > 0;
          releaseImage?.();
          await Promise.race([fontStarted.then(() => "font" as const), readySignal]);
          const readyBeforeFontRelease = !readySettled && calls.font > 0;
          releaseFont?.();
          await Promise.race([mediaStarted.then(() => "media" as const), readySignal]);
          const readyBeforeMediaRelease = !readySettled && calls.media > 0;
          releaseMedia?.();
          const snapshot = await ready;
          const frameDocument = snapshot.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const frameHtml = frameDocument.documentElement.outerHTML;
          return {
            requests,
            frameHtml,
            imgSrcset: frameDocument.querySelector("#img-srcset")?.getAttribute("srcset") ?? "",
            pictureSrcset:
              frameDocument.querySelector("#picture-source")?.getAttribute("srcset") ?? "",
            styleText: [...frameDocument.querySelectorAll("style")]
              .map((style) => style.textContent ?? "")
              .join("\n"),
            readyBeforeImageRelease,
            readyBeforeFontRelease,
            readyBeforeMediaRelease,
            calls,
            completed,
            baseUrl,
            expected,
          };
        } finally {
          await controller?.destroy();
          window.createImageBitmap = originalCreateImageBitmap;
          FontFace.prototype.load = originalFontLoad;
          HTMLMediaElement.prototype.load = originalMediaLoad;
          host.replaceChildren();
        }
      });

      expect(observation.requests).toHaveLength(observation.expected.length);
      for (const request of observation.expected) {
        expect(observation.requests).toContainEqual({
          ...request,
          baseUrl: observation.baseUrl,
          hasSignal: true,
        });
      }
      expect(observation.requests).not.toContainEqual(
        expect.objectContaining({ url: expect.stringContaining("malformed.png") }),
      );
      expect(observation.requests).not.toContainEqual(
        expect.objectContaining({ url: expect.stringContaining("two-descriptors.png") }),
      );
      expect(observation.imgSrcset).toMatch(/blob:[^,\s]+\s1x/);
      expect(observation.imgSrcset).toMatch(/blob:[^,\s]+\s2x/);
      expect(observation.pictureSrcset).toMatch(/blob:[^,\s]+\s320w/);
      expect(observation.pictureSrcset).toMatch(/blob:[^,\s]+\s640w/);
      expect(observation.styleText).toMatch(/@font-face[^{]*\{[^}]*url\(\s*blob:/i);
      expect(observation.styleText).not.toMatch(/local\s*\(/i);
      expect(observation.frameHtml).toMatch(/blob:/);
      expect(observation.frameHtml).not.toMatch(
        /(?:^|[\s"'(=])(?:https?:\/\/|file:|blob:https:\/\/caller|data:)/i,
      );
      for (const authoredUrl of observation.expected.map((item) => item.url)) {
        expect(observation.frameHtml).not.toContain(authoredUrl);
      }
      expect(observation.readyBeforeImageRelease).toBe(true);
      expect(observation.readyBeforeFontRelease).toBe(true);
      expect(observation.readyBeforeMediaRelease).toBe(true);
      expect(observation.completed.image).toBe(observation.calls.image);
      expect(observation.completed.font).toBe(observation.calls.font);
      expect(observation.completed.media).toBe(observation.calls.media);
      expect(authoredHostRequests).toEqual([]);
    } finally {
      for (const pattern of routePatterns) await page.unroute(pattern);
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });
});
