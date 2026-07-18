import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const evidencePath = path.resolve("artifacts/evidence/final-check-raw.log");
const hashedFiles = [
  "output/pdf/imposia-example.pdf",
  "benchmarks/baseline.json",
  "tests/fixtures/pdf/imposia-example.semantic.json",
  "tests/fixtures/pdf/visual/page-1.png",
  "tests/fixtures/pdf/visual/page-2.png",
  "tests/fixtures/pdf/visual/page-3.png",
] as const;

function run(): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["check"], { cwd: process.cwd(), env: process.env });
    let output = "";
    const relay = (chunk: Buffer, target: NodeJS.WriteStream): void => {
      const value = chunk.toString();
      output += value;
      target.write(value);
    };
    child.stdout.on("data", (chunk: Buffer) => relay(chunk, process.stdout));
    child.stderr.on("data", (chunk: Buffer) => relay(chunk, process.stderr));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const result = await run();
  const hashes: string[] = [];
  if (result.code === 0) {
    for (const file of hashedFiles) {
      const digest = createHash("sha256")
        .update(await readFile(path.resolve(file)))
        .digest("hex");
      hashes.push(`${digest}  ${file}`);
    }
  }
  const receipt = [
    `command: pnpm check`,
    `startedAt: ${startedAt}`,
    `node: ${process.version}`,
    `platform: ${process.platform}/${process.arch}`,
    "--- stdout+stderr ---",
    result.output,
    "--- receipt ---",
    `exitCode: ${result.code}`,
    `completedAt: ${new Date().toISOString()}`,
    ...hashes,
    "",
  ].join("\n");
  await writeFile(evidencePath, receipt);
  if (result.code !== 0) process.exitCode = result.code;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
