import { ImposiaError } from "./errors.js";
import { abortError } from "./page-document-frame.js";
import type {
  AssetResolution,
  AssetResolver,
  ElementResolution,
  ElementResolver,
} from "./page-document-types.js";

const DATA_URL = /^data:([^;,]+);base64,([\s\S]*)$/i;
const COPIED_IMAGE_ATTRIBUTES = ["class", "style", "width", "height", "id"] as const;

/** Decodes a base64 data URL with an explicit MIME type into a resolved asset. */
export function assetFromDataUrl(url: string): Extract<AssetResolution, { status: "resolved" }> {
  const match = DATA_URL.exec(url);
  if (match === null) {
    throw new TypeError("Expected a base64 data URL with an explicit MIME type.");
  }
  const binary = atob(match[2] ?? "");
  return {
    status: "resolved",
    bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    mimeType: match[1] ?? "",
  };
}

type ResolvedImage = Extract<AssetResolution, { status: "resolved" }>;

function imageAsset(result: Extract<ElementResolution, { type: "image" }>): ResolvedImage {
  if ("dataUrl" in result) return assetFromDataUrl(result.dataUrl);
  return {
    status: "resolved",
    bytes: new Uint8Array(result.bytes),
    mimeType: result.mimeType,
  };
}

function applyResolution(
  parsed: Document,
  element: Element,
  result: ElementResolution,
  images: Map<string, ResolvedImage>,
): void {
  switch (result.type) {
    case "text":
      element.textContent = result.text;
      return;
    case "html":
      element.innerHTML = result.html;
      return;
    case "image": {
      const asset = imageAsset(result);
      const key = `https://imposia.invalid/element/${crypto.randomUUID()}`;
      images.set(key, asset);
      const image = parsed.createElement("img");
      for (const name of COPIED_IMAGE_ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (value !== null) image.setAttribute(name, value);
      }
      image.setAttribute("alt", result.alt);
      image.setAttribute("src", key);
      element.replaceWith(image);
      return;
    }
    default:
      throw new TypeError("Invalid element resolution.");
  }
}

function withElementImages(
  images: ReadonlyMap<string, ResolvedImage>,
  original: AssetResolver | undefined,
): AssetResolver {
  return async (request) => {
    if (request.kind === "image") {
      const asset = images.get(request.url);
      if (asset !== undefined) return asset;
    }
    if (original === undefined) return { status: "blocked" };
    return original(request);
  };
}

/**
 * Applies the host's element resolvers to a copy of the document before pagination.
 * Callbacks receive a snapshot of attributes and text, never the live DOM. Resolved
 * images travel to Core's asset pipeline through the returned resolver, so they pass
 * the same MIME, decode, size, and extension checks as authored images.
 */
export async function resolveDocumentElements(
  html: string,
  rules: readonly ElementResolver[],
  assetResolver: AssetResolver | undefined,
  signal: AbortSignal,
  deadlineMs: number,
): Promise<{ html: string; resolver: AssetResolver | undefined }> {
  if (rules.length === 0) return { html, resolver: assetResolver };
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const images = new Map<string, ResolvedImage>();
  const operation = new AbortController();
  const abortOperation = () => operation.abort();
  if (signal.aborted) abortOperation();
  else signal.addEventListener("abort", abortOperation, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    operation.abort();
  }, deadlineMs);
  try {
    for (const rule of rules) {
      const matches = [...parsed.body.querySelectorAll(rule.selector)];
      for (const [index, element] of matches.entries()) {
        if (!parsed.body.contains(element)) continue;
        if (operation.signal.aborted) throw abortError();
        const input = Object.freeze({
          attributes: Object.freeze(
            Object.fromEntries([...element.attributes].map((attr) => [attr.name, attr.value])),
          ),
          text: element.textContent ?? "",
          index,
          signal: operation.signal,
        });
        let onAbort: (() => void) | undefined;
        const aborted = new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(abortError());
          operation.signal.addEventListener("abort", onAbort, { once: true });
        });
        const callback = Promise.resolve().then(() => rule.resolve(input));
        let result: ElementResolution | undefined;
        try {
          result = await Promise.race([callback, aborted]);
        } finally {
          if (onAbort !== undefined) operation.signal.removeEventListener("abort", onAbort);
          // Neither side may leave an unhandled rejection behind once the race settles.
          callback.catch(() => undefined);
          aborted.catch(() => undefined);
        }
        if (operation.signal.aborted) throw abortError();
        if (result === undefined) continue;
        applyResolution(parsed, element, result, images);
      }
    }
    return {
      html: parsed.documentElement.outerHTML,
      resolver: withElementImages(images, assetResolver),
    };
  } catch {
    if (signal.aborted) throw abortError();
    if (timedOut) {
      throw new ImposiaError("ELEMENT_RESOLUTION_FAILED", "Element resolution timed out.");
    }
    throw new ImposiaError("ELEMENT_RESOLUTION_FAILED", "Element resolution failed.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abortOperation);
    operation.abort();
  }
}
