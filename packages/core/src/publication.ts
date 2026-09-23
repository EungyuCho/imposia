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

function entryPageRanges(
  pageDocument: PageDocument,
  entryCount: number,
): (entry: number) => PublicationPageRange {
  const fallback = Object.freeze({ start: 1, end: pageDocument.pageCount });
  const frameDocument = pageDocument.iframe.contentDocument;
  if (frameDocument === null) return () => fallback;
  // One pass over the committed pages. Pages are visited in ascending order,
  // so the first and last page recorded for an entry are its range bounds.
  const contentPages = new Map<number, { start: number; end: number }>();
  const markerPages = new Map<number, { start: number; end: number }>();
  const record = (ranges: typeof contentPages, entry: number, page: number) => {
    const range = ranges.get(entry);
    if (range === undefined) ranges.set(entry, { start: page, end: page });
    else range.end = page;
  };
  for (const page of frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")) {
    const number = Number(page.getAttribute("data-imposia-page-number"));
    const seenMarker = new Set<number>();
    const seenContent = new Set<number>();
    for (const marker of page.querySelectorAll(`[${PUBLICATION_ENTRY_MARKER}]`)) {
      const entry = Number(marker.getAttribute(PUBLICATION_ENTRY_MARKER));
      if (!Number.isInteger(entry) || entry < 0 || entry >= entryCount) continue;
      if (!seenMarker.has(entry)) {
        seenMarker.add(entry);
        record(markerPages, entry, number);
      }
      if (!seenContent.has(entry) && containsEntryContent(marker)) {
        seenContent.add(entry);
        record(contentPages, entry, number);
      }
    }
  }
  return (entry) => {
    const range = contentPages.get(entry) ?? markerPages.get(entry);
    return range === undefined ? fallback : Object.freeze({ ...range });
  };
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
  const pageRange = entryPageRanges(pageDocument, snapshot.entries.length);
  const entries: readonly CommittedPublicationEntry[] = Object.freeze(
    snapshot.entries.map((entry, index) =>
      Object.freeze({ ...entry, pageRange: pageRange(index) }),
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
  // Search indexes are built on first use: reading every committed page's text
  // and computed styles costs tens of milliseconds on large Publications, and
  // most commits are never searched.
  const searchIndexes = new WeakMap<PageDocument, () => PublicationSearchIndex>();
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
      let searchIndex: PublicationSearchIndex | undefined;
      searchIndexes.set(pageDocument, () => {
        searchIndex ??= createPublicationSearchIndex(
          pageDocument,
          publication.entries,
          searchScope,
        );
        return searchIndex;
      });
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
            : searchIndexes.get(pageController.current)?.().resolveDestination(id)));
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
        : (searchIndexes.get(pageDocument)?.().search(query) ?? Object.freeze([]));
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
        !searchIndexes.get(pageController.current)?.().navigate(resolved)
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
