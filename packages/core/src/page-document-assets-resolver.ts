import postcss, { type Root } from "postcss";
import { ImposiaError } from "./errors.js";
import { abortError } from "./page-document-frame.js";
import type { AssetResolution, AssetResolver } from "./page-document-types.js";

export type AssetOutcome =
  | { readonly status: "blocked" }
  | { readonly status: "asset"; readonly blobUrl: string }
  | { readonly status: "stylesheet"; readonly root: Root; readonly resolvedUrl?: string };

export type BlobScope = {
  readonly urls: Set<string>;
  readonly revoked: boolean;
  revoke(): void;
};

export type AssetRequest = {
  readonly kind: "font" | "image" | "media" | "stylesheet";
  readonly url: string;
  readonly baseUrl: string | undefined;
  readonly sourceIdentity: string;
  readonly depth: number;
  readonly apply: (outcome: AssetOutcome) => readonly AssetRequest[];
};

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);
const FONT_MIME_TYPES = new Set(["font/woff", "font/woff2", "font/ttf", "font/otf"]);
const MEDIA_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/ogg",
  "video/webm",
]);

export function mimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function unsafeAuthoredUrl(value: string): boolean {
  return /^javascript:/i.test(value.trim());
}

function supportedMime(kind: AssetRequest["kind"], value: string): boolean {
  const mime = mimeType(value);
  if (kind === "stylesheet") return mime === "text/css";
  if (kind === "image") return IMAGE_MIME_TYPES.has(mime);
  if (kind === "font") return FONT_MIME_TYPES.has(mime);
  return MEDIA_MIME_TYPES.has(mime);
}

function createBlob(scope: BlobScope, bytes: Uint8Array, mime: string): string {
  const url = URL.createObjectURL(
    new Blob([bytes.buffer as ArrayBuffer], { type: mimeType(mime) }),
  );
  if (scope.revoked) {
    URL.revokeObjectURL(url);
    throw abortError();
  }
  scope.urls.add(url);
  return url;
}

function revokeBlob(scope: BlobScope, url: string): void {
  if (!scope.urls.delete(url)) return;
  URL.revokeObjectURL(url);
}

async function decodeImage(blobUrl: string): Promise<boolean> {
  const image = document.createElement("img");
  image.src = blobUrl;
  try {
    await image.decode();
  } catch (_error: unknown) {
    return false;
  }
  return image.naturalWidth > 0 && image.naturalHeight > 0;
}

async function loadFont(blobUrl: string): Promise<boolean> {
  if (typeof FontFace === "undefined") return false;
  try {
    await new FontFace("__imposia_asset__", `url("${blobUrl}")`).load();
    return true;
  } catch (_error: unknown) {
    return false;
  }
}

async function loadMedia(blobUrl: string, kind: AssetRequest["kind"]): Promise<boolean> {
  const media = document.createElement(kind === "media" ? "video" : "audio");
  media.preload = "metadata";
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      media.removeEventListener("loadedmetadata", onReady);
      media.removeEventListener("error", onError);
      resolve(value);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    media.addEventListener("loadedmetadata", onReady, { once: true });
    media.addEventListener("error", onError, { once: true });
    media.src = blobUrl;
    media.load();
  });
}

function resolutionFailure(): ImposiaError {
  return new ImposiaError("RESOURCE_RESOLUTION_FAILED", "Asset resolution failed.");
}

async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function resolveOneWork(
  request: AssetRequest,
  resolver: AssetResolver,
  signal: AbortSignal,
  scope: BlobScope,
  consumeBytes?: (bytes: number) => void,
): Promise<AssetOutcome> {
  if (signal.aborted || unsafeAuthoredUrl(request.url)) return { status: "blocked" };
  let resolution: AssetResolution;
  try {
    resolution = await abortable(
      resolver({
        url: request.url,
        kind: request.kind,
        ...(request.baseUrl === undefined ? {} : { baseUrl: request.baseUrl }),
        signal,
      }),
      signal,
    );
  } catch (_error: unknown) {
    if (signal.aborted) throw abortError();
    throw resolutionFailure();
  }
  if (signal.aborted) throw abortError();
  if (resolution === null || typeof resolution !== "object") throw resolutionFailure();
  if (resolution.status === "blocked") return { status: "blocked" };
  if (resolution.status !== "resolved") throw resolutionFailure();
  if (!(resolution.bytes instanceof Uint8Array) || typeof resolution.mimeType !== "string") {
    throw resolutionFailure();
  }
  if (resolution.resolvedUrl !== undefined && typeof resolution.resolvedUrl !== "string") {
    throw resolutionFailure();
  }
  const copied = new Uint8Array(resolution.bytes);
  consumeBytes?.(copied.byteLength);
  if (!supportedMime(request.kind, resolution.mimeType)) {
    return { status: "blocked" };
  }
  if (request.kind === "stylesheet") {
    try {
      const root = postcss.parse(new TextDecoder("utf-8", { fatal: true }).decode(copied));
      return {
        status: "stylesheet",
        root,
        ...(typeof resolution.resolvedUrl === "string"
          ? { resolvedUrl: resolution.resolvedUrl }
          : {}),
      };
    } catch (_error: unknown) {
      return { status: "blocked" };
    }
  }
  const blobUrl = createBlob(scope, copied, resolution.mimeType);
  const ready =
    request.kind === "image"
      ? await decodeImage(blobUrl)
      : request.kind === "font"
        ? await loadFont(blobUrl)
        : await loadMedia(blobUrl, request.kind);
  if (!ready) {
    revokeBlob(scope, blobUrl);
    return { status: "blocked" };
  }
  if (signal.aborted) {
    if (scope.urls.delete(blobUrl)) URL.revokeObjectURL(blobUrl);
    throw abortError();
  }
  return { status: "asset", blobUrl };
}

export function resolveOne(
  request: AssetRequest,
  resolver: AssetResolver,
  signal: AbortSignal,
  scope: BlobScope,
  consumeBytes?: (bytes: number) => void,
): Promise<AssetOutcome> {
  return abortable(resolveOneWork(request, resolver, signal, scope, consumeBytes), signal);
}
