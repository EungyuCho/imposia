import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { benchmarkSourceHash } from "./benchmark-integrity.js";
import { BENCHMARK_THRESHOLD_POLICY } from "./benchmark-thresholds.js";

const requiredArtifacts = [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "docs/clean-room.md",
  "docs/compatibility.md",
  "docs/benchmarks.md",
  "benchmarks/baseline.json",
  "benchmarks/latest.json",
  "artifacts/evidence/benchmark-comparison.json",
  "artifacts/evidence/viewer/manual-desktop.png",
  "artifacts/evidence/viewer/manual-single-page-fixed.png",
  "artifacts/evidence/viewer/manual-mobile-fixed.png",
  "artifacts/evidence/viewer/manual-error.png",
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  await Promise.all(requiredArtifacts.map((file) => access(path.resolve(file))));
  const [baselineText, latestText, receiptText, sourceSha256] = await Promise.all([
    readFile(path.resolve("benchmarks/baseline.json"), "utf8"),
    readFile(path.resolve("benchmarks/latest.json"), "utf8"),
    readFile(path.resolve("artifacts/evidence/benchmark-comparison.json"), "utf8"),
    benchmarkSourceHash(),
  ]);
  const baseline = JSON.parse(baselineText);
  const receipt = JSON.parse(receiptText);
  if (!record(baseline) || baseline.schemaVersion !== 2) {
    throw new Error("Final benchmark baseline does not use schema version 2.");
  }
  if (
    !record(receipt) ||
    receipt.passed !== true ||
    receipt.command !== "pnpm benchmark" ||
    receipt.thresholdPolicy !== BENCHMARK_THRESHOLD_POLICY ||
    receipt.sourceSha256 !== sourceSha256 ||
    receipt.baselineSha256 !== sha256(baselineText) ||
    receipt.currentSha256 !== sha256(latestText)
  ) {
    throw new Error("Benchmark comparison receipt does not match the final baseline and report.");
  }
  process.stdout.write(
    `Requirement audit passed: ${requiredArtifacts.length} artifacts and final benchmark receipt verified.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
