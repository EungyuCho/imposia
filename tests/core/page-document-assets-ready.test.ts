import { describe, expect, it } from "vitest";
import {
  type PaginationAssetDocument,
  type PaginationAssetRoot,
  settlePaginationAssets,
} from "../../packages/core/src/page-document-assets-ready.js";

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}> {
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return Object.freeze({
    promise,
    resolve() {
      resolvePromise?.();
    },
    reject(error: unknown) {
      rejectPromise?.(error);
    },
  });
}

describe("pagination asset settlement", () => {
  it("waits for mounted fonts and image decoding before pagination", async () => {
    const fonts = deferred();
    const image = deferred();
    const documentTarget: PaginationAssetDocument = { fonts: { ready: fonts.promise } };
    const root: PaginationAssetRoot = {
      images: Object.freeze([{ decode: () => image.promise }]),
    };
    let settled = false;
    const task = settlePaginationAssets(documentTarget, root, new AbortController().signal).then(
      () => {
        settled = true;
      },
    );

    await Promise.resolve();
    expect(settled).toBe(false);
    fonts.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    image.resolve();
    await task;
    expect(settled).toBe(true);
  });

  it("treats failed image decoding as a settled resource", async () => {
    const image = deferred();
    const root: PaginationAssetRoot = {
      images: Object.freeze([{ decode: () => image.promise }]),
    };
    const task = settlePaginationAssets({}, root, new AbortController().signal);
    image.reject(new Error("decode failed"));
    await expect(task).resolves.toBeUndefined();
  });

  it("aborts while a font or image remains unsettled", async () => {
    const fonts = deferred();
    const controller = new AbortController();
    const task = settlePaginationAssets(
      { fonts: { ready: fonts.promise } },
      { images: Object.freeze([]) },
      controller.signal,
    );
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
  });
});
