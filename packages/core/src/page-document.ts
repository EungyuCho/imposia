import { ImposiaError } from "./errors.js";
import {
  abortError,
  commitGeneration,
  destroyedError,
  FRAME_DOCUMENT,
  frameReady,
  linkSignal,
} from "./page-document-frame.js";
import { bodyText, buildGeneration, snapshotSettings } from "./page-document-generation.js";
import type {
  PageDocument,
  PageDocumentController,
  PageDocumentOptions,
  PageSource,
} from "./page-document-types.js";

interface ActiveOperation {
  id: number;
  controller: AbortController;
}

export function mountPageDocument(
  container: HTMLElement,
  source: PageSource,
  options: PageDocumentOptions = {},
): PageDocumentController {
  const settings = snapshotSettings(options);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-imposia-frame", "page-document");
  iframe.setAttribute("sandbox", "allow-same-origin");
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
            generation.pages.map(({ page, flow, blank }, index) => {
              const bounds = page.getBoundingClientRect();
              return Object.freeze({
                number: index + 1,
                side: index % 2 === 0 ? ("right" as const) : ("left" as const),
                blank,
                widthCssPx: bounds.width,
                heightCssPx: bounds.height,
                bodyText: bodyText(flow),
              });
            }),
          );
          const document: PageDocument = Object.freeze({
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
          });
          const oldBlobUrls = activeBlobUrls;
          activeBlobUrls = generation.blobUrls;
          current = document;
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
      for (const url of activeBlobUrls) URL.revokeObjectURL(url);
      activeBlobUrls = [];
      current = undefined;
      iframe.remove();
      destroyPromise = Promise.allSettled([...operations]).then(() => undefined);
      return destroyPromise;
    },
  };
}
