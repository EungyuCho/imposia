import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ImposiaError } from "../../packages/core/src/errors.js";
import { createRenderer } from "../../packages/core/src/renderer.js";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Imposia Integration Book</title>
    <style>
      @page { size: A4; margin: 20mm; }
      body { font: 16px/1.5 Arial, sans-serif; color: #18201e; }
      section + section { break-before: page; }
      h1 { color: #0d6255; }
    </style>
  </head>
  <body>
    <template data-page-header><span>IMPOSIA</span></template>
    <template data-page-footer><span>{{pageNumber}} / {{totalPages}}</span></template>
    <section><h1>One</h1><p>First page.</p></section>
    <section><h1>Two</h1><p>Second page.</p></section>
    <section><h1>Three</h1><p>Third page.</p></section>
    <script>globalThis.compromised = true</script>
  </body>
</html>`;

function metadataTitle(info: unknown): string | undefined {
  if (typeof info !== "object" || info === null || !("Title" in info)) return undefined;
  const title = info.Title;
  return typeof title === "string" ? title : undefined;
}

describe("Chromium PDF renderer", () => {
  const renderer = createRenderer();

  afterAll(async () => {
    await renderer.close();
  });

  it("renders a paginated A4 PDF with ordered lifecycle hooks and document metadata", async () => {
    const events: string[] = [];
    const result = await renderer.render(
      { html },
      {
        onStart: () => events.push("start"),
        onWarning: (warning) => events.push(`warning:${warning.code}`),
        onResourcesReady: () => events.push("resources"),
        onPaginated: () => events.push("paginated"),
        onPdfReady: () => events.push("pdf"),
      },
    );

    expect([...result.pdf.subarray(0, 5)]).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(result.pageCount).toBe(3);
    expect(result.pages).toHaveLength(3);
    expect(result.pageSize.widthPoints).toBeCloseTo(595.28, 0);
    expect(result.pageSize.heightPoints).toBeCloseTo(841.89, 0);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["SCRIPT_REMOVED"]);
    expect(events).toEqual(["start", "warning:SCRIPT_REMOVED", "resources", "paginated", "pdf"]);
    expect(result.timings.totalMs).toBeGreaterThan(0);
    expect(result.timings.printPreparationMs).toBeGreaterThanOrEqual(0);
    expect(result.timings.pdfGenerationMs).toBeGreaterThanOrEqual(0);

    const pdf = await getDocument({ data: result.pdf.slice() }).promise;
    const metadata = await pdf.getMetadata();
    const markInfo = await pdf.getMarkInfo();
    expect(pdf.numPages).toBe(3);
    expect(metadataTitle(metadata.info)).toBe("Imposia Integration Book");
    expect(markInfo?.Marked).toBe(true);
    await pdf.destroy();
  });

  it("reuses the browser process across renders", async () => {
    const first = await renderer.render({ html: "<h1>Warm one</h1>" });
    const second = await renderer.render({ html: "<h1>Warm two</h1>" });

    expect(first.timings.browserStartupMs).toBeGreaterThanOrEqual(0);
    expect(second.timings.browserStartupMs).toBe(0);
  });

  it("rejects rendering after close", async () => {
    await renderer.close();

    await expect(renderer.render({ html: "<h1>Closed</h1>" })).rejects.toEqual(
      new ImposiaError("RENDERER_CLOSED", "Renderer is closed."),
    );
  });
});

describe("renderer lifecycle behavior", () => {
  it("does not launch after close starts inside onStart", async () => {
    const renderer = createRenderer();
    const render = renderer.render(
      { html: "<h1>Never launched</h1>" },
      { onStart: () => renderer.close() },
    );

    await expect(render).rejects.toEqual(
      new ImposiaError("RENDERER_CLOSED", "Renderer is closed."),
    );
    await renderer.close();
  });

  it("closes safely while concurrent renders are in flight", async () => {
    const renderer = createRenderer();
    let releaseStart: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const first = renderer.render({ html: "<h1>One</h1>" }, { onStart: () => gate });
    const second = renderer.render({ html: "<h1>Two</h1>" }, { onStart: () => gate });
    const closing = renderer.close();
    releaseStart?.();

    await expect(first).rejects.toMatchObject({ code: "RENDERER_CLOSED" });
    await expect(second).rejects.toMatchObject({ code: "RENDERER_CLOSED" });
    await closing;
    await renderer.close();
  });

  it("cancels a render when close starts after resources become ready", async () => {
    const renderer = createRenderer();
    const render = renderer.render(
      { html: "<h1>Loaded</h1>" },
      { onResourcesReady: () => renderer.close() },
    );

    await expect(render).rejects.toMatchObject({ code: "RENDERER_CLOSED" });
    await renderer.close();
  });

  it("loads print-only resources before every resources-ready hook", async () => {
    let printAssetRequests = 0;
    const printAssetUrls: string[] = [];
    const server = createServer((request, response) => {
      if (request.url?.startsWith("/print.svg") === true) {
        printAssetRequests += 1;
        printAssetUrls.push(request.url);
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "image/svg+xml",
        });
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Missing test port.");
    const renderer = createRenderer();
    const urlsAtReady: string[][] = [];

    try {
      for (let index = 0; index < 2; index += 1) {
        const printHtml = `<style>@media print{body{background-image:url(http://127.0.0.1:${address.port}/print.svg?run=${index})}}</style><h1>Print</h1>`;
        await renderer.render(
          { html: printHtml },
          {
            allowRemoteResources: true,
            onResourcesReady() {
              urlsAtReady.push([...printAssetUrls]);
            },
          },
        );
      }
      expect(printAssetRequests).toBe(2);
      expect(printAssetUrls).toEqual(["/print.svg?run=0", "/print.svg?run=1"]);
      expect(urlsAtReady).toEqual([["/print.svg?run=0"], ["/print.svg?run=0", "/print.svg?run=1"]]);
    } finally {
      await renderer.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    }
  });

  it("remains reusable after a successful concurrent burst", async () => {
    const renderer = createRenderer();
    try {
      const burst = await Promise.all([
        renderer.render({ html: "<h1>One</h1>" }),
        renderer.render({ html: "<h1>Two</h1>" }),
        renderer.render({ html: "<h1>Three</h1>" }),
      ]);
      expect(burst.map((result) => result.pageCount)).toEqual([1, 1, 1]);
      await expect(renderer.render({ html: "<h1>After</h1>" })).resolves.toMatchObject({
        pageCount: 1,
      });
    } finally {
      await renderer.close();
    }
  });

  it("discards a timed-out resource page and remains reusable", async () => {
    const server = createServer(() => undefined);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Missing test port.");
    const renderer = createRenderer();
    const stalledHtml = `<link rel="preload" as="image" href="http://127.0.0.1:${address.port}/slow.svg"><h1>Slow</h1>`;

    try {
      await expect(
        renderer.render({ html: stalledHtml }, { allowRemoteResources: true, timeoutMs: 100 }),
      ).rejects.toMatchObject({ code: "RESOURCE_TIMEOUT" });
      await expect(renderer.render({ html: "<h1>Recovered</h1>" })).resolves.toMatchObject({
        pageCount: 1,
      });
    } finally {
      await renderer.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    }
  });

  it("closes promptly after repeated tagged page-side renders and a post-PDF hook failure", async () => {
    const renderer = createRenderer();
    const pageSideHtml =
      '<style>.chapter{break-before:right}</style><section>One</section><section class="chapter">Two</section>';
    for (let index = 0; index < 10; index += 1) {
      await renderer.render({ html: pageSideHtml });
    }
    await expect(
      renderer.render(
        { html: pageSideHtml },
        {
          onPdfReady() {
            throw new Error("post-PDF hook failed");
          },
        },
      ),
    ).rejects.toThrow("post-PDF hook failed");

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      renderer.close().then(() => "closed" as const),
      new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), 2_000);
      }),
    ]);
    if (timeout !== undefined) clearTimeout(timeout);
    expect(outcome).toBe("closed");
  });

  it("blocks symlinked file subresources whose canonical target escapes the root", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "imposia-resource-root-"));
    const root = path.join(temporary, "root");
    const outside = path.join(temporary, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(
      path.join(root, "book.html"),
      '<link rel="stylesheet" href="escape.css"><section>One</section><section class="secret">Two</section>',
    );
    await writeFile(path.join(outside, "escape.css"), ".secret { break-before: page; }");
    await symlink(path.join(outside, "escape.css"), path.join(root, "escape.css"));
    const renderer = createRenderer();

    try {
      const result = await renderer.render(
        { file: path.join(root, "book.html") },
        { allowFileRoot: root },
      );
      expect(result.pageCount).toBe(1);
    } finally {
      await renderer.close();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("remains safely closable after a browser launch rejection", async () => {
    vi.stubEnv("IMPOSIA_CHROMIUM_EXECUTABLE", "/definitely/missing/imposia-chromium");
    const renderer = createRenderer();
    try {
      await expect(renderer.render({ html: "<h1>No browser</h1>" })).rejects.toThrow(
        /executable doesn't exist|Failed to launch/i,
      );
      await renderer.close();
      await renderer.close();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
