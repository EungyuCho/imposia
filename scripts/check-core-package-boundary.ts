import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isNodeBuiltinSpecifier } from "./core-package-boundary.js";

const distDirectory = fileURLToPath(new URL("../packages/core/dist/", import.meta.url));
const legacyArtifacts = [
  "browser-session",
  "input-boundary",
  "page-side-spacers",
  "page-sides",
  "pdf-marker-locator",
  "pdf-output",
  "render-source",
  "renderer",
  "resource-readiness",
];
const legacyArtifactNames = legacyArtifacts.join("|");
const moduleSpecifier = /\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)\\?["']([^"']*?)\\?["']/g;
const legacyArtifactFile = new RegExp(
  String.raw`(?:^|/)(${legacyArtifactNames})\.(?:d\.ts(?:\.map)?|[cm]?js(?:\.map)?|ts(?:\.map)?|map)$`,
  "i",
);
const legacyArtifactReference = new RegExp(
  String.raw`(?:\.\.?/src/|["']\./)(?:${legacyArtifactNames})\.(?:d\.ts|[cm]?js|ts)`,
  "i",
);

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) return listFiles(entryPath);
      return entry.isFile() ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

function hasNodeBuiltinModuleReference(content: string): boolean {
  for (const match of content.matchAll(moduleSpecifier)) {
    const specifier = match[1];
    if (specifier !== undefined && isNodeBuiltinSpecifier(specifier)) return true;
  }
  return false;
}

const files = await listFiles(distDirectory);
if (files.length === 0) {
  throw new Error("@imposia/core has no publishable dist files to scan.");
}

const violations: string[] = [];
for (const file of files) {
  const packagePath = relative(distDirectory, file);
  const content = (await readFile(file)).toString("utf8");
  const reasons = [
    ...(legacyArtifactFile.test(packagePath) ? ["legacy renderer artifact filename"] : []),
    ...(legacyArtifactReference.test(content) ? ["legacy renderer artifact reference"] : []),
    ...(hasNodeBuiltinModuleReference(content) ? ["Node builtin module"] : []),
    ...(/\bplaywright(?:-core)?\b/i.test(content) ? ["Playwright reference"] : []),
    ...(/\bpdfjs(?:-dist)?\b/i.test(content) ? ["PDF.js reference"] : []),
  ];
  if (reasons.length > 0) violations.push(`${packagePath}: ${reasons.join(", ")}`);
}

if (violations.length > 0) {
  console.error("@imposia/core package boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `Scanned ${files.length} publishable @imposia/core dist files with no boundary violations.`,
  );
}
