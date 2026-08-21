import postcss, { type Root } from "postcss";
import { ImposiaError } from "./errors.js";
import {
  BLOCKED_REASON,
  type BlockedReason,
  containerMismatchReason,
  undecodableReason,
  unsupportedMimeReason,
} from "./page-document-blocked-reasons.js";
import { abortError } from "./page-document-frame.js";
import type { AssetResolution, AssetResolver } from "./page-document-types.js";

export type AssetOutcome =
  /**
   * `reason` names why the bytes did not become an asset, in words a resolver author can
   * act on. It matters most when the resolver said `resolved` and Core overruled it: without
   * a reason the caller sees a successful resolution and a document that quietly composed
   * with a substitute, and has nothing to trace back from.
   *
   * The `BlockedReason` brand keeps every reason Core-authored: a resolver's own `reason`
   * text cannot become one, so it can never reach `document.warnings`.
   */
  | { readonly status: "blocked"; readonly reason?: BlockedReason }
  | {
      readonly status: "asset";
      readonly blobUrl: string;
      readonly bytes: Uint8Array;
      readonly mimeType: string;
      readonly resolvedUrl?: string;
    }
  | {
      readonly status: "stylesheet";
      readonly root: Root;
      readonly bytes: Uint8Array;
      readonly mimeType: string;
      readonly resolvedUrl?: string;
    };

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

// Font MIME types that predate the `font/*` tree (RFC 8081). Servers still send them --
// a `.woff` served as `application/x-font-woff` is common enough that rejecting it strands
// otherwise valid fonts, and the failure is invisible: the face lands with an empty `src`
// and the document silently composes with a fallback face, shifting every line box.
//
// Canonicalising is not a weaker check. The container is verified from its magic bytes by
// `hasContainerSignature`, and the decoded font still has to load through `FontFace`.
// The declared type only decides which allowlist entry it matches and what `Blob` type the
// generated object URL carries, so mapping an alias onto its modern spelling keeps both
// correct rather than trusting the caller's label.
const MIME_ALIASES = new Map<string, string>([
  ["application/font-woff", "font/woff"],
  ["application/x-font-woff", "font/woff"],
  ["application/font-woff2", "font/woff2"],
  ["application/x-font-woff2", "font/woff2"],
  ["application/font-sfnt", "font/ttf"],
  ["application/x-font-ttf", "font/ttf"],
  ["application/x-font-truetype", "font/ttf"],
  ["application/x-truetype-font", "font/ttf"],
  ["application/font-otf", "font/otf"],
  ["application/x-font-otf", "font/otf"],
  ["application/x-font-opentype", "font/otf"],
  ["application/vnd.ms-opentype", "font/otf"],
]);

export function mimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/**
 * The declared type reduced to its modern spelling.
 *
 * Every alias above names a font container, so this cannot pull a non-font type into the
 * font allowlist. Values with no alias are returned unchanged.
 */
export function canonicalMimeType(value: string): string {
  const mime = mimeType(value);
  return MIME_ALIASES.get(mime) ?? mime;
}

export function unsafeAuthoredUrl(value: string): boolean {
  return /^javascript:/i.test(value.trim());
}

function supportedMime(kind: AssetRequest["kind"], value: string): boolean {
  const mime = canonicalMimeType(value);
  if (kind === "stylesheet") return mime === "text/css";
  if (kind === "image") return IMAGE_MIME_TYPES.has(mime);
  if (kind === "font") return FONT_MIME_TYPES.has(mime);
  return MEDIA_MIME_TYPES.has(mime);
}

function hasContainerSignature(kind: AssetRequest["kind"], bytes: Uint8Array): boolean {
  if (kind === "font") {
    const text = new TextDecoder("ascii").decode(bytes.subarray(0, 4));
    return (
      text === "wOFF" ||
      text === "wOF2" ||
      text === "OTTO" ||
      (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
    );
  }
  if (kind !== "media") return true;
  const text = new TextDecoder("ascii").decode(bytes.subarray(0, 12));
  return (
    text.startsWith("OggS") ||
    (text.startsWith("RIFF") && text.slice(8, 12) === "WAVE") ||
    text.slice(4, 8) === "ftyp" ||
    (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) ||
    text.startsWith("ID3") ||
    (bytes.length >= 2 && bytes[0] === 0xff && ((bytes.at(1) ?? 0) & 0xe0) === 0xe0)
  );
}

function resourceBlob(bytes: Uint8Array, mime: string): Blob {
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType(mime) });
}

function createBlob(scope: BlobScope, bytes: Uint8Array, mime: string): string {
  const url = URL.createObjectURL(resourceBlob(bytes, mime));
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

async function decodeImage(bytes: Uint8Array, mime: string): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(resourceBlob(bytes, mime));
    const decoded = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close();
    return decoded;
  } catch (_error: unknown) {
    return false;
  }
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
  if (signal.aborted) return { status: "blocked", reason: BLOCKED_REASON.superseded };
  if (unsafeAuthoredUrl(request.url)) {
    return { status: "blocked", reason: BLOCKED_REASON.unsafeScheme };
  }
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
  if (resolution.status === "blocked") {
    // `resolution.reason` is deliberately not read: it is the resolver's private text and
    // must never surface in diagnostics (docs/architecture/0005-core-extension-contract.md).
    return { status: "blocked", reason: BLOCKED_REASON.resolverRefused };
  }
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
    return {
      status: "blocked",
      reason: unsupportedMimeReason(mimeType(resolution.mimeType), request.kind),
    };
  }
  // Everything downstream -- the object URL's Blob type, the decode probe, and the type
  // reported back to the caller -- uses the canonical spelling, so an aliased font is
  // indistinguishable from one whose server already sent `font/woff`.
  const canonicalMime = canonicalMimeType(resolution.mimeType);
  if (!hasContainerSignature(request.kind, copied)) {
    return { status: "blocked", reason: containerMismatchReason(canonicalMime) };
  }
  if (request.kind === "stylesheet") {
    try {
      const root = postcss.parse(new TextDecoder("utf-8", { fatal: true }).decode(copied));
      return {
        status: "stylesheet",
        root,
        bytes: copied,
        mimeType: canonicalMime,
        ...(typeof resolution.resolvedUrl === "string"
          ? { resolvedUrl: resolution.resolvedUrl }
          : {}),
      };
    } catch (_error: unknown) {
      return { status: "blocked", reason: BLOCKED_REASON.unparsableStylesheet };
    }
  }
  let blobUrl: string | undefined;
  let ready: boolean;
  if (request.kind === "image") {
    ready = await decodeImage(copied, canonicalMime);
  } else {
    blobUrl = createBlob(scope, copied, canonicalMime);
    ready =
      request.kind === "font" ? await loadFont(blobUrl) : await loadMedia(blobUrl, request.kind);
  }
  if (!ready) {
    if (blobUrl !== undefined) revokeBlob(scope, blobUrl);
    return { status: "blocked", reason: undecodableReason(canonicalMime) };
  }
  blobUrl ??= createBlob(scope, copied, canonicalMime);
  if (blobUrl === undefined) throw resolutionFailure();
  if (signal.aborted) {
    if (scope.urls.delete(blobUrl)) URL.revokeObjectURL(blobUrl);
    throw abortError();
  }
  return {
    status: "asset",
    blobUrl,
    bytes: copied,
    mimeType: canonicalMime,
    ...(typeof resolution.resolvedUrl === "string" ? { resolvedUrl: resolution.resolvedUrl } : {}),
  };
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
