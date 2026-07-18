import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { type BundledPackage, discoverBundledPackages } from "./core-bundle-license-audit.ts";

const execFileAsync = promisify(execFile);

export interface PublishableManifest {
  name: string;
  directory: string;
  dependencies: string[];
  files: string[];
  exports: Record<string, unknown>;
}

interface PackRecord {
  files: unknown[];
}

export interface ArtifactAuditResult {
  bundledPackages: BundledPackage[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.replaceAll("\r\n", "\n").trim();
}

function exportTargets(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!record(value)) return [];
  return Object.values(value).flatMap((entry) => exportTargets(entry));
}

function packagePathForExport(target: string, packageName: string): string {
  if (!target.startsWith("./") || target.includes("\\\\") || target.split("/").includes("..")) {
    throw new Error(`${packageName} has an unsafe export target: ${target}.`);
  }
  return target.slice(2);
}

function requireExportTargets(manifest: PublishableManifest, packContents: Set<string>): void {
  const targets = [...new Set(exportTargets(manifest.exports))];
  if (targets.length === 0) {
    throw new Error(
      `${manifest.name} package.json must expose at least one package-relative target.`,
    );
  }
  for (const target of targets) {
    if (target.includes("*")) {
      throw new Error(
        `${manifest.name} wildcard exports are not supported by this release audit: ${target}.`,
      );
    }
    const packagePath = packagePathForExport(target, manifest.name);
    if (!packContents.has(packagePath)) {
      throw new Error(
        `${manifest.name} export target is missing from pnpm pack --dry-run: ${target}.`,
      );
    }
  }
}

function parsePackFiles(output: string, packageName: string): Set<string> {
  const objectStart = output.indexOf("{");
  const arrayStart = output.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  const start = starts.length === 0 ? -1 : Math.min(...starts);
  const end = Math.max(output.lastIndexOf("}"), output.lastIndexOf("]"));
  if (start < 0 || end <= start) {
    throw new Error(`pnpm pack --dry-run returned no JSON for ${packageName}.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(output.slice(start, end + 1));
  } catch (error) {
    throw new Error(
      `Unable to parse pnpm pack --dry-run output for ${packageName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const records = Array.isArray(value) ? value : [value];
  const pack = records.find(
    (entry): entry is PackRecord => record(entry) && Array.isArray(entry.files),
  );
  if (pack === undefined) {
    throw new Error(`pnpm pack --dry-run returned no file list for ${packageName}.`);
  }
  const paths = new Set<string>();
  for (const entry of pack.files) {
    if (record(entry) && typeof entry.path === "string") paths.add(entry.path);
  }
  return paths;
}

async function packFiles(manifest: PublishableManifest): Promise<Set<string>> {
  try {
    const result = await execFileAsync("pnpm", ["pack", "--dry-run", "--json"], {
      cwd: manifest.directory,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    return parsePackFiles(String(result.stdout), manifest.name);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to inspect ${manifest.name} package contents: ${detail}`);
  }
}

async function requireUpstreamText(
  noticeText: string,
  packageName: string,
  dependency: string,
  sourcePath: string,
): Promise<void> {
  const upstreamText = normalizeText(await readFile(path.resolve(sourcePath), "utf8"));
  if (!upstreamText || !normalizeText(noticeText).includes(upstreamText)) {
    throw new Error(
      `${packageName} THIRD_PARTY_NOTICES.md is missing the complete upstream ${dependency} notice from ${sourcePath}.`,
    );
  }
}

function requireBundledHeading(
  noticeText: string,
  bundled: BundledPackage,
  packageName: string,
): void {
  const heading = normalizeText(noticeText)
    .split("\n")
    .find(
      (line) =>
        line.trimStart().startsWith("## ") &&
        line.toLowerCase().includes(bundled.name.toLowerCase()) &&
        line.includes(bundled.version) &&
        line.toLowerCase().includes(bundled.license.toLowerCase()) &&
        line.toLowerCase().includes("bundled"),
    );
  if (heading === undefined) {
    throw new Error(
      `${packageName} THIRD_PARTY_NOTICES.md is missing a bundled heading for ${bundled.name}@${bundled.version} (${bundled.license}).`,
    );
  }
}

function requireRootBundledEntry(rootNoticeText: string, bundled: BundledPackage): void {
  const entry = normalizeText(rootNoticeText)
    .split("\n")
    .find((line) => {
      const lower = line.toLowerCase();
      return (
        lower.includes(bundled.name.toLowerCase()) &&
        line.includes(bundled.version) &&
        lower.includes(bundled.license.toLowerCase())
      );
    });
  if (entry === undefined) {
    throw new Error(
      `Root THIRD_PARTY_NOTICES.md is missing one entry naming bundled Core package ${bundled.name}@${bundled.version} (${bundled.license}).`,
    );
  }
}

const upstreamNotices: Record<string, readonly [string, string][]> = {
  "@imposia/core": [],
  "@imposia/client": [],
  "@imposia/react": [],
  "@imposia/viewer": [
    ["pdfjs-dist", "node_modules/.pnpm/pdfjs-dist@5.4.530/node_modules/pdfjs-dist/LICENSE"],
  ],
};

export async function auditPackageArtifact(
  manifest: PublishableManifest,
  rootLicenseText: string,
  rootNoticeText: string,
): Promise<ArtifactAuditResult> {
  const packageRoot = path.resolve(manifest.directory);
  const readmePath = path.join(packageRoot, "README.md");
  const noticePath = path.join(packageRoot, "THIRD_PARTY_NOTICES.md");
  const licensePath = path.join(packageRoot, "LICENSE");
  const [readmeText, noticeText, packageLicenseText, readmeStat, licenseStat, noticeStat] =
    await Promise.all([
      readFile(readmePath, "utf8"),
      readFile(noticePath, "utf8"),
      readFile(licensePath, "utf8"),
      stat(readmePath),
      stat(licensePath),
      stat(noticePath),
    ]);
  if (!readmeStat.isFile() || readmeStat.size === 0 || !normalizeText(readmeText)) {
    throw new Error(`${manifest.name} README.md is missing or empty.`);
  }
  if (!licenseStat.isFile() || licenseStat.size === 0) {
    throw new Error(`${manifest.name} LICENSE is missing or empty.`);
  }
  if (normalizeText(packageLicenseText) !== normalizeText(rootLicenseText)) {
    throw new Error(`${manifest.name} LICENSE must match the root Apache-2.0 LICENSE text.`);
  }
  if (!noticeStat.isFile() || noticeStat.size === 0) {
    throw new Error(`${manifest.name} THIRD_PARTY_NOTICES.md is missing or empty.`);
  }
  const packContents = await packFiles(manifest);
  for (const required of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"] as const) {
    if (!manifest.files.includes(required)) {
      throw new Error(`${manifest.name} package.json files must explicitly include ${required}.`);
    }
    if (!packContents.has(required)) {
      throw new Error(`${manifest.name} pnpm pack --dry-run output is missing ${required}.`);
    }
  }
  requireExportTargets(manifest, packContents);
  for (const dependency of manifest.dependencies) {
    if (!noticeText.toLowerCase().includes(dependency.toLowerCase())) {
      throw new Error(
        `${manifest.name} THIRD_PARTY_NOTICES.md is missing direct dependency ${dependency}.`,
      );
    }
  }
  for (const [dependency, sourcePath] of upstreamNotices[manifest.name] ?? []) {
    await requireUpstreamText(noticeText, manifest.name, dependency, sourcePath);
  }
  if (manifest.name !== "@imposia/core") return { bundledPackages: [] };

  for (const required of ["dist/index.js", "dist/index.js.map"] as const) {
    if (!packContents.has(required)) {
      throw new Error(`${manifest.name} pnpm pack --dry-run output is missing ${required}.`);
    }
  }
  const bundledPackages = await discoverBundledPackages(packageRoot);
  for (const bundled of bundledPackages) {
    requireBundledHeading(noticeText, bundled, manifest.name);
    await requireUpstreamText(
      noticeText,
      manifest.name,
      `${bundled.name}@${bundled.version}`,
      bundled.licensePath,
    );
    requireRootBundledEntry(rootNoticeText, bundled);
  }
  return {
    bundledPackages: bundledPackages.map(({ name, version, license }) => ({
      name,
      version,
      license,
    })),
  };
}
