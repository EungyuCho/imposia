import type {
  PageDocument,
  PageDocumentOptions,
  PublicationExtension,
} from "./page-document-types.js";

export interface PublicationMetadata {
  readonly title: string;
  readonly language?: string;
  readonly identifier?: string;
}

export type PublicationEntrySource = Readonly<
  {
    id: string;
    title: string;
    baseUrl?: string;
  } & ({ html: string; lightDom?: never } | { html?: never; lightDom: Element | DocumentFragment })
>;

export interface PublicationSnapshot {
  readonly metadata: PublicationMetadata;
  readonly entries: readonly PublicationEntrySource[];
}

export interface PublicationPageRange {
  readonly start: number;
  readonly end: number;
}

export interface CommittedPublicationEntry {
  readonly id: string;
  readonly title: string;
  readonly pageRange: PublicationPageRange;
}

export interface PublicationDestination {
  readonly id: string;
  readonly entryId: string;
  readonly page: number;
  readonly generation: number;
}

export interface PublicationSearchResult {
  readonly entry: CommittedPublicationEntry;
  readonly page: number;
  readonly excerpt: string;
  readonly destination: PublicationDestination;
}

export interface PublicationOutlineItem {
  readonly kind: "entry" | "heading";
  readonly title: string;
  readonly level: number;
  readonly destination: PublicationDestination;
  readonly children: readonly PublicationOutlineItem[];
}

export interface PublicationDocument extends PageDocument {
  readonly metadata: PublicationMetadata;
  readonly entries: readonly CommittedPublicationEntry[];
  readonly outline: readonly PublicationOutlineItem[];
}

export type PublicationOptions = Omit<PageDocumentOptions, "extensions"> & {
  readonly extensions?: readonly PublicationExtension[];
  /**
   * How page numbers count. `"publication"` (the default) numbers pages
   * across the whole Publication. `"entry"` starts every entry on a new page
   * and restarts numbering there: `counter(page)`, `counter(pages)`, and the
   * `pageNumber`/`totalPages` template tokens count within the entry, so a
   * batch of invoices prints "Page 1 of 2" on each invoice. Page metadata,
   * Viewer navigation, search, and entry page ranges stay global.
   */
  readonly pageNumbering?: "publication" | "entry";
};

export interface PublicationController {
  readonly ready: Promise<PublicationDocument>;
  readonly current: PublicationDocument | undefined;
  resolveDestination(id: string): PublicationDestination | undefined;
  search(query: string): readonly PublicationSearchResult[];
  navigate(destination: PublicationDestination): void;
  update(
    snapshot: PublicationSnapshot,
    options?: { readonly signal?: AbortSignal },
  ): Promise<PublicationDocument>;
  print(): Promise<void>;
  destroy(): Promise<void>;
}
