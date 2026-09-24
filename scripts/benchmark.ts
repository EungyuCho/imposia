import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";

// Browser pagination benchmark for the built `@imposia/core` browser bundle.
// Run `pnpm build` first. Writes benchmarks/latest.{json,md}; pass --baseline
// to also replace benchmarks/baseline.json. `--compare <core bundle>` measures
// another revision's built bundle in the same browser, alternating the two
// runs so that machine drift affects both equally. `--only <id,id>` runs a
// subset of the scenarios.

interface Scenario {
  readonly id: string;
  readonly description: string;
  readonly unit: "ms" | "frames" | "MB";
}

interface Sample {
  readonly value: number;
  readonly pageCount: number;
}

const SCENARIOS: readonly Scenario[] = Object.freeze([
  {
    id: "document-mount",
    description: "Mount a 99-page article (headings, paragraphs, lists)",
    unit: "ms",
  },
  {
    id: "document-update",
    description: "Update one word in that article and recommit",
    unit: "ms",
  },
  { id: "first-frame", description: "First rendered frame after the article commits", unit: "ms" },
  {
    id: "publication-mount",
    description: "Mount a Publication of 100 entries, each with a <style>",
    unit: "ms",
  },
  {
    id: "report-update",
    description: "Update one word in a 50-page report and recommit",
    unit: "ms",
  },
  { id: "large-mount", description: "Mount a 200-page document", unit: "ms" },
  {
    id: "print-call",
    description: "print() on the 50-page report until the browser print dialog is requested",
    unit: "ms",
  },
  {
    id: "partial-frames",
    description: "Frames showing an incomplete page set during 20 rapid report updates",
    unit: "frames",
  },
  { id: "mount-1000", description: "Mount a 1,000-page document", unit: "ms" },
  {
    id: "mount-1000-blocking",
    description: "Longest main-thread block while mounting the 1,000-page document",
    unit: "ms",
  },
  {
    id: "mount-1000-heap",
    description: "JS heap retained by the mounted 1,000-page document, after GC",
    unit: "MB",
  },
  // 1,800 pages is near the ceiling: this article is about 2.8 KB of HTML
  // per page, so the 5 MiB input limit is reached at about 1,850 pages.
  { id: "mount-1800", description: "Mount a 1,800-page document", unit: "ms" },
  {
    id: "statement-table",
    description: "Mount a statement whose table has 5,000 rows and a repeated header",
    unit: "ms",
  },
]);

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 7;
const PORT = Number(process.env.IMPOSIA_BENCH_PORT ?? 4179);
const ROOT = process.cwd();
const CORE_PATH = resolve(ROOT, "packages/core/dist/index.js");
const compareIndex = process.argv.indexOf("--compare");
const COMPARE_PATH =
  compareIndex === -1 ? undefined : resolve(ROOT, process.argv[compareIndex + 1] ?? "");
const onlyIndex = process.argv.indexOf("--only");
const ONLY = onlyIndex === -1 ? undefined : new Set((process.argv[onlyIndex + 1] ?? "").split(","));
const coreUrl = (label: string) => `http://127.0.0.1:${PORT}/__bench-${label}.js`;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) throw new Error("No samples.");
  return Math.round(middle * 10) / 10;
}

async function startServer(): Promise<ChildProcess> {
  const server = spawn(process.execPath, ["scripts/serve-viewer.mjs"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/examples/book.html`);
      return server;
    } catch {
      await new Promise((settle) => setTimeout(settle, 100));
    }
  }
  server.kill();
  throw new Error(`Static server did not start on port ${PORT}.`);
}

function runScenario(page: Page, id: string, coreUrl: string): Promise<Sample> {
  return page.evaluate(
    async ({ id, coreUrl }) => {
      type Document = { iframe: HTMLIFrameElement; generation: number; pageCount: number };
      type Controller = {
        ready: Promise<Document>;
        update(source: { html: string }): Promise<Document>;
        print(): Promise<void>;
        destroy(): Promise<void>;
      };
      const core = (await import(coreUrl)) as {
        committedFrameGeneration(frameDocument: globalThis.Document): number | undefined;
        mountPageDocument(host: HTMLElement, source: { html: string }): Controller;
        mountPublication(
          host: HTMLElement,
          snapshot: {
            metadata: { title: string; language: string };
            entries: readonly { id: string; title: string; html: string }[];
          },
        ): Controller;
      };
      const sentence = "The quick brown fox jumps over the lazy dog near the riverbank. ";
      // 360 sections make 99 pages, 182 make 50, and 731 make 200; the
      // 1,000- and 1,800-page scenarios scale that ratio.
      const article = (word: string, sections = 360) =>
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
      const host = document.createElement("div");
      host.style.cssText = "width:1000px;height:700px;overflow:auto";
      document.body.replaceChildren(host);

      let controller: Controller;
      let value: number;
      let pageCount: number;
      if (id === "publication-mount") {
        const entries = Array.from({ length: 100 }, (_value, index) => ({
          id: `entry-${index + 1}`,
          title: `Chapter ${index + 1}`,
          html:
            `<style>.chapter-${index} h1{letter-spacing:${index % 3}px}</style>` +
            `<article class="chapter-${index}"><h1>Chapter ${index + 1}</h1>` +
            Array.from(
              { length: 12 },
              (_item, line) => `<p>${sentence.repeat(1 + (line % 4))}</p>`,
            ).join("") +
            "</article>",
        }));
        const startedAt = performance.now();
        controller = core.mountPublication(host, {
          metadata: { title: "Benchmark", language: "en" },
          entries,
        });
        pageCount = (await controller.ready).pageCount;
        value = performance.now() - startedAt;
      } else if (id === "statement-table") {
        const rows = Array.from(
          { length: 5000 },
          (_value, index) =>
            `<tr><td>2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}</td>` +
            `<td>Transaction ${index + 1} ${sentence.slice(0, 20 + (index % 30))}</td>` +
            `<td>${(index * 37) % 10000}.00</td><td>${(index * 91) % 100000}.00</td></tr>`,
        ).join("");
        const startedAt = performance.now();
        controller = core.mountPageDocument(host, {
          html:
            "<style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:2px 4px}</style>" +
            "<h1>Account statement</h1><table><thead><tr><th>Date</th><th>Description</th>" +
            `<th>Amount</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table>`,
        });
        pageCount = (await controller.ready).pageCount;
        value = performance.now() - startedAt;
      } else {
        const sections =
          id === "mount-1800"
            ? 6579
            : id.startsWith("mount-1000")
              ? 3655
              : id === "large-mount"
                ? 731
                : id === "document-mount" || id === "document-update" || id === "first-frame"
                  ? 360
                  : 182;
        const html = article("alpha", sections);
        const gc = (globalThis as { gc?: () => void }).gc;
        gc?.();
        const heapBefore =
          (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
        // A MessageChannel ping loop observes how long the main thread stays
        // blocked: the gap between two pings is at least the longest task.
        let blocking = 0;
        let probing = id === "mount-1000-blocking";
        const channel = new MessageChannel();
        let lastPing = performance.now();
        channel.port1.onmessage = () => {
          const now = performance.now();
          blocking = Math.max(blocking, now - lastPing);
          lastPing = now;
          if (probing) channel.port2.postMessage(undefined);
        };
        if (probing) channel.port2.postMessage(undefined);
        const startedAt = performance.now();
        controller = core.mountPageDocument(host, { html });
        const ready = await controller.ready;
        value = performance.now() - startedAt;
        probing = false;
        channel.port1.close();
        pageCount = ready.pageCount;
        if (id === "mount-1000-blocking") {
          value = blocking;
        } else if (id === "mount-1000-heap") {
          gc?.();
          const heapAfter =
            (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
          value = (heapAfter - heapBefore) / (1024 * 1024);
        } else if (id === "first-frame") {
          const frameStartedAt = performance.now();
          await nextFrame();
          value = performance.now() - frameStartedAt;
        } else if (id === "document-update" || id === "report-update") {
          await nextFrame();
          const updateStartedAt = performance.now();
          pageCount = (await controller.update({ html: article("beta", sections) })).pageCount;
          value = performance.now() - updateStartedAt;
        } else if (id === "print-call") {
          await nextFrame();
          const nativePrint = window.print;
          let requestedAt = Number.NaN;
          window.print = () => {
            requestedAt = performance.now();
          };
          try {
            const printStartedAt = performance.now();
            await controller.print();
            value = requestedAt - printStartedAt;
          } finally {
            window.print = nativePrint;
          }
        } else if (id === "partial-frames") {
          // Sample every rendered frame while updates are queued back to back.
          // A frame is partial when the canonical frame does not hold exactly
          // the pages of a generation Core committed.
          const committed = new Map<number, number>([[ready.generation, ready.pageCount]]);
          const observed: { generation: number | undefined; pages: number }[] = [];
          let sampling = true;
          const sample = () => {
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument !== null) {
              observed.push({
                generation: core.committedFrameGeneration(frameDocument),
                pages: frameDocument.querySelectorAll("[data-imposia-page]").length,
              });
            }
            if (sampling) requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
          const updates = Array.from({ length: 20 }, (_value, index) =>
            controller.update({ html: article(`edit-${index}`, sections) }).then(
              (document) => committed.set(document.generation, document.pageCount),
              () => undefined,
            ),
          );
          await Promise.all(updates);
          await nextFrame();
          sampling = false;
          value = observed.filter(
            (frame) =>
              frame.generation === undefined || committed.get(frame.generation) !== frame.pages,
          ).length;
          if (observed.length === 0) throw new Error("No frames were sampled.");
        }
      }
      await controller.destroy();
      return { value, pageCount };
    },
    { id, coreUrl },
  );
}

async function main(): Promise<void> {
  const writeBaseline = process.argv.includes("--baseline");
  if (writeBaseline && COMPARE_PATH !== undefined) {
    throw new Error("--baseline records the current bundle alone; drop --compare.");
  }
  const server = await startServer();
  // Precise, collectable heap readings for the mount-1000-heap scenario.
  const browser = await chromium.launch({
    args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const cores = [
      { label: "current", path: CORE_PATH },
      ...(COMPARE_PATH === undefined ? [] : [{ label: "compare", path: COMPARE_PATH }]),
    ];
    for (const core of cores) {
      await page.route(coreUrl(core.label), (route) =>
        route.fulfill({ body: readFileSync(core.path), contentType: "text/javascript" }),
      );
    }
    // tsx keeps function names by wrapping them in a `__name` helper, which
    // the page-side scenario code needs too.
    await page.addInitScript("globalThis.__name = (fn) => fn;");
    await page.goto(`http://127.0.0.1:${PORT}/examples/book.html`);
    const results = [];
    for (const scenario of SCENARIOS.filter((item) => ONLY === undefined || ONLY.has(item.id))) {
      const samples = new Map<string, Sample[]>(cores.map((core) => [core.label, []]));
      for (let run = 0; run < WARMUP_RUNS; run += 1) {
        for (const core of cores) await runScenario(page, scenario.id, coreUrl(core.label));
      }
      for (let run = 0; run < MEASURED_RUNS; run += 1) {
        const order = run % 2 === 0 ? cores : [...cores].reverse();
        for (const core of order) {
          samples.get(core.label)?.push(await runScenario(page, scenario.id, coreUrl(core.label)));
        }
      }
      const summary = (label: string) => {
        const values = samples.get(label) ?? [];
        return {
          pageCount: values[0]?.pageCount ?? 0,
          median: median(values.map((sample) => sample.value)),
          samples: values.map((sample) => Math.round(sample.value * 10) / 10),
        };
      };
      results.push({
        ...scenario,
        ...summary("current"),
        ...(COMPARE_PATH === undefined ? {} : { compare: summary("compare") }),
      });
    }
    const cpu = cpus()[0];
    const report = {
      schemaVersion: 4,
      capturedAt: new Date().toISOString(),
      runs: { warmup: WARMUP_RUNS, measured: MEASURED_RUNS },
      environment: {
        platform: platform(),
        release: release(),
        architecture: arch(),
        cpuModel: cpu?.model ?? "unknown",
        logicalCpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        nodeVersion: process.version,
        chromiumVersion: browser.version(),
      },
      scenarios: results,
    };
    const markdown = [
      `Chromium ${browser.version()} · ${report.environment.cpuModel} · median of ${MEASURED_RUNS} runs`,
      "",
      COMPARE_PATH === undefined
        ? "| Scenario | Pages | Median |"
        : "| Scenario | Pages | Compared | Current |",
      COMPARE_PATH === undefined ? "| --- | ---: | ---: |" : "| --- | ---: | ---: | ---: |",
      ...results.map((result) =>
        result.compare === undefined
          ? `| ${result.description} | ${result.pageCount} | ${result.median} ${result.unit} |`
          : `| ${result.description} | ${result.pageCount} | ${result.compare.median} ${result.unit} | ${result.median} ${result.unit} |`,
      ),
      "",
    ].join("\n");
    // Keep sample arrays on one line, as the repository's JSON formatter does.
    const json = `${JSON.stringify(report, null, 2).replace(
      /\[\n\s+([\d.,\s]+?)\n\s+\]/gu,
      (_match, values: string) => `[${values.split(/,\s*/u).join(", ")}]`,
    )}\n`;
    writeFileSync("benchmarks/latest.json", json);
    writeFileSync("benchmarks/latest.md", markdown);
    if (writeBaseline) writeFileSync("benchmarks/baseline.json", json);
    process.stdout.write(markdown);
  } finally {
    await browser.close();
    server.kill();
  }
}

await main();
