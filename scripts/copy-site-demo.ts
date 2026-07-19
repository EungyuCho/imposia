import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "examples/demo");
const outputDirectory = path.join(root, "site/build/client/examples/demo");
const assets = ["app.js", "index.html", "styles.css"];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  assets.map((asset) =>
    copyFile(path.join(sourceDirectory, asset), path.join(outputDirectory, asset)),
  ),
);

await Promise.all(
  assets.map(async (asset) => {
    const source = await readFile(path.join(sourceDirectory, asset));
    const output = await readFile(path.join(outputDirectory, asset));
    if (!source.equals(output)) {
      throw new Error(`Copied demo asset does not match its source: ${asset}`);
    }
  }),
);

console.log("Copied and verified the runnable demo in the CSR site build.");
