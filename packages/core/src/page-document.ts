import { exportPageDocumentEpub } from "./epub-export.js";
import { ImposiaError } from "./errors.js";
import {
  abortError,
  commitGeneration,
  destroyedError,
  FRAME_DOCUMENT,
  frameReady,
  linkSignal,
  PAGE_DOCUMENT_FRAME_SANDBOX,
} from "./page-document-frame.js";
import { bodyText, buildGeneration, snapshotSettings } from "./page-document-generation.js";
import {
  pageSemanticSnapshot,
  releasePageSemanticSnapshot,
  retainPageSemanticSnapshot,
} from "./page-document-semantic.js";
import type {
  EpubExportOptions,
  PageDocument,
  PageDocumentController,
  PageDocumentOptions,
  PageSource,
} from "./page-document-types.js";

interface ActiveOperation {
  id: number;
  controller: AbortController;
}

function exportSignal(value: unknown): AbortSignal | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const signal = (value as Readonly<Record<string, unknown>>).signal;
  return signal instanceof AbortSignal ? signal : undefined;
}

function awaitWithAbort<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return work;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

export function mountPageDocument(
  container: HTMLElement,
  source: PageSource,
  options: PageDocumentOptions = {},
): PageDocumentController {
  const settings = snapshotSettings(options);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-imposia-frame", "page-document");
  iframe.setAttribute("sandbox", PAGE_DOCUMENT_FRAME_SANDBOX.join(" "));
  iframe.srcdoc = FRAME_DOCUMENT;
  container.append(iframe);

  let current: PageDocument | undefined;
  let destroyed = false;
  let destroyPromise: Promise<void> | undefined;
  let operationId = 0;
  let active: ActiveOperation | undefined;
  let activeBlobUrls: readonly string[] = [];
  let latestWork: Promise<PageDocument> | undefined;
  const operations = new Set<Promise<PageDocument>>();
  const exportControllers = new Set<AbortController>();
  const exportOperations = new Set<Promise<Blob>>();
  const exportLeases = new Map<PageDocument, number>();
  const deferredSnapshotReleases = new Set<PageDocument>();

  const releaseSnapshot = (pageDocument: PageDocument): void => {
    if ((exportLeases.get(pageDocument) ?? 0) > 0) {
      deferredSnapshotReleases.add(pageDocument);
      return;
    }
    releasePageSemanticSnapshot(pageDocument);
  };

  const retainExportSnapshot = (pageDocument: PageDocument): boolean => {
    if (pageSemanticSnapshot(pageDocument) === undefined) return false;
    exportLeases.set(pageDocument, (exportLeases.get(pageDocument) ?? 0) + 1);
    return true;
  };

  const releaseExportSnapshot = (pageDocument: PageDocument): void => {
    const count = exportLeases.get(pageDocument) ?? 0;
    if (count > 1) {
      exportLeases.set(pageDocument, count - 1);
      return;
    }
    exportLeases.delete(pageDocument);
    if (deferredSnapshotReleases.delete(pageDocument)) {
      releasePageSemanticSnapshot(pageDocument);
    }
  };

  const latestCommitted = async (signal: AbortSignal | undefined): Promise<PageDocument> => {
    if (signal?.aborted) throw abortError();
    let observedWork: Promise<PageDocument> | undefined;
    while (true) {
      if (destroyed) throw destroyedError();
      observedWork = latestWork;
      if (observedWork !== undefined) {
        try {
          await awaitWithAbort(observedWork, signal);
        } catch (error: unknown) {
          if (destroyed) throw destroyedError();
          if (signal?.aborted) throw abortError();
          if (latestWork !== observedWork) continue;
          if (current === undefined) throw error;
        }
      }
      if (destroyed) throw destroyedError();
      if (signal?.aborted) throw abortError();
      if (latestWork !== observedWork) continue;
      const committed = current;
      if (committed === undefined) throw new Error("Page document is not ready.");
      return committed;
    }
  };

  const exportLatestEpub = (options: EpubExportOptions): Promise<Blob> => {
    const controller = new AbortController();
    const unlink = linkSignal(exportSignal(options), controller);
    const operation = Promise.resolve().then(async () => {
      const committed = await latestCommitted(controller.signal);
      const retained = retainExportSnapshot(committed);
      try {
        return await exportPageDocumentEpub(committed, {
          ...options,
          signal: controller.signal,
        });
      } finally {
        if (retained) releaseExportSnapshot(committed);
      }
    });
    let tracked: Promise<Blob>;
    tracked = operation.then(
      (result) => {
        unlink();
        exportControllers.delete(controller);
        exportOperations.delete(tracked);
        return result;
      },
      (error: unknown) => {
        unlink();
        exportControllers.delete(controller);
        exportOperations.delete(tracked);
        throw error;
      },
    );
    exportControllers.add(controller);
    exportOperations.add(tracked);
    return tracked;
  };

  const begin = (nextSource: PageSource, callerSignal: AbortSignal | undefined) => {
    if (destroyed) return Promise.reject(destroyedError());
    active?.controller.abort();
    const id = operationId + 1;
    operationId = id;
    const controller = new AbortController();
    const unlink = linkSignal(callerSignal, controller);
    const startedAt = performance.now();
    const operation = Promise.resolve().then(async () => {
      let deadlineExceeded = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        if (controller.signal.aborted) throw abortError();
        const frameDocument = await frameReady(iframe, controller.signal);
        if (controller.signal.aborted || destroyed || id !== operationId) throw abortError();
        deadline = setTimeout(() => {
          deadlineExceeded = true;
          controller.abort();
        }, settings.limits.resourceDeadlineMs);
        const generation = await buildGeneration(
          frameDocument,
          nextSource,
          settings,
          controller.signal,
        );
        const commitStartedAt = performance.now();
        let committed = false;
        try {
          if (controller.signal.aborted || destroyed || id !== operationId) throw abortError();
          for (let index = 0; index < generation.pages.length; index += 1) {
            settings.onProgress?.({ completedPages: index + 1 });
            if (controller.signal.aborted || destroyed || id !== operationId) throw abortError();
          }
          commitGeneration(frameDocument, generation.body, generation.css);
          const pages = Object.freeze(
            generation.pages.map(({ flow, blank, name, geometry }, index) => {
              const side = index % 2 === 0 ? ("right" as const) : ("left" as const);
              const context = Object.freeze({ side, name, blank });
              return Object.freeze({
                number: index + 1,
                side,
                name,
                blank,
                context,
                geometry,
                widthCssPx: geometry.sheetWidthCssPx,
                heightCssPx: geometry.sheetHeightCssPx,
                bodyText: bodyText(flow),
              });
            }),
          );
          let committedDocument: PageDocument | undefined;
          const document = Object.freeze({
            iframe,
            generation: (current?.generation ?? 0) + 1,
            pageCount: pages.length,
            pages,
            warnings: generation.warnings,
            timings: Object.freeze({
              totalMs: performance.now() - startedAt,
              resourceMs: generation.timings.resourceMs,
              paginationMs: generation.timings.paginationMs + performance.now() - commitStartedAt,
            }),
            exportEpub(exportOptions: EpubExportOptions) {
              if (committedDocument === undefined) {
                return Promise.reject(new Error("Page document is not ready."));
              }
              return exportLatestEpub(exportOptions);
            },
          }) satisfies PageDocument;
          committedDocument = document;
          const oldBlobUrls = activeBlobUrls;
          const previous = current;
          activeBlobUrls = generation.blobUrls;
          current = document;
          retainPageSemanticSnapshot(document, generation.semanticSnapshot);
          if (previous !== undefined) releaseSnapshot(previous);
          committed = true;
          for (const url of oldBlobUrls) URL.revokeObjectURL(url);
          return document;
        } finally {
          if (!committed) generation.revoke();
        }
      } catch (error: unknown) {
        if (deadlineExceeded) {
          throw new ImposiaError("RESOURCE_TIMEOUT", "Resource loading timed out.");
        }
        throw error;
      } finally {
        if (deadline !== undefined) clearTimeout(deadline);
      }
    });
    let tracked: Promise<PageDocument>;
    tracked = operation.then(
      (result) => {
        unlink();
        operations.delete(tracked);
        if (active?.id === id) active = undefined;
        return result;
      },
      (error: unknown) => {
        unlink();
        operations.delete(tracked);
        if (active?.id === id) active = undefined;
        throw error;
      },
    );
    operations.add(tracked);
    active = { id, controller };
    latestWork = tracked;
    return tracked;
  };

  const ready = begin(source, options.signal);
  return {
    ready,
    get current() {
      return current;
    },
    update(nextSource, updateOptions = {}) {
      return begin(nextSource, updateOptions.signal);
    },
    async print() {
      if (destroyed) throw destroyedError();
      let observedWork: Promise<PageDocument> | undefined;
      while (true) {
        if (destroyed) throw destroyedError();
        observedWork = latestWork;
        if (observedWork !== undefined) {
          try {
            await observedWork;
          } catch (error: unknown) {
            if (destroyed) throw destroyedError();
            if (latestWork !== observedWork) continue;
            if (current === undefined) throw error;
          }
        }
        if (destroyed) throw destroyedError();
        if (latestWork !== observedWork) continue;
        const printable = current;
        if (printable === undefined) throw new Error("Page document is not ready.");
        printable.iframe.contentWindow?.print();
        return;
      }
    },
    destroy() {
      if (destroyPromise !== undefined) return destroyPromise;
      destroyed = true;
      active?.controller.abort();
      for (const controller of exportControllers) controller.abort();
      for (const url of activeBlobUrls) URL.revokeObjectURL(url);
      activeBlobUrls = [];
      if (current !== undefined) releaseSnapshot(current);
      current = undefined;
      iframe.remove();
      destroyPromise = Promise.allSettled([...operations, ...exportOperations]).then(
        () => undefined,
      );
      return destroyPromise;
    },
  };
}
