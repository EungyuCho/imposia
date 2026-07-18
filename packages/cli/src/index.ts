#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRenderer, ImposiaError, type RenderResult } from "@imposia/node";

const USAGE = "Usage: imposia <render|pdf> <input.html> --output <output.pdf> [--json]";

export interface CliDependencies {
  render(input: string): Promise<RenderResult>;
  close(): Promise<void>;
  writeFile(output: string, pdf: Uint8Array): Promise<void>;
  stdout(message: string): void;
  stderr(message: string): void;
}

interface ParsedArguments {
  input: string;
  output: string;
  json: boolean;
}

function parseArguments(args: string[]): ParsedArguments | undefined {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const [command, input, ...rest] = normalizedArgs;
  if ((command !== "render" && command !== "pdf") || input === undefined || input.startsWith("-")) {
    return undefined;
  }
  let output: string | undefined;
  let json = false;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--output") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("-")) return undefined;
      output = value;
      index += 1;
      continue;
    }
    return undefined;
  }
  return output === undefined ? undefined : { input, output, json };
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof ImposiaError) return error.code;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function isInputError(error: unknown): boolean {
  return new Set([
    "INVALID_INPUT",
    "INPUT_TOO_LARGE",
    "FILE_OUTSIDE_ROOT",
    "REMOTE_INPUT_BLOCKED",
    "URL_INPUT_FAILED",
    "ENOENT",
    "EISDIR",
  ]).has(errorCode(error) ?? "");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultDependencies(): CliDependencies {
  const renderer = createRenderer();
  return {
    render(input) {
      return renderer.render({ file: input }, { allowFileRoot: process.cwd() });
    },
    close() {
      return renderer.close();
    },
    async writeFile(output, pdf) {
      await mkdir(path.dirname(path.resolve(output)), { recursive: true });
      await writeFile(output, pdf);
    },
    stdout(output) {
      process.stdout.write(`${output}\n`);
    },
    stderr(output) {
      process.stderr.write(`${output}\n`);
    },
  };
}

export async function runCli(args: string[], dependencies?: CliDependencies): Promise<number> {
  const parsed = parseArguments(args);
  if (parsed === undefined) {
    (dependencies?.stderr ?? ((output: string) => process.stderr.write(`${output}\n`)))(USAGE);
    return 2;
  }

  const deps = dependencies ?? defaultDependencies();
  let rendered: RenderResult;
  try {
    rendered = await deps.render(parsed.input);
  } catch (error) {
    const code = errorCode(error) ?? "INTERNAL_ERROR";
    deps.stderr(`${code}: ${message(error)}`);
    return isInputError(error) ? 3 : 5;
  } finally {
    await deps.close();
  }

  try {
    await deps.writeFile(parsed.output, rendered.pdf);
  } catch (error) {
    deps.stderr(`OUTPUT_WRITE_FAILED: ${message(error)}`);
    return 4;
  }

  if (parsed.json) {
    deps.stdout(
      JSON.stringify({
        ok: true,
        output: parsed.output,
        pageCount: rendered.pageCount,
        pageSize: rendered.pageSize,
        warningCount: rendered.warnings.length,
        warnings: rendered.warnings,
        timings: rendered.timings,
      }),
    );
  } else {
    deps.stdout(`Rendered ${rendered.pageCount} pages to ${parsed.output}`);
  }
  return 0;
}

export async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`INTERNAL_ERROR: ${message(error)}\n`);
    process.exitCode = 5;
  });
}
