import { Buffer } from "node:buffer";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { ImposiaError } from "@imposia/core";
import type { RenderEngine, RenderInput, RenderOptions } from "./types.js";

function valueAt(input: object, key: string): unknown {
  return Reflect.get(input, key);
}

export function validateRenderInput(input: unknown, maxInputBytes = 5 * 1024 * 1024): RenderInput {
  if (typeof input !== "object" || input === null) {
    throw new ImposiaError(
      "INVALID_INPUT",
      "Render input must contain exactly one of html, file, or url.",
    );
  }
  const keys = ["html", "file", "url"].filter((key) => valueAt(input, key) !== undefined);
  if (keys.length !== 1) {
    throw new ImposiaError(
      "INVALID_INPUT",
      "Render input must contain exactly one of html, file, or url.",
    );
  }
  const key = keys[0];
  if (key === undefined) throw new ImposiaError("INVALID_INPUT", "Render input is missing.");
  const value = valueAt(input, key);
  if (typeof value !== "string" || value.length === 0) {
    const label = key === "html" ? "HTML" : key === "file" ? "File" : "URL";
    throw new ImposiaError("INVALID_INPUT", `${label} input must not be empty.`);
  }
  if (key === "html" && Buffer.byteLength(value, "utf8") > maxInputBytes) {
    throw new ImposiaError(
      "INPUT_TOO_LARGE",
      `HTML input exceeds the ${maxInputBytes}-byte limit.`,
    );
  }
  if (key === "html") {
    const baseUrl = valueAt(input, "baseUrl");
    if (baseUrl !== undefined && typeof baseUrl !== "string") {
      throw new ImposiaError("INVALID_INPUT", "HTML baseUrl must be a string URL.");
    }
    if (typeof baseUrl === "string") {
      try {
        new URL(baseUrl);
      } catch {
        throw new ImposiaError("INVALID_INPUT", "HTML baseUrl must be an absolute URL.");
      }
    }
    return { html: value, ...(typeof baseUrl === "string" ? { baseUrl } : {}) };
  }
  if (key === "file") return { file: value };
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) {
      throw new ImposiaError("INVALID_INPUT", "URL input must use the HTTP or HTTPS protocol.");
    }
  } catch (error) {
    if (error instanceof ImposiaError) throw error;
    throw new ImposiaError("INVALID_INPUT", "URL input must be an absolute HTTP(S) URL.");
  }
  return { url: value };
}

function invalidOptions(message: string): never {
  throw new ImposiaError("INVALID_OPTIONS", message);
}

function validatePositiveInteger(value: unknown, name: string): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    invalidOptions(`${name} must be a finite positive integer.`);
  }
}

export function validateRenderOptions(options: unknown): RenderOptions & { engine: RenderEngine } {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    return invalidOptions("Render options must be an object.");
  }
  const candidate = options as Record<string, unknown>;
  const engine = candidate.engine ?? "legacy";
  if (engine !== "legacy" && engine !== "core") {
    throw new ImposiaError("INVALID_ENGINE", 'engine must be either "legacy" or "core".');
  }
  for (const name of ["headerTemplate", "footerTemplate", "allowFileRoot"] as const) {
    if (candidate[name] !== undefined && typeof candidate[name] !== "string") {
      invalidOptions(`${name} must be a string.`);
    }
  }
  for (const name of ["allowRemoteResources"] as const) {
    if (candidate[name] !== undefined && typeof candidate[name] !== "boolean") {
      invalidOptions(`${name} must be a boolean.`);
    }
  }
  for (const name of ["timeoutMs", "maxInputBytes"] as const) {
    if (candidate[name] !== undefined) validatePositiveInteger(candidate[name], name);
  }
  for (const name of [
    "onStart",
    "onResourcesReady",
    "onPaginated",
    "onPdfReady",
    "onWarning",
  ] as const) {
    if (candidate[name] !== undefined && typeof candidate[name] !== "function") {
      invalidOptions(`${name} must be a function.`);
    }
  }
  if (
    candidate.core !== undefined &&
    (typeof candidate.core !== "object" || candidate.core === null || Array.isArray(candidate.core))
  )
    invalidOptions("core must be an object.");
  if (engine === "legacy" && candidate.core !== undefined) {
    throw new ImposiaError("ENGINE_OPTION_UNSUPPORTED", 'The core option requires engine: "core".');
  }
  if (engine === "core" && candidate.core !== undefined) {
    const core = candidate.core as Record<string, unknown>;
    if (
      core.css !== undefined &&
      (!Array.isArray(core.css) || core.css.some((stylesheet) => typeof stylesheet !== "string"))
    ) {
      invalidOptions("core.css must be an array of strings.");
    }
    if (
      core.page !== undefined &&
      (typeof core.page !== "object" || core.page === null || Array.isArray(core.page))
    ) {
      invalidOptions("core.page must be an object.");
    }
    if (
      core.limits !== undefined &&
      (typeof core.limits !== "object" || core.limits === null || Array.isArray(core.limits))
    ) {
      invalidOptions("core.limits must be an object.");
    }
  }
  return { ...(candidate as RenderOptions), engine };
}

function assertLexicalContainment(file: string, root: string): void {
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ImposiaError(
      "FILE_OUTSIDE_ROOT",
      "File input is outside the configured allowFileRoot.",
    );
  }
}

export async function assertFileWithinRoot(file: string, allowFileRoot: string): Promise<string> {
  const lexicalFile = path.resolve(file);
  const lexicalRoot = path.resolve(allowFileRoot);
  assertLexicalContainment(lexicalFile, lexicalRoot);
  const [canonicalRoot, canonicalFile] = await Promise.all([
    realpath(lexicalRoot),
    realpath(lexicalFile),
  ]);
  assertLexicalContainment(canonicalFile, canonicalRoot);
  return canonicalFile;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      if (label === "resources") {
        reject(new ImposiaError("RESOURCE_TIMEOUT", "Resource loading timed out."));
        return;
      }
      if (label === "fonts") {
        reject(new ImposiaError("FONT_TIMEOUT", "Font readiness timed out."));
        return;
      }
      reject(new ImposiaError("TIMEOUT", `Timed out waiting for ${label} after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
