import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const shared = {
  absWorkingDir: root,
  bundle: true,
  format: "esm" as const,
  platform: "browser" as const,
  target: ["es2022"],
  minify: true,
  sourcemap: false,
  alias: {
    "@imposia/client": path.join(root, "examples/react/client-entry.ts"),
    "@imposia/core": path.join(root, "packages/core/src/index.ts"),
    "@imposia/react": path.join(root, "packages/react/src/index.ts"),
  },
};

await Promise.all([
  build({ ...shared, entryPoints: ["examples/demo/app.tsx"], outfile: "examples/demo/app.js" }),
  build({ ...shared, entryPoints: ["examples/react/app.tsx"], outfile: "examples/react/app.js" }),
]);

console.log("Built examples/demo/app.js and examples/react/app.js.");
