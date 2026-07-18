import { describe, expect, it, vi } from "vitest";
import { type CliDependencies, runCli } from "../../packages/cli/src/index.js";
import { ImposiaError } from "../../packages/node/src/index.js";
import type { RenderResult } from "../../packages/node/src/types.js";

function result(): RenderResult {
  return {
    pages: [
      { number: 1, widthPoints: 595.28, heightPoints: 841.89 },
      { number: 2, widthPoints: 595.28, heightPoints: 841.89 },
      { number: 3, widthPoints: 595.28, heightPoints: 841.89 },
    ],
    pageCount: 3,
    pageSize: { widthPoints: 595.28, heightPoints: 841.89 },
    warnings: [],
    timings: {
      totalMs: 100,
      browserStartupMs: 20,
      resourceWaitMs: 10,
      printPreparationMs: 5,
      pdfGenerationMs: 50,
    },
    pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
  };
}

function dependencies(overrides: Partial<CliDependencies> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const render = vi.fn(async (_input: string, _engine: "legacy" | "core") => result());
  const writeFile = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  const deps: CliDependencies = {
    render,
    close,
    writeFile,
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
    ...overrides,
  };
  return { deps, stdout, stderr, render, writeFile, close };
}

describe("CLI contracts", () => {
  it("accepts pnpm's leading argument separator", async () => {
    const harness = dependencies();

    const exitCode = await runCli(
      ["--", "render", "examples/book.html", "--output", "output/pdf/book.pdf", "--json"],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.render).toHaveBeenCalledWith("examples/book.html", "legacy");
  });

  it.each(["render", "pdf"])(
    "accepts the %s alias and emits machine-readable JSON",
    async (command) => {
      const harness = dependencies();

      const exitCode = await runCli(
        [command, "examples/book.html", "--output", "output/pdf/book.pdf", "--json"],
        harness.deps,
      );

      expect(exitCode).toBe(0);
      expect(harness.render).toHaveBeenCalledWith("examples/book.html", "legacy");
      expect(harness.writeFile).toHaveBeenCalledWith("output/pdf/book.pdf", expect.any(Uint8Array));
      expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
        ok: true,
        output: "output/pdf/book.pdf",
        pageCount: 3,
        pageSize: { widthPoints: 595.28, heightPoints: 841.89 },
        warningCount: 0,
      });
      expect(harness.stderr).toEqual([]);
      expect(harness.close).toHaveBeenCalledOnce();
    },
  );

  it("forwards the explicit Core export engine", async () => {
    const harness = dependencies();

    const exitCode = await runCli(
      ["render", "examples/book.html", "--output", "output/pdf/book.pdf", "--engine", "core"],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.render).toHaveBeenCalledWith("examples/book.html", "core");
  });

  it("returns usage exit 2 for malformed arguments", async () => {
    const harness = dependencies();

    expect(await runCli(["render", "book.html"], harness.deps)).toBe(2);
    expect(harness.stderr.join("\n")).toContain("Usage:");
    expect(harness.render).not.toHaveBeenCalled();
  });

  it("returns input exit 3 for trusted input errors", async () => {
    const harness = dependencies({
      render: vi.fn(async () => {
        throw new ImposiaError("FILE_OUTSIDE_ROOT", "File input is outside the configured root.");
      }),
    });

    expect(await runCli(["render", "escape.html", "--output", "book.pdf"], harness.deps)).toBe(3);
    expect(harness.stderr.join("\n")).toContain("FILE_OUTSIDE_ROOT");
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("returns output exit 4 when the PDF cannot be written", async () => {
    const harness = dependencies({
      writeFile: vi.fn(async () => {
        throw new Error("read-only filesystem");
      }),
    });

    expect(await runCli(["pdf", "book.html", "--output", "book.pdf"], harness.deps)).toBe(4);
    expect(harness.stderr.join("\n")).toContain("OUTPUT_WRITE_FAILED");
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("returns internal exit 5 for unexpected renderer failures", async () => {
    const harness = dependencies({
      render: vi.fn(async () => {
        throw new Error("browser crashed");
      }),
    });

    expect(await runCli(["render", "book.html", "--output", "book.pdf"], harness.deps)).toBe(5);
    expect(harness.stderr.join("\n")).toContain("INTERNAL_ERROR");
    expect(harness.close).toHaveBeenCalledOnce();
  });
});
