import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const pnpmRoot = path.resolve("node_modules/.pnpm");
const reportPath = path.resolve("artifacts/evidence/licenses.json");
const releaseArtifacts = ["LICENSE", "THIRD_PARTY_NOTICES.md", "docs/clean-room.md"] as const;
const allowedLicenses = new Set([
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
]);

interface PackageLicense {
  name: string;
  version: string;
  license: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function directories(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const result: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry);
    if ((await stat(candidate)).isDirectory()) result.push(candidate);
  }
  return result;
}

async function packageDirectories(): Promise<string[]> {
  const result: string[] = [];
  for (const storeEntry of await directories(pnpmRoot)) {
    const nodeModules = path.join(storeEntry, "node_modules");
    let entries: string[];
    try {
      entries = await directories(nodeModules);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (path.basename(entry).startsWith("@")) result.push(...(await directories(entry)));
      else result.push(entry);
    }
  }
  return result;
}

async function main(): Promise<void> {
  const [licenseText, noticeText, cleanRoomText] = await Promise.all(
    releaseArtifacts.map((file) => readFile(path.resolve(file), "utf8")),
  );
  for (let section = 1; section <= 9; section += 1) {
    if (!licenseText.includes(`${section}. `)) {
      throw new Error(`LICENSE is missing Apache-2.0 section ${section}.`);
    }
  }
  if (!licenseText.includes("APPENDIX: How to apply the Apache License to your work.")) {
    throw new Error("LICENSE is missing the Apache-2.0 appendix.");
  }
  if (!cleanRoomText.includes("## Contributor clean-room checklist")) {
    throw new Error("Clean-room contributor checklist is missing.");
  }

  const packages = new Map<string, PackageLicense>();
  for (const directory of await packageDirectories()) {
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      if (
        !record(manifest) ||
        typeof manifest.name !== "string" ||
        typeof manifest.version !== "string" ||
        typeof manifest.license !== "string"
      ) {
        throw new Error(`Missing name, version, or SPDX license in ${directory}.`);
      }
      packages.set(`${manifest.name}@${manifest.version}`, {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license,
      });
    } catch (error) {
      if (error instanceof SyntaxError) throw error;
      if (error instanceof Error && error.message.startsWith("Missing name")) throw error;
    }
  }

  const sorted = [...packages.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
  if (sorted.length === 0) throw new Error("No installed dependency licenses were found.");
  const rejected = sorted.filter((item) => !allowedLicenses.has(item.license));
  if (rejected.length > 0) {
    throw new Error(
      `Disallowed or unreviewed dependency licenses: ${rejected.map((item) => `${item.name}@${item.version} (${item.license})`).join(", ")}`,
    );
  }

  const packageManifests = await Promise.all(
    ["packages/core/package.json", "packages/viewer/package.json"].map(async (file) => {
      const value = JSON.parse(await readFile(path.resolve(file), "utf8"));
      if (typeof value !== "object" || value === null || !("dependencies" in value)) {
        throw new Error(`Invalid package manifest: ${file}.`);
      }
      const dependencies = Reflect.get(value, "dependencies");
      if (typeof dependencies !== "object" || dependencies === null) {
        throw new Error(`Invalid package dependencies: ${file}.`);
      }
      return Object.keys(dependencies);
    }),
  );
  const shippedDependencies = [...new Set(packageManifests.flat())].sort();
  for (const dependency of shippedDependencies) {
    if (!noticeText.toLowerCase().includes(dependency.toLowerCase())) {
      throw new Error(`THIRD_PARTY_NOTICES.md is missing shipped dependency ${dependency}.`);
    }
    if (!sorted.some((item) => item.name === dependency)) {
      throw new Error(`Installed license inventory is missing shipped dependency ${dependency}.`);
    }
  }

  const counts = Object.fromEntries(
    [...allowedLicenses]
      .map(
        (license) => [license, sorted.filter((item) => item.license === license).length] as const,
      )
      .filter((entry) => entry[1] > 0),
  );
  await writeFile(
    reportPath,
    `${JSON.stringify({ packageCount: sorted.length, counts, shippedDependencies: shippedDependencies.join(", "), releaseArtifacts: releaseArtifacts.join(", "), packages: sorted }, null, 2)}\n`,
  );
  process.stdout.write(
    `License audit passed: ${sorted.length} installed packages, all on the reviewed permissive allowlist.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
