import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { type Browser, chromium } from "@playwright/test";

// Comparison benchmark: Imposia, Paged.js, and Vivliostyle paginating the same
// independently written HTML and CSS in Chromium (roadmap item ASA-433).
//
// Clean-room method (docs/clean-room.md): Paged.js and Vivliostyle are black
// boxes. This script calls only their documented public entry points and
// observes public outcomes: promise resolution, documented events, the page
// count they report or the page elements they leave in the DOM, and wall time.
// Their bundles are fetched from jsDelivr at exact pinned versions and only
// measured (gzip length, SHA-256), never read. Neither library is a package
// dependency. Run `pnpm build` first; writes benchmarks/comparison.json.
// `--quick` takes one measured run without warmup, for checking the harness.

type LibraryId = "imposia" | "pagedjs" | "vivliostyle";
type ScenarioId = "paginate-200" | "edit-50";

interface Sample {
  readonly value: number;
  readonly pageCount: number;
}

type LibraryResult =
  | { readonly median: number; readonly samples: readonly number[]; readonly pageCount?: number }
  | { readonly error: string };

const QUICK = process.argv.includes("--quick");
const WARMUP_RUNS = QUICK ? 0 : 1;
const MEASURED_RUNS = QUICK ? 1 : 7;
const TIMEOUT_MS = 120_000;
const PORT = Number(process.env.IMPOSIA_BENCH_COMPARE_PORT ?? 4180);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const OUTPUT_PATH = "benchmarks/comparison.json";
const CORE_URL = `${ORIGIN}/packages/core/dist/index.js`;
const PAGEDJS_VERSION = "0.4.3";
const VIVLIOSTYLE_VERSION = "2.45.2";
// Paged.js publishes `dist/paged.js` as its browser build (the `browser`
// field); jsDelivr serves a minified copy at the `.min.js` path. The
// `pagedjs/+esm` build is not usable: jsDelivr's ESM conversion of one of its
// dependencies requests a malformed module URL.
const PAGEDJS_URL = `https://cdn.jsdelivr.net/npm/pagedjs@${PAGEDJS_VERSION}/dist/paged.min.js`;
// jsDelivr's ES module wrapper of the package main, `lib/vivliostyle.js`.
const VIVLIOSTYLE_URL = `https://cdn.jsdelivr.net/npm/@vivliostyle/core@${VIVLIOSTYLE_VERSION}/+esm`;
const LIBRARIES: readonly LibraryId[] = ["imposia", "pagedjs", "vivliostyle"];

const CSS = [
  "@page { size: A4; margin: 18mm; }",
  "body { margin: 0; font-family: serif; font-size: 16px; line-height: 1.5; }",
].join("\n");

// Same generator as scripts/benchmark.ts. With this CSS (18mm margins, 16px
// type at line-height 1.5) 600 sections make 200 Imposia pages and 149 make
// 50; scripts/benchmark.ts needs 731 and 182 under Imposia's default page style.
const SENTENCE = "The quick brown fox jumps over the lazy dog near the riverbank. ";
function article(word: string, sections: number): string {
  return Array.from(
    { length: sections },
    (_value, index) =>
      `<h2>Section ${index + 1}</h2><p>${word} ${SENTENCE.repeat(5)}</p>` +
      `<ul><li>${SENTENCE}</li><li>${SENTENCE.repeat(2)}</li></ul><p>${SENTENCE.repeat(3)}</p>`,
  ).join("");
}

const SCENARIOS = Object.freeze([
  {
    id: "paginate-200",
    description:
      "Paginate a 600-section article (headings, paragraphs, lists) at A4 with 18mm margins",
    unit: "ms",
    sections: 600,
  },
  {
    id: "edit-50",
    description:
      "Change one word in a 149-section report and show the updated pages (re-render only)",
    unit: "ms",
    sections: 149,
  },
] as const);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) throw new Error("No samples.");
  return Math.round(middle * 10) / 10;
}

const round = (value: number) => Math.round(value * 10) / 10;
const kib = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

// CDN bytes are fetched once per run and served to every browser context from
// memory, so each library runs the same bytes and network time is excluded.
const cdnCache = new Map<string, Buffer>();
async function cdn(url: string): Promise<Buffer> {
  const cached = cdnCache.get(url);
  if (cached !== undefined) return cached;
  let body: Buffer;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    body = Buffer.from(await response.arrayBuffer());
  } catch {
    // Some hosts firewall Node's own sockets; curl is the fallback transport.
    body = execFileSync("curl", ["-sfL", "--max-time", "60", url], { maxBuffer: 1 << 27 });
  }
  cdnCache.set(url, body);
  return body;
}

async function startServer(): Promise<ChildProcess> {
  const server = spawn(process.execPath, ["scripts/serve-viewer.mjs"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(CORE_URL);
      return server;
    } catch {
      await new Promise((settle) => setTimeout(settle, 100));
    }
  }
  server.kill();
  throw new Error(`Static server did not start on port ${PORT}.`);
}

function documentHtml(word: string, sections: number): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Benchmark</title>` +
    `<style>${CSS}</style></head><body>${article(word, sections)}</body></html>`
  );
}

async function runSample(
  browser: Browser,
  library: LibraryId,
  scenario: ScenarioId,
  sections: number,
): Promise<Sample> {
  // A fresh context per sample keeps libraries from sharing documents,
  // globals, stylesheets, or caches.
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  try {
    await context.route("https://cdn.jsdelivr.net/**", async (route) => {
      await route.fulfill({
        body: await cdn(route.request().url()),
        contentType: "text/javascript; charset=utf-8",
        headers: { "access-control-allow-origin": "*" },
      });
    });
    await context.route(`${ORIGIN}/__compare/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/__compare/index.html") {
        await route.fulfill({
          body: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body></body></html>',
          contentType: "text/html; charset=utf-8",
        });
      } else if (url.pathname === "/__compare/fixture.css") {
        await route.fulfill({ body: CSS, contentType: "text/css; charset=utf-8" });
      } else if (url.pathname === "/__compare/document.html") {
        const word = url.searchParams.get("word") ?? "alpha";
        await route.fulfill({
          body: documentHtml(word, Number(url.searchParams.get("sections"))),
          contentType: "text/html; charset=utf-8",
        });
      } else {
        await route.fulfill({ status: 404, body: "Not found" });
      }
    });
    const page = await context.newPage();
    // tsx keeps function names by wrapping them in a `__name` helper, which
    // the page-side code needs too.
    await page.addInitScript("globalThis.__name = (fn) => fn;");
    await page.goto(`${ORIGIN}/__compare/index.html`);
    const evaluation = page.evaluate(
      async ({
        library,
        scenario,
        sections,
        css,
        coreUrl,
        pagedjsUrl,
        vivliostyleUrl,
        timeout,
      }) => {
        const sentence = "The quick brown fox jumps over the lazy dog near the riverbank. ";
        const body = (word: string) =>
          Array.from(
            { length: sections },
            (_value, index) =>
              `<h2>Section ${index + 1}</h2><p>${word} ${sentence.repeat(5)}</p>` +
              `<ul><li>${sentence}</li><li>${sentence.repeat(2)}</li></ul><p>${sentence.repeat(3)}</p>`,
          ).join("");
        const nextFrame = () =>
          new Promise<void>((settle) =>
            requestAnimationFrame(() => requestAnimationFrame(() => settle())),
          );
        const withTimeout = <T>(promise: Promise<T>) =>
          Promise.race([
            promise,
            new Promise<never>((_settle, reject) =>
              setTimeout(() => reject(new Error(`timed out after ${timeout / 1000} s`)), timeout),
            ),
          ]);
        const host = document.createElement("div");
        host.style.cssText = "width:1000px;height:700px;overflow:auto;position:relative";
        document.body.replaceChildren(host);

        // Each adapter returns a render function: it starts the library's
        // documented render call and resolves at its documented completion
        // signal with the page count.
        let render: (word: string) => Promise<number>;
        if (library === "imposia") {
          const core = (await import(coreUrl)) as {
            mountPageDocument(
              host: HTMLElement,
              source: { html: string },
            ): {
              ready: Promise<{ pageCount: number }>;
              update(source: { html: string }): Promise<{ pageCount: number }>;
            };
          };
          const html = (word: string) => `<style>${css}</style>${body(word)}`;
          let controller: ReturnType<typeof core.mountPageDocument> | undefined;
          render = async (word) => {
            if (controller === undefined) {
              controller = core.mountPageDocument(host, { html: html(word) });
              return (await controller.ready).pageCount;
            }
            return (await controller.update({ html: html(word) })).pageCount;
          };
        } else if (library === "pagedjs") {
          await new Promise((settle, reject) => {
            const script = document.createElement("script");
            script.src = pagedjsUrl;
            script.onload = settle;
            script.onerror = () => reject(new Error("Paged.js failed to load."));
            document.head.append(script);
          });
          type Previewer = {
            preview(
              content: DocumentFragment,
              stylesheets: readonly string[],
              renderTo: HTMLElement,
            ): Promise<{ total: number }>;
          };
          const paged = (
            globalThis as unknown as { PagedModule: { Previewer: new () => Previewer } }
          ).PagedModule;
          const stylesheet = new URL("fixture.css", location.href).href;
          render = async (word) => {
            // No incremental API is documented: every render starts from scratch.
            host.replaceChildren();
            const template = document.createElement("template");
            template.innerHTML = body(word);
            const flow = await new paged.Previewer().preview(template.content, [stylesheet], host);
            return flow.total;
          };
        } else {
          type Viewer = {
            readyState: string;
            addListener(type: string, listener: (payload: unknown) => void): void;
            removeListener(type: string, listener: (payload: unknown) => void): void;
            loadDocument(
              document: { url: string },
              documentOptions: object,
              viewerOptions: { renderAllPages: boolean },
            ): void;
          };
          const { CoreViewer, ReadyState } = (await import(vivliostyleUrl)) as {
            CoreViewer: new (settings: { viewportElement: HTMLElement }) => Viewer;
            ReadyState: { COMPLETE: string };
          };
          const viewer = new CoreViewer({ viewportElement: host });
          render = (word) =>
            new Promise<number>((settle, reject) => {
              let started = false;
              const onError = (payload: unknown) => {
                viewer.removeListener("readystatechange", onState);
                viewer.removeListener("error", onError);
                reject(new Error(`Vivliostyle error: ${JSON.stringify(payload).slice(0, 200)}`));
              };
              const onState = () => {
                if (viewer.readyState !== ReadyState.COMPLETE) {
                  started = true;
                  return;
                }
                if (!started) return;
                viewer.removeListener("readystatechange", onState);
                viewer.removeListener("error", onError);
                settle(document.querySelectorAll("[data-vivliostyle-page-container]").length);
              };
              viewer.addListener("readystatechange", onState);
              viewer.addListener("error", onError);
              // No incremental API is documented: loadDocument lays the
              // document out again from scratch.
              const url = new URL("document.html", location.href);
              url.searchParams.set("word", word);
              url.searchParams.set("sections", String(sections));
              viewer.loadDocument({ url: url.href }, {}, { renderAllPages: true });
            });
        }

        const startedAt = performance.now();
        let pageCount = await withTimeout(render("alpha"));
        let value = performance.now() - startedAt;
        if (scenario === "edit-50") {
          await nextFrame();
          const updateStartedAt = performance.now();
          pageCount = await withTimeout(render("beta"));
          value = performance.now() - updateStartedAt;
        }
        return { value, pageCount };
      },
      {
        library,
        scenario,
        sections,
        css: CSS,
        coreUrl: CORE_URL,
        pagedjsUrl: PAGEDJS_URL,
        vivliostyleUrl: VIVLIOSTYLE_URL,
        timeout: TIMEOUT_MS,
      },
    );
    // Guard against a library that blocks the main thread past the timeout.
    let guard: NodeJS.Timeout | undefined;
    const hang = new Promise<never>((_settle, reject) => {
      guard = setTimeout(
        () => reject(new Error(`timed out after ${TIMEOUT_MS / 1000} s`)),
        TIMEOUT_MS * 2 + 10_000,
      );
    });
    try {
      return await Promise.race([evaluation, hang]);
    } finally {
      clearTimeout(guard);
    }
  } finally {
    await context.close();
  }
}

function imposiaRouteGzipKiB(): number {
  const report = spawnSync(process.execPath, ["--import", "tsx", "scripts/bundle-size.ts"], {
    encoding: "utf8",
  });
  const match = /\| Core · PageDocument \| [\d.]+ KiB \| ([\d.]+) KiB \|/u.exec(report.stdout);
  if (match?.[1] === undefined)
    throw new Error("bundle-size report has no Core · PageDocument row.");
  return Number(match[1]);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const scenarios = [];
    for (const scenario of SCENARIOS) {
      const samples = new Map<LibraryId, Sample[]>(LIBRARIES.map((library) => [library, []]));
      const errors = new Map<LibraryId, string>();
      const measure = async (library: LibraryId, record: boolean) => {
        if (errors.has(library)) return;
        try {
          const sample = await runSample(browser, library, scenario.id, scenario.sections);
          if (record) samples.get(library)?.push(sample);
        } catch (error) {
          errors.set(
            library,
            error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error),
          );
        }
      };
      for (let run = 0; run < WARMUP_RUNS; run += 1) {
        for (const library of LIBRARIES) await measure(library, false);
      }
      for (let run = 0; run < MEASURED_RUNS; run += 1) {
        // Rotate the order each run so machine drift is spread over all three.
        const order = LIBRARIES.map(
          (_library, index) => LIBRARIES[(index + run) % LIBRARIES.length],
        );
        for (const library of order) if (library !== undefined) await measure(library, true);
        process.stderr.write(`${scenario.id}: run ${run + 1}/${MEASURED_RUNS}\n`);
      }
      const imposiaPages = samples.get("imposia")?.[0]?.pageCount;
      const results = Object.fromEntries(
        LIBRARIES.map((library): [LibraryId, LibraryResult] => {
          const error = errors.get(library);
          if (error !== undefined) return [library, { error }];
          const values = samples.get(library) ?? [];
          const pageCount = values[0]?.pageCount ?? 0;
          if (values.some((sample) => sample.pageCount !== pageCount)) {
            return [library, { error: "page count changed between runs" }];
          }
          if (
            imposiaPages !== undefined &&
            (pageCount < imposiaPages / 2 || pageCount > imposiaPages * 2)
          ) {
            return [
              library,
              { error: `produced ${pageCount} pages, more than 2x off Imposia's ${imposiaPages}` },
            ];
          }
          return [
            library,
            {
              median: median(values.map((sample) => sample.value)),
              samples: values.map((sample) => round(sample.value)),
              pageCount,
            },
          ];
        }),
      );
      scenarios.push({
        id: scenario.id,
        description: scenario.description,
        unit: scenario.unit,
        results,
      });
    }

    const pagedjsBytes = await cdn(PAGEDJS_URL);
    const vivliostyleBytes = await cdn(VIVLIOSTYLE_URL);
    const coreBytes = readFileSync(resolve(ROOT, "packages/core/dist/index.js"));
    const routeKiB = imposiaRouteGzipKiB();
    const gzipKiB = (bytes: Buffer) => kib(gzipSync(bytes, { level: 9 }).length);
    scenarios.push({
      id: "bundle",
      description: "Gzip (level 9) size of the browser JavaScript each library needs",
      unit: "KiB",
      results: {
        imposia: {
          median: routeKiB,
          samples: [routeKiB],
          file: "`Core · PageDocument` route of `pnpm bundle:size` (minified ESM exporting mountPageDocument)",
        },
        pagedjs: {
          median: gzipKiB(pagedjsBytes),
          samples: [gzipKiB(pagedjsBytes)],
          file: PAGEDJS_URL,
        },
        vivliostyle: {
          median: gzipKiB(vivliostyleBytes),
          samples: [gzipKiB(vivliostyleBytes)],
          file: VIVLIOSTYLE_URL,
        },
      },
    });

    const pageCounts = scenarios.slice(0, SCENARIOS.length).map((scenario) =>
      LIBRARIES.map((library) => {
        const result = (scenario.results as Record<string, LibraryResult>)[library];
        return result !== undefined && "pageCount" in result ? result.pageCount : "failed";
      }),
    );
    const pageCountNote = [
      "Page counts: Imposia from PageDocument.pageCount, Paged.js from the resolved flow.total, Vivliostyle from the number of [data-vivliostyle-page-container] elements after ReadyState.COMPLETE.",
      pageCounts.every((counts) => new Set(counts).size === 1)
        ? "In this capture all three produced the same page count in each scenario."
        : `Page counts (Imposia/Paged.js/Vivliostyle) differ in this capture: ${pageCounts.map((counts) => counts.join("/")).join(", ")}. Default user-agent styles and line breaking differ, so compare times together with the page counts.`,
      "A library whose count is more than 2x off Imposia's is recorded as a failure.",
    ].join(" ");
    const cpu = cpus()[0];
    const report = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      runs: { warmup: WARMUP_RUNS, measured: MEASURED_RUNS, timeoutSeconds: TIMEOUT_MS / 1000 },
      environment: {
        platform: platform(),
        release: release(),
        architecture: arch(),
        cpuModel: cpu?.model ?? "unknown",
        logicalCpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        nodeVersion: process.version,
        chromiumVersion: browser.version(),
        viewport: "1200x800",
      },
      input: {
        css: CSS,
        generator:
          "scripts/benchmark-compare.ts article(): per section an <h2>, a paragraph, a two-item list, and a paragraph",
      },
      libraries: [
        {
          id: "imposia",
          name: "Imposia",
          version: JSON.parse(readFileSync("packages/core/package.json", "utf8")).version as string,
          commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          sources: [
            {
              url: "packages/core/dist/index.js (built from this checkout)",
              sha256: sha256(coreBytes),
              gzipKiB: gzipKiB(coreBytes),
            },
          ],
          api: "mountPageDocument(host, { html }) then controller.ready; controller.update({ html })",
        },
        {
          id: "pagedjs",
          name: "Paged.js",
          version: PAGEDJS_VERSION,
          sources: [
            { url: PAGEDJS_URL, sha256: sha256(pagedjsBytes), gzipKiB: gzipKiB(pagedjsBytes) },
          ],
          api: "new PagedModule.Previewer().preview(content, [stylesheetUrl], renderTo) resolving to a flow with total",
        },
        {
          id: "vivliostyle",
          name: "Vivliostyle (@vivliostyle/core)",
          version: VIVLIOSTYLE_VERSION,
          sources: [
            {
              url: VIVLIOSTYLE_URL,
              sha256: sha256(vivliostyleBytes),
              gzipKiB: gzipKiB(vivliostyleBytes),
            },
          ],
          api: "new CoreViewer({ viewportElement }).loadDocument({ url }, {}, { renderAllPages: true }) until readystatechange reports ReadyState.COMPLETE",
        },
      ],
      scenarios,
      notes: [
        "Observed results on one machine, not product contracts. Paged.js and Vivliostyle were treated as black boxes: only documented entry points were called and only public outcomes (promise resolution, events, page elements, time) were observed.",
        "Every sample runs in a new browser context. Library code is loaded before the timer starts; CDN bytes are served from memory, so network time is excluded.",
        "Imposia receives the CSS as a <style> element in its html source and paginates inside its own iframe. Paged.js receives the same CSS as a stylesheet URL and renders into a <div> in the host document. Vivliostyle loads a same-origin HTML document (the same body with the same CSS in a <style>) into a viewport <div> in the host document; its time includes fetching that document from the local server.",
        pageCountNote,
        "edit-50: Imposia uses its incremental controller.update(). Paged.js and Vivliostyle document no incremental update API, so the documented way to show changed content is to render again from scratch (a new Previewer.preview() into the cleared container; a second loadDocument() on the same CoreViewer). Only the re-render is timed.",
        "bundle: Imposia is the tree-shaken Core · PageDocument route from pnpm bundle:size (the full packages/core/dist/index.js loaded by this benchmark is listed under libraries). Paged.js is jsDelivr's minified copy of the published dist/paged.js browser build. Vivliostyle is jsDelivr's ES module wrapper of the published, already minified lib/vivliostyle.js. Each file is compressed alone with gzip level 9.",
      ],
    };

    writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    // Let the repository formatter settle array layout so `biome check` passes.
    spawnSync("node_modules/.bin/biome", ["format", "--write", OUTPUT_PATH], { stdio: "ignore" });

    const cell = (result: LibraryResult | undefined, unit: string) => {
      if (result === undefined) return "";
      if ("error" in result) return `failed: ${result.error}`;
      return `${result.median} ${unit}${result.pageCount === undefined ? "" : ` (${result.pageCount} pages)`}`;
    };
    const markdown = [
      `Chromium ${browser.version()} · ${report.environment.cpuModel} · median of ${MEASURED_RUNS} runs`,
      "",
      `| Scenario | Imposia ${report.libraries[0]?.version} | Paged.js ${PAGEDJS_VERSION} | Vivliostyle ${VIVLIOSTYLE_VERSION} |`,
      "| --- | ---: | ---: | ---: |",
      ...scenarios.map((scenario) => {
        const results = scenario.results as Record<LibraryId, LibraryResult>;
        return `| ${scenario.id} | ${LIBRARIES.map((library) => cell(results[library], scenario.unit)).join(" | ")} |`;
      }),
      "",
    ].join("\n");
    process.stdout.write(markdown);
  } finally {
    await browser.close();
    server.kill();
  }
}

await main();
