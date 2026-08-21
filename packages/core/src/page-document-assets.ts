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
import { BLOCKED_REASON, type BlockedReason } from "./page-document-blocked-reasons.js";
import { abortError } from "./page-document-frame.js";
import type { ResolvedSemanticAsset } from "./page-document-semantic.js";
import {
  type AssetResolver,
  type CorePageWarning,
  type PageExtensionAssetRequest,
  type PageLimits,
  UNLOCATED_PAGE_WARNING_LOCATION,
} from "./page-document-types.js";

/**
 * One resource that did not make it into the document, named individually.
 *
 * A single aggregate "something was blocked" flag tells a caller that their document is
 * wrong but not which resource or why, and the most confusing case -- Core overruling a
 * resolver that reported success -- is invisible in it.
 *
 * The resource is identified by its `sourceIdentity` marker, never by its URL: an
 * authored URL is source content, and blocked-resource diagnostics must stay free of
 * source content and of resolver text so a document's warnings are safe to publish
 * (docs/architecture/0005-core-extension-contract.md). The `BlockedReason` brand keeps
 * the reason Core-authored by construction.
 */
export type BlockedResource = {
  readonly kind: AssetRequest["kind"];
  readonly reason: BlockedReason;
  readonly sourceIdentity: string;
};

/**
 * Ceiling on individually reported resources. A document that blocks thousands of resources
 * has one systemic cause, and the first few name it; the rest would only bury the warning
 * list. The aggregate `resourceBlocked` flag stays exact regardless of this cap.
 */
const MAX_REPORTED_BLOCKED_RESOURCES = 20;

export type ResolvedPageAssets = {
  readonly html: string;
  readonly css: readonly string[];
  readonly blobUrls: readonly string[];
  readonly resourceBlocked: boolean;
  readonly sourceIdentity: string | undefined;
  readonly blockedResources: readonly BlockedResource[];
  readonly semanticAssets: readonly ResolvedSemanticAsset[];
  revoke(): void;
};

/**
 * The `RESOURCE_BLOCKED` warnings a generation should carry for these assets.
 *
 * One warning per blocked resource, naming its kind (`property`) and why it was refused
 * (`recovery`) through the existing optional warning fields, so the shape stays
 * non-breaking; the `sourceIdentity` marker names which resource. The authored URL is
 * deliberately absent -- see `BlockedResource`. When nothing was recorded individually -- a block that predates
 * asset resolution, such as the sanitizer's -- the single aggregate warning is kept, but
 * only if an equivalent warning is not already present. The aggregate-presence guard must
 * never suppress the per-resource reports: a `javascript:` href elsewhere in the document
 * already emits this code, and that is exactly the document that needs the diagnostics.
 */
export function resourceBlockedWarnings(
  blockedResources: readonly BlockedResource[],
  fallbackSourceIdentity: string | undefined,
  hasAggregateWarning: boolean,
): readonly CorePageWarning[] {
  if (blockedResources.length > 0) {
    return blockedResources.map((resource) =>
      Object.freeze({
        code: "RESOURCE_BLOCKED" as const,
        message: `Blocked ${resource.kind}: ${resource.reason}.`,
        sourceIdentity: resource.sourceIdentity,
        location: UNLOCATED_PAGE_WARNING_LOCATION,
        property: resource.kind,
        recovery: resource.reason,
      }),
    );
  }
  if (hasAggregateWarning) return [];
  return [
    Object.freeze({
      code: "RESOURCE_BLOCKED" as const,
      message: "Resource was blocked by the loading policy.",
      sourceIdentity: fallbackSourceIdentity,
      location: UNLOCATED_PAGE_WARNING_LOCATION,
    }),
  ];
}

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

interface MemoizedResolution {
  readonly promise: Promise<AssetOutcome>;
  bytesConsumed: number;
}

/**
 * Memo key for a request whose outcome is safe to share between occurrences:
 * image, font, and media outcomes are immutable (stylesheet outcomes carry a
 * mutable postcss root that `apply` consumes, so they are never shared). The
 * key uses the absolutized URL because nested CSS occurrences of the same
 * resource carry different base URLs; a URL that cannot be absolutized is not
 * memoized and takes the per-occurrence path.
 */
function resolutionMemoKey(request: AssetRequest): string | undefined {
  if (request.kind === "stylesheet") return undefined;
  try {
    const absolute =
      request.baseUrl === undefined ? new URL(request.url) : new URL(request.url, request.baseUrl);
    return `${request.kind}\u0000${absolute.href}`;
  } catch {
    return undefined;
  }
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
  const blockedResources: BlockedResource[] = [];
  const recordBlocked = (request: AssetRequest, reason: BlockedReason | undefined): void => {
    blocked = true;
    blockedIdentity ??= request.sourceIdentity;
    if (blockedResources.length >= MAX_REPORTED_BLOCKED_RESOURCES) return;
    blockedResources.push(
      Object.freeze({
        kind: request.kind,
        reason: reason ?? BLOCKED_REASON.loadingPolicy,
        sourceIdentity: request.sourceIdentity,
      }),
    );
  };
  // Recording happens once, when the outcome loop applies the blocked outcome. A preflight
  // block must not record here as well, or a vetoed resource would be reported twice.
  const preflightBlocked = (reason: BlockedReason): AssetOutcome => ({
    status: "blocked",
    reason,
  });
  const resolutionMemo = new Map<string, MemoizedResolution>();
  const consumeBytes = (bytes: number): void => {
    if (limits?.maxAssetBytes !== undefined && assetBytes + bytes > limits.maxAssetBytes) {
      throw bytesError();
    }
    assetBytes += bytes;
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
                return Promise.resolve(preflightBlocked(BLOCKED_REASON.extensionVeto));
              }
              if (blockedScheme(request.url)) {
                return Promise.resolve(
                  preflightBlocked(
                    request.url.trim() === ""
                      ? BLOCKED_REASON.emptyUrl
                      : BLOCKED_REASON.unsafeScheme,
                  ),
                );
              }
              const remapAbort = (error: unknown): never => {
                if (operation.signal.aborted) throw abortError();
                throw error;
              };
              const memoKey = resolutionMemoKey(request);
              const memoized = memoKey === undefined ? undefined : resolutionMemo.get(memoKey);
              if (memoized !== undefined) {
                // Occurrence-level semantics stay intact on a memo hit: the
                // extension veto, scheme check, and reference/depth limits ran
                // above, and the byte accounting charges every occurrence so
                // the maxAssetBytes limit keeps its duplicate-inclusive sum.
                return memoized.promise
                  .then((outcome) => {
                    consumeBytes(memoized.bytesConsumed);
                    return outcome;
                  })
                  .catch(remapAbort);
              }
              if (memoKey === undefined) {
                return resolveOne(request, resolver, operation.signal, scope, consumeBytes).catch(
                  remapAbort,
                );
              }
              const entry: MemoizedResolution = {
                bytesConsumed: 0,
                promise: resolveOne(request, resolver, operation.signal, scope, (bytes) => {
                  entry.bytesConsumed = bytes;
                  consumeBytes(bytes);
                }),
              };
              resolutionMemo.set(memoKey, entry);
              return entry.promise.catch(remapAbort);
            }),
          )),
        );
      }
      const next: AssetRequest[] = [];
      for (const [index, request] of level.entries()) {
        const outcome = outcomes[index];
        if (outcome === undefined) continue;
        if (outcome.status === "blocked") recordBlocked(request, outcome.reason);
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
      blockedResources: Object.freeze(blockedResources),
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
