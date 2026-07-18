import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function benchmarkSourceHash(): Promise<string> {
  const sourceDirectories = ["packages/core/src", "packages/node/src"];
  const sources = (
    await Promise.all(
      sourceDirectories.map(async (directory) =>
        (
          await readdir(path.resolve(directory), { withFileTypes: true })
        )
          .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
          .map((entry) => `${directory}/${entry.name}`),
      ),
    )
  )
    .flat()
    .sort();
  const files = [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "tsconfig.base.json",
    "packages/core/package.json",
    "packages/core/tsconfig.json",
    "packages/node/package.json",
    "packages/node/tsconfig.json",
    ...sources,
    "scripts/build-core-browser.ts",
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
