import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { findForbiddenBundleDependencies } from "./core-package-boundary.js";
import { minifyBrowserBundle } from "./minify-browser-bundle.js";

const outfile = "packages/core/dist/index.js";
const mapfile = `${outfile}.map`;

const result = await build({
  bundle: true,
  entryPoints: ["packages/core/src/index.ts"],
  format: "esm",
  metafile: true,
  minify: false,
  outfile,
  platform: "browser",
  sourcemap: true,
  sourcesContent: false,
  target: "es2022",
  write: false,
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

const decoder = new TextDecoder();
const outputs = new Map(
  result.outputFiles.map((output) => [
    path.relative(process.cwd(), output.path),
    decoder.decode(output.contents),
  ]),
);
const bundledCode = outputs.get(outfile);
const bundledMap = outputs.get(mapfile);
if (bundledCode === undefined || bundledMap === undefined) {
  throw new Error("Core browser build did not produce the bundle and its source map.");
}

const minified = await minifyBrowserBundle(path.basename(outfile), bundledCode, bundledMap);
if (minified.map === undefined) {
  throw new Error("Core browser minification did not produce a composed source map.");
}

await mkdir(path.dirname(outfile), { recursive: true });
await writeFile(
  outfile,
  `${minified.code}\n//# sourceMappingURL=${path.basename(mapfile)}\n`,
  "utf8",
);
await writeFile(mapfile, minified.map, "utf8");
