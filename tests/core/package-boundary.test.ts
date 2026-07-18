import type { Metafile } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  findForbiddenBundleDependencies,
  isNodeBuiltinSpecifier,
  normalizeModuleSpecifier,
} from "../../scripts/core-package-boundary.js";

function metafileWithImports(imports: Metafile["inputs"][string]["imports"]): Metafile {
  return {
    inputs: {
      "packages/core/src/index.ts": { bytes: 1, imports },
    },
    outputs: {
      "packages/core/dist/index.js": {
        bytes: 1,
        entryPoint: "packages/core/src/index.ts",
        exports: [],
        imports: [],
        inputs: {
          "packages/core/src/index.ts": { bytesInOutput: 1 },
        },
      },
    },
  };
}

describe("Core package boundary helpers", () => {
  it("normalizes both Node builtin specifier forms", () => {
    expect(normalizeModuleSpecifier("node:fs")).toBe("fs");
    expect(isNodeBuiltinSpecifier("fs")).toBe(true);
    expect(isNodeBuiltinSpecifier("node:fs")).toBe(true);
  });

  it("reports bundled forbidden dependency edges but ignores browser-disabled aliases", () => {
    const violations = findForbiddenBundleDependencies(
      metafileWithImports([
        { kind: "import-statement", path: "node:fs", original: "node:fs" },
        { kind: "import-statement", path: "playwright", original: "playwright" },
        {
          kind: "import-statement",
          path: "pdfjs-dist/legacy/build/pdf.mjs",
          original: "pdfjs-dist/legacy/build/pdf.mjs",
        },
        { kind: "require-call", path: "(disabled):fs", original: "fs" },
      ]),
    );

    expect(violations).toHaveLength(3);
    expect(violations).toContainEqual(expect.stringContaining("Node builtin dependency"));
    expect(violations).toContainEqual(expect.stringContaining("Playwright dependency"));
    expect(violations).toContainEqual(expect.stringContaining("PDF.js dependency"));
  });
});
