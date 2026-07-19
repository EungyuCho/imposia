import type { PageDocument, PublicationDestination, PublicationDocument } from "@imposia/core";
import {
  restorePublicationDeepLink,
  serializePublicationDeepLink,
} from "./publication-deep-link.js";
import { createPublicationSearch } from "./publication-search.js";
import { createPublicationThumbnails } from "./publication-thumbnails.js";
import { createPublicationToc } from "./publication-toc.js";
import type { MountedViewerInspector } from "./viewer-inspector.js";
import type {
  PublicationReaderController,
  PublicationReaderOptions,
  PublicationReaderState,
} from "./viewer-types.js";

export interface MountedPublicationReader extends PublicationReaderController {
  refresh(pageDocument: PageDocument): void;
  syncPage(page: number): void;
  destroy(): void;
}

export function validatePublicationReaderDocument(
  pageDocument: PageDocument,
  options: PublicationReaderOptions,
): PublicationDocument {
  if (!("outline" in pageDocument) || !("entries" in pageDocument)) {
    throw new TypeError("Publication reader requires a PublicationDocument.");
  }
  if (options.controller.current !== pageDocument) {
    throw new Error("Publication reader controller must own the mounted PublicationDocument.");
  }
  return pageDocument as PublicationDocument;
}

export function mountPublicationReader(
  root: HTMLElement,
  toolbar: HTMLElement,
  iframe: HTMLIFrameElement,
  pageDocument: PageDocument,
  options: PublicationReaderOptions,
  goToPage: (page: number) => void,
  inspector?: MountedViewerInspector,
): MountedPublicationReader {
  let currentDocument = validatePublicationReaderDocument(pageDocument, options);
  let destroyed = false;
  let destination: PublicationDestination | undefined;
  let deepLink: string | undefined;
  const toc = createPublicationToc(toolbar, root, iframe, navigate);
  toc.setOutline(currentDocument.outline);
  const search = createPublicationSearch(
    toolbar,
    root,
    iframe,
    (query) => options.controller.search(query),
    (result) => navigate(result.destination),
  );
  const thumbnails = createPublicationThumbnails(
    toolbar,
    root,
    iframe,
    currentDocument,
    selectThumbnail,
  );
  toc.opener.after(search.opener);
  search.opener.after(thumbnails.opener);
  if (inspector !== undefined) thumbnails.opener.after(inspector.opener);

  function onTocToggle(): void {
    if (toc.openState) {
      search.close();
      thumbnails.close();
      inspector?.close();
    }
  }

  function onSearchToggle(): void {
    if (search.openState) {
      toc.close();
      thumbnails.close();
      inspector?.close();
    }
  }

  function onThumbnailsToggle(): void {
    if (thumbnails.openState) {
      toc.close();
      search.close();
      inspector?.close();
    }
  }

  function onInspectorOpen(): void {
    toc.close();
    search.close();
    thumbnails.close();
  }

  toc.opener.addEventListener("click", onTocToggle);
  search.opener.addEventListener("click", onSearchToggle);
  thumbnails.opener.addEventListener("click", onThumbnailsToggle);
  inspector?.setOnOpen(onInspectorOpen);

  function assertActive(): void {
    if (destroyed) throw new Error("Publication reader has been destroyed.");
  }

  function navigate(next: PublicationDestination): void {
    assertActive();
    options.controller.navigate(next);
    goToPage(next.page);
    destination = next;
    deepLink = serializePublicationDeepLink(next);
    toc.close();
    thumbnails.close();
    inspector?.close();
    iframe.focus();
    options.onDeepLinkChange?.(deepLink);
  }

  function restore(value: string): PublicationDestination | undefined {
    assertActive();
    const resolved = restorePublicationDeepLink(value, options.controller);
    if (resolved !== undefined) navigate(resolved);
    return resolved;
  }

  function selectThumbnail(next: import("./viewer-types.js").PublicationThumbnail): void {
    assertActive();
    if (!thumbnails.thumbnails.includes(next)) {
      throw new Error("Publication thumbnail does not belong to the current committed generation.");
    }
    const hadDeepLink = deepLink !== undefined;
    destination = undefined;
    deepLink = undefined;
    goToPage(next.page);
    thumbnails.setCurrentPage(next.page);
    thumbnails.close();
    toc.close();
    search.close();
    inspector?.close();
    iframe.focus();
    if (hadDeepLink) options.onDeepLinkChange?.(undefined);
  }

  const reader: MountedPublicationReader = {
    openTableOfContents() {
      assertActive();
      search.close();
      thumbnails.close();
      inspector?.close();
      toc.open();
    },
    closeTableOfContents() {
      assertActive();
      toc.close({ restoreFocus: true });
    },
    toggleTableOfContents() {
      assertActive();
      if (!toc.openState) {
        search.close();
        thumbnails.close();
        inspector?.close();
      }
      toc.toggle();
    },
    openThumbnails() {
      assertActive();
      toc.close();
      search.close();
      inspector?.close();
      thumbnails.open();
    },
    closeThumbnails() {
      assertActive();
      thumbnails.close({ restoreFocus: true });
    },
    toggleThumbnails() {
      assertActive();
      if (!thumbnails.openState) {
        toc.close();
        search.close();
        inspector?.close();
      }
      thumbnails.toggle();
    },
    selectThumbnail,
    openSearch() {
      assertActive();
      toc.close();
      thumbnails.close();
      inspector?.close();
      search.open();
    },
    closeSearch() {
      assertActive();
      search.close({ restoreFocus: true });
    },
    toggleSearch() {
      assertActive();
      if (!search.openState) {
        toc.close();
        thumbnails.close();
        inspector?.close();
      }
      search.toggle();
    },
    search(query) {
      assertActive();
      return search.search(query);
    },
    nextSearchResult() {
      assertActive();
      return search.next();
    },
    previousSearchResult() {
      assertActive();
      return search.previous();
    },
    selectSearchResult(result) {
      assertActive();
      search.select(result);
    },
    navigate,
    restoreDeepLink: restore,
    refresh(nextDocument) {
      assertActive();
      currentDocument = validatePublicationReaderDocument(nextDocument, options);
      toc.setOutline(currentDocument.outline);
      thumbnails.setDocument(currentDocument);
      search.refresh();
      if (destination !== undefined) {
        const previousDeepLink = deepLink;
        destination = options.controller.resolveDestination(destination.id);
        deepLink =
          destination === undefined ? undefined : serializePublicationDeepLink(destination);
        if (previousDeepLink !== undefined && deepLink === undefined) {
          options.onDeepLinkChange?.(undefined);
        }
      }
    },
    syncPage(page) {
      assertActive();
      thumbnails.setCurrentPage(page);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      destination = undefined;
      deepLink = undefined;
      toc.opener.removeEventListener("click", onTocToggle);
      search.opener.removeEventListener("click", onSearchToggle);
      thumbnails.opener.removeEventListener("click", onThumbnailsToggle);
      inspector?.setOnOpen(undefined);
      thumbnails.destroy();
      search.destroy();
      toc.destroy();
    },
    get state(): PublicationReaderState {
      return {
        tocOpen: destroyed ? false : toc.openState,
        thumbnailsOpen: destroyed ? false : thumbnails.openState,
        thumbnails: thumbnails.thumbnails,
        destination,
        deepLink,
        searchOpen: destroyed ? false : search.openState,
        searchQuery: search.query,
        searchResults: search.results,
        searchResultIndex: search.resultIndex,
      };
    },
  };
  try {
    if (options.initialDeepLink !== undefined) restore(options.initialDeepLink);
  } catch (error: unknown) {
    destroyed = true;
    toc.opener.removeEventListener("click", onTocToggle);
    search.opener.removeEventListener("click", onSearchToggle);
    thumbnails.opener.removeEventListener("click", onThumbnailsToggle);
    inspector?.setOnOpen(undefined);
    thumbnails.destroy();
    search.destroy();
    toc.destroy();
    throw error;
  }
  return reader;
}
