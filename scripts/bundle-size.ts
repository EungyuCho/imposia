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
    // 59.4 KiB measured 2026-09-24, after the document-layout additions
    // (margin boxes, per-entry numbering, grid column spans, table row
    // splitting, raisable limits); 56.7 KiB on 2026-09-23. Raised from 60 KiB
    // to restore about 5% headroom; see docs/bundle-size.md. The
    // ASA-424/425/426 escape hatches share their code with the runtime
    // fallbacks, so removing them reclaims almost nothing.
    gzipBudgetBytes: 62 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Core · Publication",
    source: 'export { mountPublication } from "@imposia/core";',
    // 63.7 KiB measured 2026-09-24 (60.9 KiB on 2026-09-23); publication adds
    // outline/search over PageDocument. Raised from 64 KiB with the route above.
    gzipBudgetBytes: 67 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Viewer · PageDocument",
    source: 'export { mountPageViewer } from "@imposia/viewer";',
    // 11.6 KiB measured 2026-09-23. Core helpers the viewer imports used to
    // pull in the whole postcss package entry (28.9 KiB before).
    gzipBudgetBytes: 13 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Client · PageDocument",
    source: 'export { mountPageDocument, mountPageViewer } from "@imposia/client";',
    // 68.0 KiB measured 2026-09-24 (65.3 KiB on 2026-09-23; Core pagination +
    // page viewer). Raised from 69 KiB with the Core routes.
    gzipBudgetBytes: 71 * KIBIBYTE,
  }),
  Object.freeze({
    name: "React · PageViewer",
    source: 'export { ImposiaPageViewer } from "@imposia/react";',
    // 69.8 KiB measured 2026-09-24 (67.2 KiB on 2026-09-23); React/React DOM
    // stay external. Raised from 71 KiB with the Core routes.
    gzipBudgetBytes: 73 * KIBIBYTE,
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
