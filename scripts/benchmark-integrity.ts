import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function benchmarkSourceHash(): Promise<string> {
  const coreDirectory = "packages/core/src";
  const coreSources = (await readdir(path.resolve(coreDirectory), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => `${coreDirectory}/${entry.name}`)
    .sort();
  const files = [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.base.json",
    "packages/core/package.json",
    ...coreSources,
    "scripts/benchmark-integrity.ts",
    "scripts/benchmark-thresholds.ts",
    "scripts/benchmark.ts",
  ];
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(path.resolve(file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
