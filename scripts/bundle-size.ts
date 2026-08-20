import { resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { type BuildOptions, build, type Plugin } from "esbuild";
import {
  assertBundleBudgets,
  type BundleMeasurement,
  type EpubImpactMeasurement,
  renderBundleSizeReport,
  renderEpubImpactReport,
} from "./bundle-size-report.js";
import { minifyBrowserBundle } from "./minify-browser-bundle.js";

interface BundleScenario {
  readonly name: string;
  readonly source: string;
  readonly gzipBudgetBytes: number;
}

const KIBIBYTE = 1024;
const ROOT = process.cwd();
const PACKAGE_ALIASES = Object.freeze({
  "@imposia/client": resolve(ROOT, "packages/client/src/index.ts"),
  "@imposia/core": resolve(ROOT, "packages/core/src/index.ts"),
  "@imposia/react": resolve(ROOT, "packages/react/src/index.ts"),
  "@imposia/viewer": resolve(ROOT, "packages/viewer/src/index.ts"),
});
const SCENARIOS = Object.freeze([
  Object.freeze({
    name: "Core · PageDocument",
    source: 'export { mountPageDocument } from "@imposia/core";',
    // 56.8 KiB measured 2026-08-20 after the parse5 removal and oxc post-pass.
    gzipBudgetBytes: 60 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Core · Publication",
    source: 'export { mountPublication } from "@imposia/core";',
    // 60.8 KiB measured 2026-08-20; publication adds outline/search over PageDocument.
    gzipBudgetBytes: 64 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Viewer · PageDocument",
    source: 'export { mountPageViewer } from "@imposia/viewer";',
    // 28.2 KiB measured 2026-08-20; the route never included parse5, so only the
    // minifier pipeline moved it.
    gzipBudgetBytes: 30 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Viewer · PDF",
    source: 'export { mountViewer } from "@imposia/viewer";',
    // 120.1 KiB measured 2026-08-20. Dominated by PDF.js; the oxc pipeline
    // measures this route 2.8 KiB gzip larger than esbuild did, so the budget
    // stays at its previous value (4.1% headroom).
    gzipBudgetBytes: 125 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Client · PageDocument",
    source: 'export { mountPageDocument, mountPageViewer } from "@imposia/client";',
    // 65.3 KiB measured 2026-08-20 (Core pagination + page viewer).
    gzipBudgetBytes: 69 * KIBIBYTE,
  }),
  Object.freeze({
    name: "React · PageViewer",
    source: 'export { ImposiaPageViewer } from "@imposia/react";',
    // 67.0 KiB measured 2026-08-20; React/React DOM stay external.
    gzipBudgetBytes: 71 * KIBIBYTE,
  }),
]) satisfies readonly BundleScenario[];

const EPUB_STUB_PLUGIN: Plugin = {
  name: "epub-stub-diagnostic",
  setup(build) {
    build.onLoad({ filter: /epub-export\.ts$/ }, () => ({
      contents: `
        export async function exportPageDocumentEpub() {
          throw new Error("EPUB implementation excluded from diagnostic bundle.");
        }
        export async function exportPublicationEpub() {
          throw new Error("EPUB implementation excluded from diagnostic bundle.");
        }
      `,
      loader: "ts",
    }));
  },
};

function bundleOptions(source: string, sourcefile: string): BuildOptions {
  return {
    alias: PACKAGE_ALIASES,
    bundle: true,
    external: ["react", "react-dom"],
    format: "esm",
    minify: false,
    platform: "browser",
    sourcemap: false,
    stdin: {
      contents: source,
      resolveDir: ROOT,
      sourcefile,
    },
    target: "es2022",
    treeShaking: true,
    write: false,
  };
}

interface MinifiedOutputs {
  readonly minifiedBytes: number;
  readonly gzipBytes: number;
  readonly brotliBytes: number;
}

async function minifyOutputs(
  outputFiles: readonly { readonly path: string; readonly text: string }[],
): Promise<MinifiedOutputs> {
  const minified = await Promise.all(
    outputFiles.map(async (output) => {
      const result = await minifyBrowserBundle(output.path, output.text);
      return Buffer.from(result.code, "utf8");
    }),
  );
  return Object.freeze({
    minifiedBytes: minified.reduce((total, contents) => total + contents.byteLength, 0),
    gzipBytes: minified.reduce(
      (total, contents) => total + gzipSync(contents, { level: 9 }).byteLength,
      0,
    ),
    brotliBytes: minified.reduce(
      (total, contents) => total + brotliCompressSync(contents).byteLength,
      0,
    ),
  });
}

async function measureScenario(scenario: BundleScenario): Promise<BundleMeasurement> {
  const result = await build(bundleOptions(scenario.source, `${scenario.name}.ts`));
  const { minifiedBytes, gzipBytes } = await minifyOutputs(result.outputFiles);
  return Object.freeze({
    name: scenario.name,
    minifiedBytes,
    gzipBytes,
    gzipBudgetBytes: scenario.gzipBudgetBytes,
  });
}

async function measureCoreBundle(epubStubbed: boolean) {
  const result = await build({
    ...bundleOptions('export * from "@imposia/core";', "Core.ts"),
    plugins: epubStubbed ? [EPUB_STUB_PLUGIN] : [],
  });
  return minifyOutputs(result.outputFiles);
}

async function measureEpubImpact(): Promise<EpubImpactMeasurement> {
  const [full, stub] = await Promise.all([measureCoreBundle(false), measureCoreBundle(true)]);
  return Object.freeze({
    fullMinifiedBytes: full.minifiedBytes,
    stubMinifiedBytes: stub.minifiedBytes,
    fullGzipBytes: full.gzipBytes,
    stubGzipBytes: stub.gzipBytes,
    fullBrotliBytes: full.brotliBytes,
    stubBrotliBytes: stub.brotliBytes,
  });
}

const measurements = await Promise.all(SCENARIOS.map(measureScenario));
console.log(renderBundleSizeReport(measurements));
console.log(`\n${renderEpubImpactReport(await measureEpubImpact())}`);
assertBundleBudgets(measurements);
