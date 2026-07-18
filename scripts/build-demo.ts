import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  absWorkingDir: root,
  entryPoints: ["examples/demo/app.tsx"],
  outfile: "examples/demo/app.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  sourcemap: false,
  alias: {
    "@imposia/client": path.join(root, "examples/react/client-entry.ts"),
    "@imposia/react": path.join(root, "packages/react/src/index.ts"),
  },
});

console.log("Built examples/demo/app.js.");
