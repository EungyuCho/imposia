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
    gzipBudgetBytes: 110 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Core · Publication",
    source: 'export { mountPublication } from "@imposia/core";',
    gzipBudgetBytes: 115 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Viewer · PageDocument",
    source: 'export { mountPageViewer } from "@imposia/viewer";',
    gzipBudgetBytes: 32 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Viewer · PDF",
    source: 'export { mountViewer } from "@imposia/viewer";',
    gzipBudgetBytes: 125 * KIBIBYTE,
  }),
  Object.freeze({
    name: "Client · PageDocument",
    source: 'export { mountPageDocument, mountPageViewer } from "@imposia/client";',
    gzipBudgetBytes: 120 * KIBIBYTE,
  }),
  Object.freeze({
    name: "React · PageViewer",
    source: 'export { ImposiaPageViewer } from "@imposia/react";',
    gzipBudgetBytes: 122 * KIBIBYTE,
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
    minify: true,
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

async function measureScenario(scenario: BundleScenario): Promise<BundleMeasurement> {
  const result = await build(bundleOptions(scenario.source, `${scenario.name}.ts`));
  const minifiedBytes = result.outputFiles.reduce(
    (total, output) => total + output.contents.byteLength,
    0,
  );
  const gzipBytes = result.outputFiles.reduce(
    (total, output) => total + gzipSync(output.contents, { level: 9 }).byteLength,
    0,
  );
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
  return Object.freeze({
    minifiedBytes: result.outputFiles.reduce(
      (total, output) => total + output.contents.byteLength,
      0,
    ),
    gzipBytes: result.outputFiles.reduce(
      (total, output) => total + gzipSync(output.contents, { level: 9 }).byteLength,
      0,
    ),
    brotliBytes: result.outputFiles.reduce(
      (total, output) => total + brotliCompressSync(output.contents).byteLength,
      0,
    ),
  });
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
assertBundleBudgets(measurements);
console.log(`\n${renderEpubImpactReport(await measureEpubImpact())}`);
