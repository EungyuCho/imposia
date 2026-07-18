import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface BundledPackage {
  name: string;
  version: string;
  license: string;
}

export interface LocatedBundledPackage extends BundledPackage {
  directory: string;
  licensePath: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function normalizeText(value: string): string {
  return value.replaceAll("\r\n", "\n").trim();
}

function hasCode(value: unknown, code: string): boolean {
  return record(value) && value.code === code;
}

async function locatePackage(
  sourcePath: string,
  nodeModulesRoot: string,
): Promise<LocatedBundledPackage> {
  let candidate = sourcePath;
  try {
    if (!(await stat(candidate)).isDirectory()) candidate = path.dirname(candidate);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
    candidate = path.dirname(candidate);
  }
  while (isWithin(candidate, nodeModulesRoot)) {
    const manifestPath = path.join(candidate, "package.json");
    let manifestText: string;
    try {
      manifestText = await readFile(manifestPath, "utf8");
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) break;
      candidate = parent;
      continue;
    }
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestText);
    } catch (error) {
      throw new Error(
        `Unable to parse bundled package manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (
      !record(manifest) ||
      typeof manifest.name !== "string" ||
      typeof manifest.version !== "string" ||
      typeof manifest.license !== "string"
    ) {
      const parent = path.dirname(candidate);
      if (parent === candidate) break;
      candidate = parent;
      continue;
    }
    const licenseNames = (await readdir(candidate)).filter((entry) =>
      /^licen[cs]e(?:$|[._-])/i.test(entry),
    );
    const preferredLicenseNames = [
      "LICENSE",
      "LICENSE.md",
      "LICENSE.txt",
      "license",
      "license.md",
      "license.txt",
    ];
    const orderedLicenseNames = [
      ...preferredLicenseNames.filter((entry) => licenseNames.includes(entry)),
      ...licenseNames.filter((entry) => !preferredLicenseNames.includes(entry)).sort(),
    ];
    for (const licenseName of orderedLicenseNames) {
      const licensePath = path.join(candidate, licenseName);
      if ((await stat(licensePath)).isFile()) {
        if (!normalizeText(await readFile(licensePath, "utf8"))) {
          throw new Error(`Bundled package license is empty: ${licensePath}.`);
        }
        return {
          name: manifest.name,
          version: manifest.version,
          license: manifest.license,
          directory: candidate,
          licensePath,
        };
      }
    }
    throw new Error(`Bundled package license file is missing: ${manifestPath}.`);
  }
  throw new Error(`Unable to locate the node_modules package for bundled source ${sourcePath}.`);
}

export async function discoverBundledPackages(
  packageRoot: string,
): Promise<LocatedBundledPackage[]> {
  const mapPath = path.join(packageRoot, "dist/index.js.map");
  let sourceMap: unknown;
  try {
    sourceMap = JSON.parse(await readFile(mapPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to parse Core browser source map ${mapPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    !record(sourceMap) ||
    !Array.isArray(sourceMap.sources) ||
    !sourceMap.sources.every((source) => typeof source === "string")
  ) {
    throw new Error(`Core browser source map ${mapPath} does not contain a valid sources list.`);
  }
  const nodeModulesRoot = path.resolve("node_modules");
  const locations = new Map<string, LocatedBundledPackage>();
  for (const source of sourceMap.sources) {
    const absoluteSource = path.isAbsolute(source);
    const sourceHasNodeModules = source.split(/[\\/]/).includes("node_modules");
    if (!sourceHasNodeModules) continue;
    const sourcePath = absoluteSource
      ? path.normalize(source)
      : path.resolve(path.dirname(mapPath), source);
    if (!isWithin(sourcePath, nodeModulesRoot)) {
      throw new Error(
        `Core browser source map references a source outside node_modules: ${source}.`,
      );
    }
    const location = await locatePackage(sourcePath, nodeModulesRoot);
    locations.set(location.directory, location);
  }
  if (locations.size === 0)
    throw new Error(
      `Core browser source map ${mapPath} contains no bundled node_modules packages.`,
    );
  return [...locations.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}
