import { ImposiaError } from "./errors.js";
import {
  type AssetDiscovery,
  type CssContext,
  discoverPageAssets,
  setOwner,
} from "./page-document-assets-discovery.js";
import {
  type AssetOutcome,
  type AssetRequest,
  type BlobScope,
  resolveOne,
  unsafeAuthoredUrl,
} from "./page-document-assets-resolver.js";
import { abortError } from "./page-document-frame.js";
import type { ResolvedSemanticAsset } from "./page-document-semantic.js";
import type {
  AssetResolver,
  PageExtensionAssetRequest,
  PageLimits,
} from "./page-document-types.js";

export type ResolvedPageAssets = {
  readonly html: string;
  readonly css: readonly string[];
  readonly blobUrls: readonly string[];
  readonly resourceBlocked: boolean;
  readonly sourceIdentity: string | undefined;
  readonly semanticAssets: readonly ResolvedSemanticAsset[];
  revoke(): void;
};

function blockedScheme(value: string): boolean {
  return unsafeAuthoredUrl(value) || value.trim() === "";
}

function createScope(): BlobScope {
  let revoked = false;
  return {
    urls: new Set<string>(),
    get revoked() {
      return revoked;
    },
    revoke() {
      if (revoked) return;
      revoked = true;
      for (const url of this.urls) URL.revokeObjectURL(url);
      this.urls.clear();
    },
  };
}

function referenceError(): ImposiaError {
  return new ImposiaError("ASSET_REFERENCE_LIMIT", "Asset reference limit exceeded.");
}

function depthError(): ImposiaError {
  return new ImposiaError("ASSET_DEPTH_LIMIT", "Asset depth limit exceeded.");
}

function bytesError(): ImposiaError {
  return new ImposiaError("ASSET_BYTES_LIMIT", "Asset byte limit exceeded.");
}

export async function resolvePageAssets(
  html: string,
  sourceBaseUrl: string | undefined,
  css: readonly string[],
  resolver: AssetResolver,
  limits: PageLimits | undefined,
  signal: AbortSignal,
  allowAsset?: (request: PageExtensionAssetRequest) => boolean,
): Promise<ResolvedPageAssets> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const operation = new AbortController();
  const abortOperation = () => operation.abort();
  if (signal.aborted) abortOperation();
  else signal.addEventListener("abort", abortOperation, { once: true });
  const scope = createScope();
  let assetBytes = 0;
  const semanticAssets: ResolvedSemanticAsset[] = [];
  let identity = 0;
  const makeRequest = (
    kind: AssetRequest["kind"],
    url: string,
    baseUrl: string | undefined,
    depth: number,
    apply: (outcome: AssetOutcome) => readonly AssetRequest[],
  ): AssetRequest => ({
    kind,
    url,
    baseUrl,
    depth,
    sourceIdentity: `resource-${identity++}`,
    apply,
  });
  const discovery: AssetDiscovery = discoverPageAssets(parsed, sourceBaseUrl, css, makeRequest);
  let blocked = discovery.blocked;
  let blockedIdentity: string | undefined;
  let queue = [...discovery.queue];
  const contexts: readonly CssContext[] = discovery.contexts;
  const outputCss = discovery.outputCss;
  const markBlocked = (request: AssetRequest): AssetOutcome => {
    blocked = true;
    blockedIdentity ??= request.sourceIdentity;
    return { status: "blocked" };
  };

  try {
    while (queue.length > 0) {
      if (operation.signal.aborted) throw abortError();
      const level = queue;
      queue = [];
      const outcomes: AssetOutcome[] = [];
      for (let start = 0; start < level.length; start += 8) {
        const batch = level.slice(start, start + 8);
        outcomes.push(
          ...(await Promise.all(
            batch.map((request) => {
              const requestIndex = Number(request.sourceIdentity.slice("resource-".length));
              if (
                limits?.maxAssetReferences !== undefined &&
                requestIndex >= limits.maxAssetReferences
              )
                return Promise.reject(referenceError());
              if (limits?.maxAssetDepth !== undefined && request.depth >= limits.maxAssetDepth)
                return Promise.reject(depthError());
              const extensionRequest = Object.freeze({
                url: request.url,
                kind: request.kind,
                baseUrl: request.baseUrl,
                depth: request.depth,
                sourceIdentity: request.sourceIdentity,
              });
              if (allowAsset !== undefined && !allowAsset(extensionRequest)) {
                return Promise.resolve(markBlocked(request));
              }
              if (blockedScheme(request.url)) return Promise.resolve(markBlocked(request));
              return resolveOne(request, resolver, operation.signal, scope, (bytes) => {
                if (
                  limits?.maxAssetBytes !== undefined &&
                  assetBytes + bytes > limits.maxAssetBytes
                ) {
                  throw bytesError();
                }
                assetBytes += bytes;
              }).catch((error: unknown) => {
                if (operation.signal.aborted) throw abortError();
                throw error;
              });
            }),
          )),
        );
      }
      const next: AssetRequest[] = [];
      for (const [index, request] of level.entries()) {
        const outcome = outcomes[index];
        if (outcome === undefined) continue;
        if (outcome.status === "blocked") markBlocked(request);
        else {
          semanticAssets.push(
            Object.freeze({
              kind: request.kind,
              authoredUrl: request.url,
              sourceIdentity: request.sourceIdentity,
              mimeType: outcome.mimeType,
              bytes: new Uint8Array(outcome.bytes),
              ...(outcome.status === "asset" ? { blobUrl: outcome.blobUrl } : {}),
              ...(outcome.resolvedUrl === undefined ? {} : { resolvedUrl: outcome.resolvedUrl }),
            }),
          );
        }
        next.push(...request.apply(outcome));
      }
      queue = next;
    }
    for (const context of contexts) setOwner(context, outputCss);
    return {
      html: parsed.documentElement.outerHTML,
      css: Object.freeze(outputCss),
      blobUrls: Object.freeze([...scope.urls]),
      resourceBlocked: blocked,
      sourceIdentity: blockedIdentity,
      semanticAssets: Object.freeze(semanticAssets),
      revoke: () => scope.revoke(),
    };
  } catch (error: unknown) {
    operation.abort();
    scope.revoke();
    throw error;
  } finally {
    signal.removeEventListener("abort", abortOperation);
  }
}
