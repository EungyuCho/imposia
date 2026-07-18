import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright";
import { assertFileWithinRoot, validateRenderInput } from "./document.js";
import { ImposiaError } from "./errors.js";
import type { RenderInput, RenderOptions } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_INPUT_BYTES = 5 * 1024 * 1024;

export interface LoadedDocument {
  html: string;
  baseUrl?: string;
}

function inputTooLarge(maxInputBytes: number): ImposiaError {
  return new ImposiaError("INPUT_TOO_LARGE", `HTML input exceeds the ${maxInputBytes}-byte limit.`);
}

async function readBoundedText(
  response: Response,
  maxInputBytes: number,
  controller: AbortController,
): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    byteLength += chunk.value.byteLength;
    if (byteLength > maxInputBytes) {
      controller.abort();
      throw inputTooLarge(maxInputBytes);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function injectBaseUrl(html: string, baseUrl: string | undefined): string {
  if (baseUrl === undefined) return html;
  const base = `<base href="${escapeAttribute(baseUrl)}">`;
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`)
    : html.replace(/<html(?:\s[^>]*)?>/i, (root) => `${root}<head>${base}</head>`);
}

export async function loadDocument(
  input: RenderInput,
  options: RenderOptions,
): Promise<LoadedDocument> {
  const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const validated = validateRenderInput(input, maxInputBytes);
  if ("html" in validated) {
    return {
      html: validated.html,
      ...(validated.baseUrl === undefined ? {} : { baseUrl: validated.baseUrl }),
    };
  }

  if ("file" in validated) {
    const file =
      options.allowFileRoot === undefined
        ? path.resolve(validated.file)
        : await assertFileWithinRoot(validated.file, options.allowFileRoot);
    if ((await stat(file)).size > maxInputBytes) throw inputTooLarge(maxInputBytes);
    const html = await readFile(file, "utf8");
    validateRenderInput({ html }, maxInputBytes);
    return { html, baseUrl: pathToFileURL(`${path.dirname(file)}${path.sep}`).href };
  }

  if (!options.allowRemoteResources) {
    throw new ImposiaError(
      "REMOTE_INPUT_BLOCKED",
      "URL input requires allowRemoteResources to be enabled.",
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(validated.url, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ImposiaError(
        "URL_INPUT_FAILED",
        `URL input returned HTTP ${response.status} ${response.statusText}.`,
      );
    }
    const html = await readBoundedText(response, maxInputBytes, controller);
    validateRenderInput({ html }, maxInputBytes);
    return { html, baseUrl: response.url };
  } catch (error) {
    if (timedOut) {
      throw new ImposiaError("TIMEOUT", `Timed out waiting for URL input after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function configureResourceBoundary(page: Page, options: RenderOptions): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.isNavigationRequest()) {
      await route.abort("blockedbyclient");
      return;
    }
    if (/^https?:/i.test(url) && !options.allowRemoteResources) {
      await route.abort("blockedbyclient");
      return;
    }
    if (url.startsWith("file:") && options.allowFileRoot !== undefined) {
      try {
        const file = decodeURIComponent(new URL(url).pathname);
        await assertFileWithinRoot(file, options.allowFileRoot);
      } catch {
        await route.abort("blockedbyclient");
        return;
      }
    }
    await route.continue();
  });
}
