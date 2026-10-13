import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.describe("preview API", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/examples/book.html");
  });

  test("element resolvers, HTML export, and iframe title", async ({ page, browserName }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    const result = await page.evaluate(async (png) => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      let seenAttributes: Record<string, string> = {};
      let frozen = false;
      let aborted = false;
      const options = {
        iframeTitle: "Record preview",
        elements: [
          {
            selector: ".name",
            resolve: async (input: {
              attributes: Readonly<Record<string, string>>;
              text: string;
              signal: AbortSignal;
            }) => {
              seenAttributes = { ...input.attributes };
              frozen = Object.isFrozen(input.attributes);
              input.signal.addEventListener("abort", () => {
                aborted = true;
              });
              return { type: "text" as const, text: `<b>${input.text}</b>` };
            },
          },
          {
            selector: "#stamp",
            resolve: () => ({
              type: "image" as const,
              dataUrl: `data:image/png;base64,${png}`,
              alt: "stamp",
            }),
          },
        ],
      };
      const controller = core.mountPageDocument(
        host,
        {
          html: '<p class="name" data-id="7">Kim</p><span id="stamp" class="s" data-x="1"></span><p onclick="x()">t</p><script>1</script>',
        },
        options,
      );
      const titleBeforeReady = host.querySelector("iframe")?.title;
      options.iframeTitle = "mutated";
      const doc = await controller.ready;
      const frame = doc.iframe.contentDocument as Document;
      const img = frame.querySelector("img");
      const exported = await core.exportPageDocumentHtml(doc, { title: "<title>" });
      const exportPromise = core.exportPageDocumentHtml(doc);
      await controller.destroy();
      const afterDestroy = await exportPromise;
      const stale = await core.exportPageDocumentHtml(doc).then(
        () => "resolved",
        (error: Error & { code?: string }) => error.code,
      );
      let invalid = "";
      try {
        core.mountPageDocument(document.body, { html: "x" }, { iframeTitle: "  " });
      } catch (error) {
        invalid = (error as Error).message;
      }
      return {
        titleBeforeReady,
        titleAfter: doc.iframe.title,
        text: frame.querySelector(".name")?.textContent,
        hasB: frame.querySelector(".name b") !== null,
        imgSrc: img?.src ?? "",
        imgAlt: img?.alt,
        imgClass: img?.className,
        dataX: img?.getAttribute("data-x"),
        onclick: frame.querySelector("[onclick]") !== null,
        script: frame.querySelector("script") !== null,
        seenAttributes,
        frozen,
        aborted,
        exportedHasData: exported.includes("data:image/png;base64,"),
        exportedHasBlob: exported.includes("blob:"),
        exportedHasVirtual: exported.includes("imposia.invalid"),
        exportedTitle: exported.includes("<title>&lt;title&gt;</title>"),
        doctype: exported.startsWith("<!DOCTYPE html>"),
        afterDestroyHasData: afterDestroy.includes("data:image/png;base64,"),
        stale,
        invalid,
        iframesLeft: document.querySelectorAll("iframe[data-imposia-frame]").length,
      };
    }, PNG);
    expect(result.titleBeforeReady).toBe("Record preview");
    expect(result.titleAfter).toBe("Record preview");
    expect(result.text).toBe("<b>Kim</b>");
    expect(result.hasB).toBe(false);
    expect(result.imgSrc).toMatch(/^blob:/);
    expect(result.imgAlt).toBe("stamp");
    expect(result.imgClass).toBe("s");
    expect(result.dataX).toBeNull();
    expect(result.onclick).toBe(false);
    expect(result.script).toBe(false);
    expect(result.seenAttributes).toEqual({ class: "name", "data-id": "7" });
    expect(result.frozen).toBe(true);
    expect(result.aborted).toBe(true);
    expect(result.exportedHasData).toBe(true);
    expect(result.exportedHasBlob).toBe(false);
    expect(result.exportedHasVirtual).toBe(false);
    expect(result.exportedTitle).toBe(true);
    expect(result.doctype).toBe(true);
    expect(result.afterDestroyHasData).toBe(true);
    expect(result.stale).toBe("DOCUMENT_UNAVAILABLE");
    expect(result.invalid).toBe("iframeTitle must be a non-empty string.");
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("failed element resolution keeps the previous document", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(
        host,
        { html: "<p>ok</p>" },
        {
          elements: [
            {
              selector: ".boom",
              resolve: () => {
                throw new Error("secret");
              },
            },
          ],
        },
      );
      const first = await controller.ready;
      const failure = await controller.update({ html: '<p class="boom">x</p>' }).then(
        () => "",
        (error: Error & { code?: string }) => `${error.code}:${error.message}`,
      );
      const invalidSelector = await core
        .mountPageDocument(
          document.body.appendChild(document.createElement("div")),
          { html: "<p>y</p>" },
          { elements: [{ selector: "[", resolve: () => undefined }] },
        )
        .ready.then(
          () => "",
          (error: Error & { code?: string }) => error.code ?? "",
        );
      return { failure, invalidSelector, same: controller.current === first };
    });
    expect(result.failure).toBe("ELEMENT_RESOLUTION_FAILED:Element resolution failed.");
    expect(result.invalidSelector).toBe("ELEMENT_RESOLUTION_FAILED");
    expect(result.same).toBe(true);
  });

  test("unicode-range font loading requests only needed faces", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const run = async (mode: "all" | "unicode-range", content: string) => {
        const requested: string[] = [];
        const host = document.body.appendChild(document.createElement("div"));
        const controller = core.mountPageDocument(
          host,
          {
            html: '<style>@import url("https://fonts.example.test/x.css");</style><p>가</p><div class="n"></div>',
          },
          {
            fontLoading: { mode },
            assetResolver: async ({ url, kind }) => {
              if (kind === "stylesheet") {
                return {
                  status: "resolved",
                  bytes: new TextEncoder().encode(
                    `.n::before{content:${content}}
                     @font-face{font-family:A;src:url(ga.woff2);unicode-range:U+AC00}
                     @font-face{font-family:A;src:url(na.woff2);unicode-range:U+B098}
                     @font-face{font-family:A;src:url(da.woff2);unicode-range:U+B2E4}`,
                  ),
                  mimeType: "text/css",
                };
              }
              requested.push(url.split("/").pop() ?? url);
              return { status: "blocked" };
            },
          },
        );
        await controller.ready;
        await controller.destroy();
        return requested;
      };
      return {
        all: await run("all", '"\\B098"'),
        filtered: await run("unicode-range", '"\\B098"'),
        dynamic: await run("unicode-range", "attr(data-label)"),
      };
    });
    expect(result.all).toEqual(["ga.woff2", "na.woff2", "da.woff2"]);
    expect(result.filtered).toEqual(["ga.woff2", "na.woff2"]);
    expect(result.dynamic).toEqual(["ga.woff2", "na.woff2", "da.woff2"]);
  });

  test("viewer keeps iframe title and honors fit/zoomable/keyboard", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: { "@imposia/core": "/packages/core/dist/index.js" },
      });
      document.head.append(importMap);
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const viewerModule = (await import("/packages/viewer/dist/index.js")) as {
        mountPageViewer: typeof import("@imposia/viewer").mountPageViewer;
      };
      const host = document.body.appendChild(document.createElement("div"));
      host.style.width = "200px";
      const controller = core.mountPageDocument(
        host,
        { html: '<p>one</p><p style="break-before:page">two</p>' },
        { iframeTitle: "Custom title" },
      );
      const doc = await controller.ready;
      const viewer = viewerModule.mountPageViewer(host, doc, {
        fit: "none",
        zoomable: false,
      });
      viewer.setZoom(2);
      const root = doc.iframe.closest("[role=region]") ?? host;
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      const out = {
        title: doc.iframe.title,
        zoom: viewer.state.zoom,
        page: viewer.state.page,
        transform: doc.iframe.style.transform,
        invalid: "",
      };
      viewer.destroy();
      try {
        viewerModule.mountPageViewer(host, doc, { fit: "bogus" as never });
      } catch (error) {
        out.invalid = (error as Error).message;
      }
      await controller.destroy();
      return out;
    });
    expect(result.title).toBe("Custom title");
    expect(result.zoom).toBe(1);
    expect(result.page).toBe(2);
    expect(result.transform).not.toMatch(/scale\(0\./);
    expect(result.invalid).toBe("Invalid viewer fit policy.");
  });
});
