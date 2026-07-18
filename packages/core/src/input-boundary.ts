import { Buffer } from "node:buffer";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { ImposiaError } from "./errors.js";
import type { RenderInput } from "./types.js";

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
  const keys = ["html", "file", "url"].filter((key) => typeof valueAt(input, key) === "string");
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
    return { html: value, ...(typeof baseUrl === "string" ? { baseUrl } : {}) };
  }
  return key === "file" ? { file: value } : { url: value };
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
