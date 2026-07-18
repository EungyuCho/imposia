import { rm } from "node:fs/promises";

const packages = ["core", "node", "viewer", "cli"];

await Promise.all(
  packages.flatMap((packageName) => [
    rm(`packages/${packageName}/dist`, { force: true, recursive: true }),
    rm(`packages/${packageName}/tsconfig.tsbuildinfo`, { force: true }),
  ]),
);
