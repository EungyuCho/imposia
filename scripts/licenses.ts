import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { auditPackageArtifact, type PublishableManifest } from "./license-package-audit.ts";

const pnpmRoot = path.resolve("node_modules/.pnpm");
const reportPath = path.resolve("artifacts/evidence/licenses.json");
const releaseArtifacts = ["LICENSE", "THIRD_PARTY_NOTICES.md", "docs/clean-room.md"] as const;
const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
  "MPL-2.0",
  "Unlicense",
]);
const reviewedPackageLicenses = [
  { namePrefix: "@img/sharp-libvips-", license: "LGPL-3.0-or-later" },
] as const;

interface PackageLicense {
  name: string;
  version: string;
  license: string;
}

interface MissingPackageLicense {
  directory: string;
  name: string;
  version: string;
  repositoryUrl: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string");
}

function repositoryUrl(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value) || typeof value.url !== "string") return undefined;
  return value.url;
}

function hasReviewedPackageLicense(item: PackageLicense): boolean {
  return reviewedPackageLicenses.some(
    (review) => item.name.startsWith(review.namePrefix) && item.license === review.license,
  );
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
  const missingLicenses: MissingPackageLicense[] = [];
  for (const directory of await packageDirectories()) {
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      if (
        !isRecord(manifest) ||
        typeof manifest.name !== "string" ||
        typeof manifest.version !== "string"
      ) {
        throw new Error(`Missing name, version, or SPDX license in ${directory}.`);
      }
      if (typeof manifest.license !== "string") {
        missingLicenses.push({
          directory,
          name: manifest.name,
          version: manifest.version,
          repositoryUrl: repositoryUrl(manifest.repository),
        });
        continue;
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
  for (const manifest of missingLicenses) {
    const parent = packages.get(`yuku-analyzer@${manifest.version}`);
    if (
      !manifest.name.startsWith("@yuku-analyzer/binding-") ||
      manifest.repositoryUrl !== "https://github.com/yuku-toolchain/yuku" ||
      parent?.license !== "MIT"
    ) {
      throw new Error(`Missing name, version, or SPDX license in ${manifest.directory}.`);
    }
    packages.set(`${manifest.name}@${manifest.version}`, {
      name: manifest.name,
      version: manifest.version,
      license: parent.license,
    });
  }

  const sorted = [...packages.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
  if (sorted.length === 0) throw new Error("No installed dependency licenses were found.");
  const rejected = sorted.filter(
    (item) => !allowedLicenses.has(item.license) && !hasReviewedPackageLicense(item),
  );
  if (rejected.length > 0) {
    throw new Error(
      `Disallowed or unreviewed dependency licenses: ${rejected.map((item) => `${item.name}@${item.version} (${item.license})`).join(", ")}`,
    );
  }
  const copyleft = sorted.filter(
    (item) => /\b(?:A?GPL|LGPL)\b/i.test(item.license) && !hasReviewedPackageLicense(item),
  );
  if (copyleft.length > 0) {
    throw new Error(
      `Copyleft dependency licenses require review and are not allowed: ${copyleft.map((item) => `${item.name}@${item.version} (${item.license})`).join(", ")}`,
    );
  }

  const packageManifests: PublishableManifest[] = await Promise.all(
    ["packages/client", "packages/core", "packages/react", "packages/viewer"].map(async (file) => {
      const directory = path.resolve(file);
      const manifestPath = path.join(directory, "package.json");
      const value = JSON.parse(await readFile(manifestPath, "utf8"));
      if (!isRecord(value) || !("dependencies" in value)) {
        throw new Error(`Invalid package manifest: ${manifestPath}.`);
      }
      if (!("name" in value) || typeof value.name !== "string") {
        throw new Error(`Invalid package name: ${manifestPath}.`);
      }
      if (
        !("description" in value) ||
        typeof value.description !== "string" ||
        !value.description.trim()
      ) {
        throw new Error(`Package description is missing: ${manifestPath}.`);
      }
      if (!("keywords" in value) || !stringArray(value.keywords) || value.keywords.length === 0) {
        throw new Error(`Package keywords are missing: ${manifestPath}.`);
      }
      const dependencies = Reflect.get(value, "dependencies");
      if (typeof dependencies !== "object" || dependencies === null) {
        throw new Error(`Invalid package dependencies: ${manifestPath}.`);
      }
      const files = Reflect.get(value, "files");
      if (!stringArray(files)) {
        throw new Error(`Invalid package files: ${manifestPath}.`);
      }
      const exports = Reflect.get(value, "exports");
      if (!isRecord(exports)) {
        throw new Error(`Invalid package exports: ${manifestPath}.`);
      }
      const publishConfig = Reflect.get(value, "publishConfig");
      if (!isRecord(publishConfig) || publishConfig.access !== "public") {
        throw new Error(`Package must publish publicly: ${manifestPath}.`);
      }
      return {
        name: value.name,
        directory,
        dependencies: Object.keys(dependencies),
        files,
        exports,
      };
    }),
  );
  const workspacePackages = new Set(packageManifests.map((manifest) => manifest.name));
  const shippedDependencies = [
    ...new Set(packageManifests.flatMap((manifest) => manifest.dependencies)),
  ].sort();
  for (const dependency of shippedDependencies) {
    if (!noticeText.toLowerCase().includes(dependency.toLowerCase())) {
      throw new Error(`THIRD_PARTY_NOTICES.md is missing shipped dependency ${dependency}.`);
    }
    if (!sorted.some((item) => item.name === dependency) && !workspacePackages.has(dependency)) {
      throw new Error(`Installed license inventory is missing shipped dependency ${dependency}.`);
    }
  }
  const auditResults = await Promise.all(
    packageManifests.map((manifest) => auditPackageArtifact(manifest, licenseText, noticeText)),
  );
  const bundledPackages = auditResults.flatMap((result) => result.bundledPackages);

  const counts = Object.fromEntries(
    [...allowedLicenses]
      .map(
        (license) => [license, sorted.filter((item) => item.license === license).length] as const,
      )
      .filter((entry) => entry[1] > 0),
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify({ packageCount: sorted.length, counts, shippedDependencies: shippedDependencies.join(", "), releaseArtifacts: releaseArtifacts.join(", "), packageArtifacts: packageManifests.map((manifest) => manifest.name), bundledPackages, packages: sorted }, null, 2)}\n`,
  );
  process.stdout.write(
    `License audit passed: ${sorted.length} installed packages, all on the reviewed allowlist or package-specific exceptions; package dry-runs include READMEs, legal files, and declared export targets.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
