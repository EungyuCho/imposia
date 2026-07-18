import type { PageDocument } from "./page-document-types.js";

export type SemanticAssetKind = "font" | "image" | "media" | "stylesheet";

export interface ResolvedSemanticAsset {
  readonly kind: SemanticAssetKind;
  readonly authoredUrl: string;
  readonly sourceIdentity: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly blobUrl?: string;
  readonly resolvedUrl?: string;
}

export interface PageSemanticAsset {
  readonly kind: SemanticAssetKind;
  readonly authoredUrl: string;
  readonly sourceIdentity: string;
  readonly mimeType: string;
  readonly bytes: Blob;
  readonly blobUrl?: string;
  readonly resolvedUrl?: string;
}

export interface PageSemanticSnapshot {
  readonly html: string;
  readonly css: readonly string[];
  readonly baseUrl: string | undefined;
  readonly assets: readonly PageSemanticAsset[];
}

const SEMANTIC_SNAPSHOT_REGISTRY = Symbol.for("@imposia/core/semantic-snapshot-registry");
type SemanticSnapshotGlobal = typeof globalThis & {
  [SEMANTIC_SNAPSHOT_REGISTRY]?: WeakMap<PageDocument, PageSemanticSnapshot>;
};
const semanticSnapshotGlobal = globalThis as SemanticSnapshotGlobal;
const semanticSnapshots =
  semanticSnapshotGlobal[SEMANTIC_SNAPSHOT_REGISTRY] ??
  new WeakMap<PageDocument, PageSemanticSnapshot>();
semanticSnapshotGlobal[SEMANTIC_SNAPSHOT_REGISTRY] = semanticSnapshots;

export function createPageSemanticSnapshot(input: {
  readonly html: string;
  readonly css: readonly string[];
  readonly baseUrl: string | undefined;
  readonly assets: readonly ResolvedSemanticAsset[];
}): PageSemanticSnapshot {
  const assets = input.assets.map((asset) => {
    const bytes = asset.bytes.buffer.slice(
      asset.bytes.byteOffset,
      asset.bytes.byteOffset + asset.bytes.byteLength,
    ) as ArrayBuffer;
    return Object.freeze({
      kind: asset.kind,
      authoredUrl: asset.authoredUrl,
      sourceIdentity: asset.sourceIdentity,
      mimeType: asset.mimeType,
      bytes: new Blob([bytes], { type: asset.mimeType }),
      ...(asset.blobUrl === undefined ? {} : { blobUrl: asset.blobUrl }),
      ...(asset.resolvedUrl === undefined ? {} : { resolvedUrl: asset.resolvedUrl }),
    });
  });
  return Object.freeze({
    html: input.html,
    css: Object.freeze([...input.css]),
    baseUrl: input.baseUrl,
    assets: Object.freeze(assets),
  });
}

export function retainPageSemanticSnapshot(
  pageDocument: PageDocument,
  snapshot: PageSemanticSnapshot,
): void {
  semanticSnapshots.set(pageDocument, snapshot);
}

export function pageSemanticSnapshot(pageDocument: PageDocument): PageSemanticSnapshot | undefined {
  return semanticSnapshots.get(pageDocument);
}

export function releasePageSemanticSnapshot(pageDocument: PageDocument): void {
  semanticSnapshots.delete(pageDocument);
}
