import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createRenderer } from "../packages/node/src/renderer.js";
import type { RenderTimings } from "../packages/node/src/types.js";
import { benchmarkSourceHash } from "./benchmark-integrity.js";
import { BENCHMARK_THRESHOLD_POLICY, isBenchmarkRegression } from "./benchmark-thresholds.js";

const baselinePath = path.resolve("benchmarks/baseline.json");
const latestJsonPath = path.resolve("benchmarks/latest.json");
const latestMarkdownPath = path.resolve("benchmarks/latest.md");
const comparisonPath = path.resolve("artifacts/evidence/benchmark-comparison.json");
const fontPath = path.resolve("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");
const update = process.argv.includes("--update");
const pageCounts = [10, 50, 200] as const;

interface BenchmarkEnvironment {
  capturedAt: string;
  platform: string;
  release: string;
  architecture: string;
  cpuModel: string;
  logicalCpuCount: number;
  totalMemoryBytes: number;
  nodeVersion: string;
  playwrightVersion: string;
  chromiumVersion: string;
}

interface BenchmarkCase {
  pageCount: number;
  coldSamplesMs: number[];
  warmSamplesMs: number[];
  coldMedianMs: number;
  warmMedianMs: number;
  phases: {
    resourceWaitMs: number;
    printPreparationMs: number;
    pdfGenerationMs: number;
  };
}

interface BenchmarkReport {
  schemaVersion: 2;
  coldRuns: 3;
  warmRuns: 7;
  workload: "representative-local-v1";
  environment: BenchmarkEnvironment;
  cases: Record<string, BenchmarkCase>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid benchmark number: ${label}.`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid benchmark string: ${label}.`);
  }
  return value;
}

function numberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) throw new Error(`Invalid benchmark samples: ${label}.`);
  return value.map((item, index) => finite(item, `${label}[${index}]`));
}

function parseEnvironment(value: unknown): BenchmarkEnvironment {
  if (!record(value)) throw new Error("Invalid benchmark environment.");
  return {
    capturedAt: stringValue(value.capturedAt, "environment.capturedAt"),
    platform: stringValue(value.platform, "environment.platform"),
    release: stringValue(value.release, "environment.release"),
    architecture: stringValue(value.architecture, "environment.architecture"),
    cpuModel: stringValue(value.cpuModel, "environment.cpuModel"),
    logicalCpuCount: finite(value.logicalCpuCount, "environment.logicalCpuCount"),
    totalMemoryBytes: finite(value.totalMemoryBytes, "environment.totalMemoryBytes"),
    nodeVersion: stringValue(value.nodeVersion, "environment.nodeVersion"),
    playwrightVersion: stringValue(value.playwrightVersion, "environment.playwrightVersion"),
    chromiumVersion: stringValue(value.chromiumVersion, "environment.chromiumVersion"),
  };
}

function parseCase(value: unknown, key: string): BenchmarkCase {
  if (!record(value) || !record(value.phases)) throw new Error(`Invalid benchmark case ${key}.`);
  return {
    pageCount: finite(value.pageCount, `${key}.pageCount`),
    coldSamplesMs: numberArray(value.coldSamplesMs, `${key}.coldSamplesMs`),
    warmSamplesMs: numberArray(value.warmSamplesMs, `${key}.warmSamplesMs`),
    coldMedianMs: finite(value.coldMedianMs, `${key}.coldMedianMs`),
    warmMedianMs: finite(value.warmMedianMs, `${key}.warmMedianMs`),
    phases: {
      resourceWaitMs: finite(value.phases.resourceWaitMs, `${key}.resourceWaitMs`),
      printPreparationMs: finite(value.phases.printPreparationMs, `${key}.printPreparationMs`),
      pdfGenerationMs: finite(value.phases.pdfGenerationMs, `${key}.pdfGenerationMs`),
    },
  };
}

function parseReport(value: unknown): BenchmarkReport {
  if (!record(value) || value.schemaVersion !== 2 || value.coldRuns !== 3 || value.warmRuns !== 7) {
    throw new Error("Benchmark baseline schema must be version 2 with 3 cold and 7 warm runs.");
  }
  if (value.workload !== "representative-local-v1" || !record(value.cases)) {
    throw new Error("Benchmark baseline workload is invalid.");
  }
  const cases: Record<string, BenchmarkCase> = {};
  for (const pageCount of pageCounts)
    cases[String(pageCount)] = parseCase(value.cases[String(pageCount)], String(pageCount));
  return {
    schemaVersion: 2,
    coldRuns: 3,
    warmRuns: 7,
    workload: "representative-local-v1",
    environment: parseEnvironment(value.environment),
    cases,
  };
}

async function environment(): Promise<BenchmarkEnvironment> {
  const manifest = JSON.parse(
    await readFile(path.resolve("node_modules/playwright/package.json"), "utf8"),
  );
  if (!record(manifest)) throw new Error("Playwright manifest is invalid.");
  const browser = await chromium.launch({ headless: true });
  try {
    const cpus = os.cpus();
    return {
      capturedAt: new Date().toISOString(),
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      cpuModel: cpus[0]?.model ?? "unknown",
      logicalCpuCount: cpus.length,
      totalMemoryBytes: os.totalmem(),
      nodeVersion: process.version,
      playwrightVersion: stringValue(manifest.version, "playwright.version"),
      chromiumVersion: browser.version(),
    };
  } finally {
    await browser.close();
  }
}

async function fixture(pageCount: number): Promise<string> {
  const font = (await readFile(fontPath)).toString("base64");
  const image = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" rx="8" fill="#0d6255"/><circle cx="24" cy="32" r="12" fill="#d9f66f"/><path d="M48 22h34v7H48zm0 14h25v7H48z" fill="#fff"/></svg>',
  ).toString("base64");
  const pages = Array.from({ length: pageCount }, (_value, index) => {
    const page = index + 1;
    return `<section><header><img src="data:image/svg+xml;base64,${image}" alt=""><div><h1>Workload ${page}</h1><p>Deterministic local fixture ${pageCount}/${page}</p></div></header><table><thead><tr><th>Metric</th><th>Value</th><th>Status</th></tr></thead><tbody><tr><td>Chapter</td><td>${page}</td><td>Ready</td></tr><tr><td>Rows</td><td>4</td><td>Stable</td></tr><tr><td>Media</td><td>Embedded</td><td>Loaded</td></tr></tbody></table><p class="copy">Imposia measures representative text shaping, table layout, embedded image decoding, local font readiness, print preparation, and Chromium PDF generation without network variance.</p></section>`;
  }).join("");
  return `<!doctype html><html><head><title>Imposia ${pageCount}-page benchmark</title><style>
    @font-face { font-family: BenchmarkSans; src: url(data:font/ttf;base64,${font}) format("truetype"); font-weight: 400; }
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17201e; font: 11pt/1.45 BenchmarkSans, sans-serif; }
    section + section { break-before: page; }
    header { display: flex; align-items: center; gap: 8mm; margin-bottom: 12mm; }
    header img { width: 36mm; height: 24mm; }
    h1 { margin: 0; font-size: 25pt; }
    header p, .copy { color: #52605c; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 4mm; border: 0.3mm solid #9eaaa6; text-align: left; }
    th { background: #e9efec; }
  </style></head><body>${pages}</body></html>`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.floor(sorted.length / 2)];
  if (value === undefined) throw new Error("Cannot calculate a median without samples.");
  return Math.round(value * 100) / 100;
}

function phaseMedians(samples: RenderTimings[]): BenchmarkCase["phases"] {
  return {
    resourceWaitMs: median(samples.map((sample) => sample.resourceWaitMs)),
    printPreparationMs: median(samples.map((sample) => sample.printPreparationMs)),
    pdfGenerationMs: median(samples.map((sample) => sample.pdfGenerationMs)),
  };
}

async function renderOnce(pageCount: number, html: string): Promise<RenderTimings> {
  const renderer = createRenderer();
  try {
    const result = await renderer.render({ html });
    if (result.pageCount !== pageCount)
      throw new Error(`Expected ${pageCount} pages, received ${result.pageCount}.`);
    return result.timings;
  } finally {
    await renderer.close();
  }
}

async function measure(machine: BenchmarkEnvironment): Promise<BenchmarkReport> {
  const cases: Record<string, BenchmarkCase> = {};
  const warmRenderer = createRenderer();
  try {
    for (const pageCount of pageCounts) {
      process.stdout.write(`Benchmarking ${pageCount} representative pages: 3 cold / 7 warm...\n`);
      const html = await fixture(pageCount);
      const cold: RenderTimings[] = [];
      for (let run = 0; run < 3; run += 1) cold.push(await renderOnce(pageCount, html));
      await warmRenderer.render({ html });
      const warm: RenderTimings[] = [];
      for (let run = 0; run < 7; run += 1) warm.push((await warmRenderer.render({ html })).timings);
      cases[String(pageCount)] = {
        pageCount,
        coldSamplesMs: cold.map((sample) => Math.round(sample.totalMs * 100) / 100),
        warmSamplesMs: warm.map((sample) => Math.round(sample.totalMs * 100) / 100),
        coldMedianMs: median(cold.map((sample) => sample.totalMs)),
        warmMedianMs: median(warm.map((sample) => sample.totalMs)),
        phases: phaseMedians(warm),
      };
    }
  } finally {
    await warmRenderer.close();
  }
  return {
    schemaVersion: 2,
    coldRuns: 3,
    warmRuns: 7,
    workload: "representative-local-v1",
    environment: machine,
    cases,
  };
}

function environmentIdentity(value: BenchmarkEnvironment): string {
  return [
    value.platform,
    value.release,
    value.architecture,
    value.cpuModel,
    value.logicalCpuCount,
    value.nodeVersion,
    value.playwrightVersion,
    value.chromiumVersion,
  ].join("|");
}

function compare(baseline: BenchmarkReport, current: BenchmarkReport): void {
  if (environmentIdentity(baseline.environment) !== environmentIdentity(current.environment)) {
    throw new Error(
      "Benchmark environment differs from the baseline; update on the intended stable host.",
    );
  }
  for (const pageCount of pageCounts) {
    const key = String(pageCount);
    const expected = baseline.cases[key];
    const actual = current.cases[key];
    if (expected === undefined || actual === undefined)
      throw new Error(`Missing benchmark case ${key}.`);
    for (const [label, kind, before, after] of [
      ["cold total", "cold-total", expected.coldMedianMs, actual.coldMedianMs],
      ["warm total", "warm-total", expected.warmMedianMs, actual.warmMedianMs],
      ["resource wait", "phase", expected.phases.resourceWaitMs, actual.phases.resourceWaitMs],
      [
        "print preparation",
        "phase",
        expected.phases.printPreparationMs,
        actual.phases.printPreparationMs,
      ],
      ["PDF generation", "phase", expected.phases.pdfGenerationMs, actual.phases.pdfGenerationMs],
    ] as const) {
      if (isBenchmarkRegression(kind, before, after))
        throw new Error(
          `${key}-page ${label} exceeded its percentage and absolute regression limits: ${before.toFixed(2)}ms -> ${after.toFixed(2)}ms.`,
        );
    }
  }
}

function markdown(report: BenchmarkReport): string {
  const rows = pageCounts.map((pageCount) => {
    const value = report.cases[String(pageCount)];
    if (value === undefined) throw new Error(`Missing benchmark case ${pageCount}.`);
    return `| ${pageCount} | ${value.coldMedianMs.toFixed(2)} | ${value.warmMedianMs.toFixed(2)} | ${value.phases.resourceWaitMs.toFixed(2)} | ${value.phases.printPreparationMs.toFixed(2)} | ${value.phases.pdfGenerationMs.toFixed(2)} |`;
  });
  return [
    "# Imposia benchmark",
    "",
    `Environment: ${environmentIdentity(report.environment)}`,
    "",
    "PDF generation includes Chromium print pagination and PDF serialization; the browser exposes no reliable boundary between them.",
    "",
    "| Pages | Cold total | Warm total | Resources | Print preparation | PDF generation |",
    "| ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
  ].join("\n");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  await rm(comparisonPath, { force: true });
  if (process.env.IMPOSIA_CHROMIUM_EXECUTABLE !== undefined) {
    throw new Error(
      "Benchmark comparison requires the pinned Playwright Chromium; unset IMPOSIA_CHROMIUM_EXECUTABLE.",
    );
  }
  const sourceSha256 = await benchmarkSourceHash();
  const machine = await environment();
  const report = await measure(machine);
  if ((await benchmarkSourceHash()) !== sourceSha256) {
    throw new Error(
      "Performance sources changed while the benchmark was running; retry once stable.",
    );
  }
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(latestJsonPath, reportJson);
  await writeFile(latestMarkdownPath, markdown(report));
  if (update) {
    await writeFile(baselinePath, reportJson);
    process.stdout.write(`Updated benchmark baseline: ${baselinePath}\n`);
    return;
  }
  const baselineJson = await readFile(baselinePath, "utf8");
  const baseline = parseReport(JSON.parse(baselineJson));
  compare(baseline, report);
  await writeFile(
    comparisonPath,
    `${JSON.stringify({ completedAt: new Date().toISOString(), command: "pnpm benchmark", passed: true, thresholdPolicy: BENCHMARK_THRESHOLD_POLICY, sourceSha256, baselineSha256: hash(baselineJson), currentSha256: hash(reportJson), environment: machine }, null, 2)}\n`,
  );
  process.stdout.write("Benchmark regression thresholds passed against the final baseline.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
