import { build } from "esbuild";
import { findForbiddenBundleDependencies } from "./core-package-boundary.js";

const outfile = "packages/core/dist/index.js";

const result = await build({
  bundle: true,
  entryPoints: ["packages/core/src/index.ts"],
  format: "esm",
  metafile: true,
  minify: true,
  outfile,
  platform: "browser",
  sourcemap: true,
  sourcesContent: false,
  target: "es2022",
});

if (result.metafile === undefined) {
  throw new Error("Core browser build did not produce a dependency metafile.");
}

const forbiddenDependencies = findForbiddenBundleDependencies(result.metafile);
if (forbiddenDependencies.length > 0) {
  throw new Error(
    `Core browser bundle contains forbidden dependencies:\n${forbiddenDependencies
      .map((dependency) => `- ${dependency}`)
      .join("\n")}`,
  );
}
