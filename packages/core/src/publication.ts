import { exportPublicationEpub } from "./epub-export.js";
import { ImposiaError } from "./errors.js";
import {
  mountPageDocumentWithFinalizer,
  retainDerivedWarningSourceTargets,
  warningPublicationEntryIndex,
} from "./page-document.js";
import { snapshotExtensions, validateExtensions } from "./page-document-extensions.js";
import type { PageDocument, PageSource, PageWarning } from "./page-document-types.js";
import {
  committedPublicationOutline,
  moveToPublicationDestination,
  PUBLICATION_ENTRY_MARKER,
  resolvePublicationDestination,
} from "./publication-outline.js";
import {
  createPublicationSearchIndex,
  nextPublicationSearchScope,
  type PublicationSearchIndex,
} from "./publication-search.js";
import {
  type PreparedPublicationSnapshot,
  preparePublicationSnapshot,
} from "./publication-source.js";
import type {
  CommittedPublicationEntry,
  PublicationController,
  PublicationDestination,
  PublicationDocument,
  PublicationOptions,
  PublicationPageRange,
  PublicationSnapshot,
} from "./publication-types.js";

const NON_CONTENT_ELEMENTS = new Set(["link", "script", "style", "template"]);
const VISUAL_ELEMENTS = new Set(["audio", "canvas", "hr", "img", "input", "math", "svg", "video"]);

function containsEntryContent(element: Element): boolean {
  if (NON_CONTENT_ELEMENTS.has(element.localName.toLowerCase())) return false;
  if (VISUAL_ELEMENTS.has(element.localName.toLowerCase())) return true;
  return [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
  );
}

function entryPageRange(pageDocument: PageDocument, entryIndex: number): PublicationPageRange {
  const frameDocument = pageDocument.iframe.contentDocument;
  const fallback = () => Object.freeze({ start: 1, end: pageDocument.pageCount });
  if (frameDocument === null) return fallback();
  const selector = `[${PUBLICATION_ENTRY_MARKER}="${entryIndex}"]`;
  const contentPages: number[] = [];
  const fallbackPages: number[] = [];
  for (const page of frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")) {
    const number = Number(page.getAttribute("data-imposia-page-number"));
    const markers = [...page.querySelectorAll(selector)];
    if (markers.length > 0) fallbackPages.push(number);
    if (markers.some(containsEntryContent)) contentPages.push(number);
  }
  const occupied = contentPages.length > 0 ? contentPages : fallbackPages;
  const start = occupied[0];
  const end = occupied.at(-1);
  if (start === undefined || end === undefined) return fallback();
  return Object.freeze({ start, end });
}

function publicationWarning(
  pageDocument: PageDocument,
  warning: PageWarning,
  snapshot: PreparedPublicationSnapshot,
): PageWarning {
  const entryIndex =
    warning.sourceIdentity === undefined
      ? undefined
      : warningPublicationEntryIndex(pageDocument, warning.sourceIdentity);
  const entryId = entryIndex === undefined ? undefined : snapshot.entries[entryIndex]?.id;
  if (entryId === undefined) return warning;
  return Object.freeze({
    ...warning,
    location: Object.freeze({ ...warning.location, entryId }),
  });
}

function publicationDocument(
  pageDocument: PageDocument,
  snapshot: PreparedPublicationSnapshot,
): PublicationDocument {
  const entries: readonly CommittedPublicationEntry[] = Object.freeze(
    snapshot.entries.map((entry, index) =>
      Object.freeze({ ...entry, pageRange: entryPageRange(pageDocument, index) }),
    ),
  );
  const warnings = Object.freeze(
    pageDocument.warnings.map((warning) => publicationWarning(pageDocument, warning, snapshot)),
  );
  const publication = Object.freeze({
    ...pageDocument,
    warnings,
    metadata: snapshot.metadata,
    entries,
    outline: committedPublicationOutline(pageDocument, entries),
  });
  retainDerivedWarningSourceTargets(pageDocument, publication);
  return publication;
}

export function mountPublication(
  container: HTMLElement,
  snapshot: PublicationSnapshot,
  options: PublicationOptions = {},
): PublicationController {
  let extensions: ReturnType<typeof validateExtensions>;
  try {
    extensions = validateExtensions(snapshotExtensions(options.extensions));
  } catch (error: unknown) {
    throw new ImposiaError(
      "INVALID_PUBLICATION",
      error instanceof Error ? error.message : "Publication extensions are invalid.",
    );
  }
  if (extensions.some((extension) => extension.transform !== undefined)) {
    throw new ImposiaError(
      "INVALID_PUBLICATION",
      "Publication extensions must use transformEntry instead of transform.",
    );
  }
  const prepared = preparePublicationSnapshot(snapshot);
  const searchScope = nextPublicationSearchScope();
  const snapshots = new WeakMap<PageSource, PreparedPublicationSnapshot>();
  const publications = new WeakMap<PageDocument, PublicationDocument>();
  const searchIndexes = new WeakMap<PageDocument, PublicationSearchIndex>();
  snapshots.set(prepared.source, prepared);
  const pageController = mountPageDocumentWithFinalizer(
    container,
    prepared.source,
    options,
    (pageDocument, source) => {
      const nextSnapshot = snapshots.get(source);
      if (nextSnapshot === undefined) {
        throw new ImposiaError(
          "INVALID_PUBLICATION",
          "The staged Publication snapshot is unavailable.",
        );
      }
      const publication = publicationDocument(pageDocument, nextSnapshot);
      publications.set(pageDocument, publication);
      searchIndexes.set(
        pageDocument,
        createPublicationSearchIndex(pageDocument, publication.entries, searchScope),
      );
      return (committed, exportOptions) =>
        exportPublicationEpub(committed, publication.entries, publication.outline, exportOptions);
    },
  );
  const committedPublication = (pageDocument: PageDocument): PublicationDocument => {
    const publication = publications.get(pageDocument);
    if (publication === undefined) {
      throw new ImposiaError(
        "INVALID_PUBLICATION",
        "The committed Publication snapshot is unavailable.",
      );
    }
    return publication;
  };
  const ready = pageController.ready.then(committedPublication);
  const currentPublication = (): PublicationDocument | undefined => {
    const pageDocument = pageController.current;
    return pageDocument === undefined ? undefined : publications.get(pageDocument);
  };
  const currentDestination = (id: string): PublicationDestination | undefined => {
    const publication = currentPublication();
    return publication === undefined
      ? undefined
      : (resolvePublicationDestination(publication.outline, id) ??
          (pageController.current === undefined
            ? undefined
            : searchIndexes.get(pageController.current)?.resolveDestination(id)));
  };
  return {
    ready,
    get current() {
      return currentPublication();
    },
    resolveDestination: currentDestination,
    search(query) {
      const pageDocument = pageController.current;
      return pageDocument === undefined
        ? Object.freeze([])
        : (searchIndexes.get(pageDocument)?.search(query) ?? Object.freeze([]));
    },
    navigate(destination) {
      const resolved = currentDestination(destination.id);
      if (
        resolved === undefined ||
        resolved.entryId !== destination.entryId ||
        resolved.page !== destination.page ||
        resolved.generation !== destination.generation ||
        pageController.current === undefined
      ) {
        throw new ImposiaError(
          "STALE_PUBLICATION_DESTINATION",
          "The Publication destination does not belong to the current committed generation.",
        );
      }
      if (
        !moveToPublicationDestination(pageController.current, resolved) &&
        !searchIndexes.get(pageController.current)?.navigate(resolved)
      ) {
        throw new ImposiaError(
          "PUBLICATION_DESTINATION_NOT_FOUND",
          "The current committed Publication destination could not be located.",
        );
      }
    },
    update(nextSnapshot, updateOptions = {}) {
      let nextPrepared: PreparedPublicationSnapshot;
      try {
        nextPrepared = preparePublicationSnapshot(nextSnapshot);
      } catch (error: unknown) {
        return Promise.reject(error);
      }
      snapshots.set(nextPrepared.source, nextPrepared);
      return pageController.update(nextPrepared.source, updateOptions).then(committedPublication);
    },
    print: () => pageController.print(),
    destroy: () => pageController.destroy(),
  };
}
