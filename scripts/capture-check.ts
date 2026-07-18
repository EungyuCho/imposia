import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const evidencePath = path.resolve("artifacts/evidence/final-check-raw.log");

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
    "",
  ].join("\n");
  await writeFile(evidencePath, receipt);
  if (result.code !== 0) process.exitCode = result.code;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
