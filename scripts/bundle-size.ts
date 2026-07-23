import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import {
  assertBundleBudgets,
  type BundleMeasurement,
  renderBundleSizeReport,
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

async function measureScenario(scenario: BundleScenario): Promise<BundleMeasurement> {
  const result = await build({
    alias: PACKAGE_ALIASES,
    bundle: true,
    external: ["react", "react-dom"],
    format: "esm",
    minify: true,
    platform: "browser",
    sourcemap: false,
    stdin: {
      contents: scenario.source,
      resolveDir: ROOT,
      sourcefile: `${scenario.name}.ts`,
    },
    target: "es2022",
    treeShaking: true,
    write: false,
  });
  const rawBytes = result.outputFiles.reduce(
    (total, output) => total + output.contents.byteLength,
    0,
  );
  const gzipBytes = result.outputFiles.reduce(
    (total, output) => total + gzipSync(output.contents, { level: 9 }).byteLength,
    0,
  );
  return Object.freeze({
    name: scenario.name,
    rawBytes,
    gzipBytes,
    gzipBudgetBytes: scenario.gzipBudgetBytes,
  });
}

const measurements = await Promise.all(SCENARIOS.map(measureScenario));
console.log(renderBundleSizeReport(measurements));
assertBundleBudgets(measurements);
