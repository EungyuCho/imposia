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

// Test seams follow the `internal*TestApi` naming convention (see
// docs/architecture/overview.md §13.5). They may exist inside dist modules for
// the e2e oracle specs, but must never be part of the package entry surface.
const testSeamExportName = /^internal[\w$]*TestApi$/i;
// The entry surface is asserted on both artifacts of dist/index: the bundled
// runtime (index.js, a single esbuild ESM bundle whose exports end up in
// `export { ... }` statements) and the type surface (index.d.ts, tsc's
// declaration of src/index.ts's re-exports). Checking the emitted artifacts —
// rather than src/index.ts — verifies what actually ships after every build
// step, including the esbuild overwrite of index.js.
const entrySurfaceFiles = ["index.js", "index.d.ts"];

function extractExportedNames(content: string): { names: string[]; hasWildcardExport: boolean } {
  const names: string[] = [];
  // `export { a, b as c }` / `export type { d }` — with or without a `from`
  // clause, minified (`export{a as b}`) or not.
  for (const match of content.matchAll(/\bexport\s*(?:type\s*)?\{([^}]*)\}/g)) {
    for (const rawEntry of (match[1] ?? "").split(",")) {
      const entry = rawEntry.trim();
      if (entry === "") continue;
      const parts = entry.split(/\s+as\s+/);
      const exported = (parts[parts.length - 1] ?? "")
        .replace(/^type\s+/, "")
        .trim()
        .replace(/^["']|["']$/g, "");
      if (exported !== "") names.push(exported);
    }
  }
  // `export declare const x`, `export function y`, … declaration forms.
  const declarationExport =
    /\bexport\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+enum|function|class|const|let|var|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of content.matchAll(declarationExport)) {
    if (match[1] !== undefined) names.push(match[1]);
  }
  // `export * from` / `export * as ns from` would hide names from the checks
  // above, so its mere presence on the entry is unverifiable and rejected.
  const hasWildcardExport = /\bexport\s*\*\s*(?:as\s+[\w$]+\s*)?from\b/.test(content);
  return { names, hasWildcardExport };
}

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

for (const entryFile of entrySurfaceFiles) {
  const content = (await readFile(join(distDirectory, entryFile))).toString("utf8");
  const { names, hasWildcardExport } = extractExportedNames(content);
  for (const name of new Set(names)) {
    if (testSeamExportName.test(name)) {
      violations.push(`${entryFile}: entry surface exports test seam "${name}"`);
    }
  }
  if (hasWildcardExport) {
    violations.push(
      `${entryFile}: wildcard re-export on the entry surface prevents verifying that no test seam is exported`,
    );
  }
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
