import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";

const minimumNodeMajor = 22;

async function requireFile(file: string, purpose: string): Promise<void> {
  try {
    await access(file);
  } catch {
    throw new Error(`${purpose} is missing at ${file}.`);
  }
}

async function main(): Promise<void> {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (nodeMajor < minimumNodeMajor) {
    throw new Error(`Node.js ${minimumNodeMajor}+ is required; found ${process.version}.`);
  }
  await Promise.all([
    requireFile(path.resolve("pnpm-lock.yaml"), "Frozen dependency lockfile"),
    requireFile(path.resolve("LICENSE"), "Apache-2.0 license"),
    requireFile(path.resolve("THIRD_PARTY_NOTICES.md"), "Third-party notices"),
    requireFile(chromium.executablePath(), "Pinned Chromium browser"),
    requireFile(firefox.executablePath(), "Pinned Firefox browser"),
    requireFile(webkit.executablePath(), "Pinned WebKit browser"),
  ]);
  const license = await readFile(path.resolve("LICENSE"), "utf8");
  if (!license.includes("9. Accepting Warranty or Additional Liability.")) {
    throw new Error("LICENSE is not the complete Apache-2.0 text.");
  }
  process.stdout.write(
    `Preflight passed: Node ${process.versions.node}; pinned Chromium, Firefox, and WebKit available; release notices present.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
