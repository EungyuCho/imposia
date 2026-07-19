import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoOutput = "examples/demo/app.js";
const reactOutput = "examples/react/app.js";

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
  build({ ...shared, entryPoints: ["examples/demo/app.tsx"], outfile: demoOutput }),
  build({
    ...shared,
    entryPoints: ["examples/react/app.tsx"],
    outfile: reactOutput,
    define: { "process.env.NODE_ENV": '"development"' },
  }),
]);

await Promise.all(
  [demoOutput, reactOutput].map(async (output) => {
    const file = path.join(root, output);
    const source = await readFile(file, "utf8");
    await writeFile(file, source.replace(/[\t ]+$/gmu, ""), "utf8");
  }),
);

console.log("Built examples/demo/app.js and examples/react/app.js.");
