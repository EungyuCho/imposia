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
import {
  type BuiltWarningSourceLocation,
  bodyText,
  buildGeneration,
  snapshotSettings,
} from "./page-document-generation.js";
import {
  pageSemanticSnapshot,
  releasePageSemanticSnapshot,
  retainPageSemanticSnapshot,
} from "./page-document-semantic.js";
import type {
  CorePageWarning,
  EpubExportOptions,
  ExtensionPageWarning,
  PageDocument,
  PageDocumentController,
  PageDocumentOptions,
  PageSource,
  PageWarning,
} from "./page-document-types.js";

interface ActiveOperation {
  id: number;
  controller: AbortController;
  stagingIframe: HTMLIFrameElement;
}

const warningPublicationEntryIndexes = new WeakMap<PageDocument, ReadonlyMap<string, number>>();
const warningSourceTargets = new WeakMap<PageDocument, ReadonlyMap<string, Element>>();

export interface PageWarningTargetBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function pageWarningTargetBounds(
  pageDocument: PageDocument,
  warning: PageWarning,
): PageWarningTargetBounds | undefined {
  if (!pageDocument.warnings.includes(warning) || warning.sourceIdentity === undefined) {
    return undefined;
  }
  const target = warningSourceTargets.get(pageDocument)?.get(warning.sourceIdentity);
  const frameDocument = pageDocument.iframe.contentDocument;
  if (
    target === undefined ||
    frameDocument === null ||
    target.ownerDocument !== frameDocument ||
    !frameDocument.body.contains(target)
  ) {
    return undefined;
  }
  const bounds = target.getBoundingClientRect();
  return Object.freeze({
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
  });
}

export function warningPublicationEntryIndex(
  pageDocument: PageDocument,
  sourceIdentity: string,
): number | undefined {
  return warningPublicationEntryIndexes.get(pageDocument)?.get(sourceIdentity);
}

export function retainDerivedWarningSourceTargets(
  source: PageDocument,
  derived: PageDocument,
): void {
  const targets = warningSourceTargets.get(source);
  if (targets !== undefined) warningSourceTargets.set(derived, targets);
}

function locateWarning(
  warning: PageWarning,
  generation: number,
  sourceLocations: ReadonlyMap<string, BuiltWarningSourceLocation>,
): PageWarning {
  const sourceLocation =
    warning.sourceIdentity === undefined ? undefined : sourceLocations.get(warning.sourceIdentity);
  const location = Object.freeze({
    generation,
    entryId: warning.location.entryId,
    page: sourceLocation?.page ?? warning.location.page,
  });
  return "extension" in warning
    ? (Object.freeze({ ...warning, location }) satisfies ExtensionPageWarning)
    : (Object.freeze({ ...warning, location }) satisfies CorePageWarning);
}

function committedWarnings(
  warnings: readonly PageWarning[],
  generation: number,
  sourceLocations: ReadonlyMap<string, BuiltWarningSourceLocation>,
): readonly PageWarning[] {
  return Object.freeze(
    warnings.map((warning) => locateWarning(warning, generation, sourceLocations)),
  );
}

function retainWarningEntryIndexes(
  pageDocument: PageDocument,
  sourceLocations: ReadonlyMap<string, BuiltWarningSourceLocation>,
): void {
  const warningSourceIdentities = new Set(
    pageDocument.warnings.flatMap((warning) =>
      warning.sourceIdentity === undefined ? [] : [warning.sourceIdentity],
    ),
  );
  const entryIndexes = new Map<string, number>();
  const sourceTargets = new Map<string, Element>();
  for (const [sourceIdentity, location] of sourceLocations) {
    if (!warningSourceIdentities.has(sourceIdentity)) continue;
    sourceTargets.set(sourceIdentity, location.target);
    if (location.publicationEntryIndex !== undefined) {
      entryIndexes.set(sourceIdentity, location.publicationEntryIndex);
    }
  }
  warningPublicationEntryIndexes.set(pageDocument, entryIndexes);
  warningSourceTargets.set(pageDocument, sourceTargets);
}

type PageDocumentEpubExporter = (
  pageDocument: PageDocument,
  options: EpubExportOptions,
) => Promise<Blob>;

function createStagingIframe(
  container: HTMLElement,
  canonicalIframe: HTMLIFrameElement,
): HTMLIFrameElement {
  const stagingIframe = document.createElement("iframe");
  stagingIframe.setAttribute("data-imposia-frame", "page-document-staging");
  stagingIframe.setAttribute("sandbox", PAGE_DOCUMENT_FRAME_SANDBOX.join(" "));
  stagingIframe.setAttribute("aria-hidden", "true");
  stagingIframe.tabIndex = -1;
  stagingIframe.srcdoc = FRAME_DOCUMENT;
  stagingIframe.style.position = "fixed";
  stagingIframe.style.inset = "0 auto auto -100000px";
  stagingIframe.style.width = `${Math.max(canonicalIframe.clientWidth, 300)}px`;
  stagingIframe.style.height = `${Math.max(canonicalIframe.clientHeight, 150)}px`;
  stagingIframe.style.visibility = "hidden";
  stagingIframe.style.pointerEvents = "none";
  stagingIframe.style.border = "0";
  container.append(stagingIframe);
  return stagingIframe;
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

function createPageDocumentController(
  container: HTMLElement,
  source: PageSource,
  options: PageDocumentOptions,
  finalizeCommit?: (
    document: PageDocument,
    source: PageSource,
  ) => PageDocumentEpubExporter | undefined,
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
  const epubExporters = new WeakMap<PageDocument, PageDocumentEpubExporter>();
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
        const exporter = epubExporters.get(committed) ?? exportPageDocumentEpub;
        return await exporter(committed, {
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
    active?.stagingIframe.remove();
    const id = operationId + 1;
    operationId = id;
    const controller = new AbortController();
    const stagingIframe = createStagingIframe(container, iframe);
    const unlink = linkSignal(callerSignal, controller);
    const startedAt = performance.now();
    const operation = Promise.resolve().then(async () => {
      let deadlineExceeded = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        if (controller.signal.aborted) throw abortError();
        const [frameDocument, stagingDocument] = await Promise.all([
          frameReady(iframe, controller.signal),
          frameReady(stagingIframe, controller.signal),
        ]);
        if (controller.signal.aborted || destroyed || id !== operationId) throw abortError();
        deadline = setTimeout(() => {
          deadlineExceeded = true;
          controller.abort();
        }, settings.limits.resourceDeadlineMs);
        const generation = await buildGeneration(
          stagingDocument,
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
          const previousHead = [...frameDocument.head.childNodes];
          const previousBody = [...frameDocument.body.childNodes];
          const previousDocumentLanguage = frameDocument.documentElement.getAttribute("lang");
          let canonicalReplaced = false;
          commitGeneration(
            frameDocument,
            generation.body,
            generation.css,
            generation.documentLanguage,
          );
          canonicalReplaced = true;
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
          const documentGeneration = (current?.generation ?? 0) + 1;
          let committedDocument: PageDocument | undefined;
          const document = Object.freeze({
            iframe,
            generation: documentGeneration,
            pageCount: pages.length,
            pages,
            warnings: committedWarnings(
              generation.warnings,
              documentGeneration,
              generation.warningSourceLocations,
            ),
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
          retainWarningEntryIndexes(document, generation.warningSourceLocations);
          let semanticRetained = false;
          try {
            retainPageSemanticSnapshot(document, generation.semanticSnapshot);
            semanticRetained = true;
            const epubExporter = finalizeCommit?.(document, nextSource);
            if (epubExporter !== undefined) epubExporters.set(document, epubExporter);
            const oldBlobUrls = activeBlobUrls;
            const previous = current;
            activeBlobUrls = generation.blobUrls;
            current = document;
            if (previous !== undefined) releaseSnapshot(previous);
            committed = true;
            for (const url of oldBlobUrls) URL.revokeObjectURL(url);
            return document;
          } catch (error: unknown) {
            if (semanticRetained) releasePageSemanticSnapshot(document);
            if (canonicalReplaced) {
              frameDocument.head.replaceChildren(...previousHead);
              frameDocument.body.replaceChildren(...previousBody);
              if (previousDocumentLanguage === null) {
                frameDocument.documentElement.removeAttribute("lang");
              } else {
                frameDocument.documentElement.lang = previousDocumentLanguage;
              }
            }
            throw error;
          }
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
        stagingIframe.remove();
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
    active = { id, controller, stagingIframe };
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
      active?.stagingIframe.remove();
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

export function mountPageDocument(
  container: HTMLElement,
  source: PageSource,
  options: PageDocumentOptions = {},
): PageDocumentController {
  return createPageDocumentController(container, source, options);
}

export function mountPageDocumentWithFinalizer(
  container: HTMLElement,
  source: PageSource,
  options: PageDocumentOptions,
  finalizeCommit: (
    document: PageDocument,
    source: PageSource,
  ) => PageDocumentEpubExporter | undefined,
): PageDocumentController {
  return createPageDocumentController(container, source, options, finalizeCommit);
}
