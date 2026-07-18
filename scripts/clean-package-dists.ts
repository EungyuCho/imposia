import { rm } from "node:fs/promises";

const packages = ["client", "core", "react", "viewer"];

await Promise.all(
  packages.flatMap((packageName) => [
    rm(`packages/${packageName}/dist`, { force: true, recursive: true }),
    rm(`packages/${packageName}/tsconfig.tsbuildinfo`, { force: true }),
  ]),
);
