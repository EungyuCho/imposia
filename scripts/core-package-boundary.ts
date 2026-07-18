import { builtinModules } from "node:module";
import type { Metafile } from "esbuild";

const nodeBuiltinSpecifiers = new Set(
  builtinModules.flatMap((specifier) => {
    const normalized = normalizeModuleSpecifier(specifier);
    return [normalized, `node:${normalized}`];
  }),
);

export function normalizeModuleSpecifier(specifier: string): string {
  return specifier.replace(/^node:/, "");
}

export function isNodeBuiltinSpecifier(specifier: string): boolean {
  return nodeBuiltinSpecifiers.has(specifier);
}

function forbiddenDependency(specifier: string): string | undefined {
  if (isNodeBuiltinSpecifier(specifier)) return "Node builtin dependency";

  const normalizedPath = specifier.replaceAll("\\", "/");
  if (/(?:^|\/)playwright(?:-core)?(?:\/|$)/i.test(normalizedPath)) {
    return "Playwright dependency";
  }
  if (/(?:^|\/)pdfjs-dist(?:\/|$)/i.test(normalizedPath)) {
    return "PDF.js dependency";
  }
  return undefined;
}

function dependencyFromEdge(path: string, original: string | undefined): string | undefined {
  return (
    forbiddenDependency(path) ??
    (original === undefined ? undefined : forbiddenDependency(original))
  );
}

export function findForbiddenBundleDependencies(metafile: Metafile): string[] {
  const bundledInputs = new Set(
    Object.values(metafile.outputs).flatMap((output) => Object.keys(output.inputs)),
  );
  const violations = new Set<string>();

  for (const inputPath of bundledInputs) {
    const input = metafile.inputs[inputPath];
    if (input === undefined) continue;

    const inputReason = forbiddenDependency(inputPath);
    if (inputReason !== undefined) violations.add(`${inputPath}: ${inputReason}`);

    for (const imported of input.imports) {
      if (imported.path.startsWith("(disabled):")) continue;
      const reason = dependencyFromEdge(imported.path, imported.original);
      if (reason !== undefined) {
        violations.add(`${inputPath} -> ${imported.original ?? imported.path}: ${reason}`);
      }
    }
  }

  for (const [outputPath, output] of Object.entries(metafile.outputs)) {
    for (const imported of output.imports) {
      const reason = forbiddenDependency(imported.path);
      if (reason !== undefined) violations.add(`${outputPath} -> ${imported.path}: ${reason}`);
    }
  }

  return [...violations].sort();
}
