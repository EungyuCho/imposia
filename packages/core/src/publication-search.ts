import type { PageDocument } from "./page-document-types.js";
import { PUBLICATION_ENTRY_MARKER } from "./publication-outline.js";
import type {
  CommittedPublicationEntry,
  PublicationDestination,
  PublicationSearchResult,
} from "./publication-types.js";

const EXCERPT_CONTEXT = 48;
const NON_SEARCHABLE_ELEMENTS = "script,style,template,noscript";
const SEARCH_SCOPE_SEQUENCE = Symbol.for("@imposia/core/publication-search-scope-sequence");
type SearchScopeGlobal = typeof globalThis & { [SEARCH_SCOPE_SEQUENCE]?: number };

interface TextAccumulator {
  readonly parts: string[];
  boundary: Element | undefined;
}

interface SearchSegment {
  readonly entry: CommittedPublicationEntry;
  readonly page: number;
  readonly text: string;
  readonly foldedText: string;
  readonly destination: PublicationDestination;
}

export interface PublicationSearchIndex {
  search(query: string): readonly PublicationSearchResult[];
  resolveDestination(id: string): PublicationDestination | undefined;
  navigate(destination: PublicationDestination): boolean;
}

export function nextPublicationSearchScope(): string {
  const scopeGlobal = globalThis as SearchScopeGlobal;
  const sequence = (scopeGlobal[SEARCH_SCOPE_SEQUENCE] ?? 0) + 1;
  scopeGlobal[SEARCH_SCOPE_SEQUENCE] = sequence;
  return sequence.toString(36);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function isHidden(element: Element, view: Window, cache: WeakMap<Element, boolean>): boolean {
  const cached = cache.get(element);
  if (cached !== undefined) return cached;
  const parent = element.parentElement;
  const closedDetailsContent = (() => {
    if (parent?.localName !== "details" || parent.hasAttribute("open")) return false;
    const summary = [...parent.children].find((child) => child.localName === "summary");
    return summary === undefined || !summary.contains(element);
  })();
  const style = view.getComputedStyle(element);
  const hidden =
    element.hasAttribute("hidden") ||
    element.hasAttribute("inert") ||
    element.getAttribute("aria-hidden")?.trim().toLowerCase() === "true" ||
    closedDetailsContent ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    style.contentVisibility === "hidden" ||
    style.opacity === "0" ||
    (parent !== null &&
      !element.hasAttribute("data-imposia-page") &&
      isHidden(parent, view, cache));
  cache.set(element, hidden);
  return hidden;
}

function textBoundary(
  element: Element,
  root: Element,
  view: Window,
  cache: WeakMap<Element, Element>,
): Element {
  const cached = cache.get(element);
  if (cached !== undefined) return cached;
  let candidate = element;
  while (candidate !== root) {
    const display = view.getComputedStyle(candidate).display;
    if (display !== "contents" && !display.startsWith("inline") && !display.startsWith("ruby")) {
      cache.set(element, candidate);
      return candidate;
    }
    const parent = candidate.parentElement;
    if (parent === null) break;
    candidate = parent;
  }
  cache.set(element, root);
  return root;
}

function createsTextBoundary(element: Element, view: Window): boolean {
  if (element.localName === "br") return true;
  const display = view.getComputedStyle(element).display;
  return display !== "contents" && !display.startsWith("inline") && !display.startsWith("ruby");
}

function excerpt(text: string, matchIndex: number, queryLength: number): string {
  const before = Array.from(text.slice(0, matchIndex));
  const match = text.slice(matchIndex, matchIndex + queryLength);
  const after = Array.from(text.slice(matchIndex + queryLength));
  const leading = before.length > EXCERPT_CONTEXT;
  const trailing = after.length > EXCERPT_CONTEXT;
  return `${leading ? "…" : ""}${before.slice(-EXCERPT_CONTEXT).join("")}${match}${after
    .slice(0, EXCERPT_CONTEXT)
    .join("")}${trailing ? "…" : ""}`;
}

export function createPublicationSearchIndex(
  pageDocument: PageDocument,
  entries: readonly CommittedPublicationEntry[],
  scope: string,
): PublicationSearchIndex {
  const frameDocument = pageDocument.iframe.contentDocument;
  const view = frameDocument?.defaultView;
  const segments: SearchSegment[] = [];
  const destinations = new Map<string, PublicationDestination>();
  const pageElements = new Map<number, HTMLElement>();
  if (frameDocument !== null && view !== null && view !== undefined) {
    const visibility = new WeakMap<Element, boolean>();
    const boundaries = new WeakMap<Element, Element>();
    for (const page of frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")) {
      const pageNumber = Number(page.getAttribute("data-imposia-page-number"));
      if (!Number.isInteger(pageNumber) || pageNumber < 1) continue;
      pageElements.set(pageNumber, page);
      const byEntry = new Map<number, TextAccumulator>();
      const contentRoots = [
        page.querySelector<HTMLElement>("[data-imposia-page-content]"),
        page.querySelector<HTMLElement>(":scope > [data-imposia-footnote-area]"),
        ...page.querySelectorAll<HTMLElement>(":scope > [data-imposia-page-float]"),
      ].filter((root): root is HTMLElement => root !== null);
      for (const root of contentRoots) {
        const walker: TreeWalker = frameDocument.createTreeWalker(
          root,
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        );
        let node: Node | null = walker.nextNode();
        while (node !== null) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const wrapper = element.closest<HTMLElement>(`[${PUBLICATION_ENTRY_MARKER}]`);
            const entryIndex = Number(wrapper?.getAttribute(PUBLICATION_ENTRY_MARKER));
            if (
              Number.isInteger(entryIndex) &&
              entries[entryIndex] !== undefined &&
              element.closest(NON_SEARCHABLE_ELEMENTS) === null &&
              createsTextBoundary(element, view) &&
              !isHidden(element, view, visibility)
            ) {
              const accumulator = byEntry.get(entryIndex) ?? { parts: [], boundary: undefined };
              accumulator.parts.push(" ");
              byEntry.set(entryIndex, accumulator);
            }
            node = walker.nextNode();
            continue;
          }
          const parent: HTMLElement | null = node.parentElement;
          const wrapper: HTMLElement | null =
            parent?.closest<HTMLElement>(`[${PUBLICATION_ENTRY_MARKER}]`) ?? null;
          const entryIndex = Number(wrapper?.getAttribute(PUBLICATION_ENTRY_MARKER));
          if (
            parent !== null &&
            parent.closest(NON_SEARCHABLE_ELEMENTS) === null &&
            Number.isInteger(entryIndex) &&
            entries[entryIndex] !== undefined &&
            !isHidden(parent, view, visibility)
          ) {
            const value = node.textContent ?? "";
            if (value !== "") {
              const accumulator = byEntry.get(entryIndex) ?? { parts: [], boundary: undefined };
              const boundary = textBoundary(parent, root, view, boundaries);
              if (accumulator.boundary !== undefined && accumulator.boundary !== boundary) {
                accumulator.parts.push(" ");
              }
              accumulator.parts.push(value);
              accumulator.boundary = boundary;
              byEntry.set(entryIndex, accumulator);
            }
          }
          node = walker.nextNode();
        }
      }
      for (const [entryIndex, accumulator] of byEntry) {
        const entry = entries[entryIndex];
        if (entry === undefined) continue;
        const text = normalizeText(accumulator.parts.join(""));
        if (text === "") continue;
        const destination = Object.freeze({
          id: `imposia-search-${scope}-${pageDocument.generation}-${pageNumber}-${entryIndex}`,
          entryId: entry.id,
          page: pageNumber,
          generation: pageDocument.generation,
        });
        destinations.set(destination.id, destination);
        segments.push(
          Object.freeze({
            entry,
            page: pageNumber,
            text,
            foldedText: text.toLowerCase(),
            destination,
          }),
        );
      }
    }
  }

  return {
    search(query) {
      const normalizedQuery = normalizeText(query);
      if (normalizedQuery === "") return Object.freeze([]);
      const foldedQuery = normalizedQuery.toLowerCase();
      return Object.freeze(
        segments.flatMap((segment) => {
          const matchIndex = segment.foldedText.indexOf(foldedQuery);
          if (matchIndex < 0) return [];
          return [
            Object.freeze({
              entry: segment.entry,
              page: segment.page,
              excerpt: excerpt(segment.text, matchIndex, normalizedQuery.length),
              destination: segment.destination,
            }),
          ];
        }),
      );
    },
    resolveDestination(id) {
      return destinations.get(id);
    },
    navigate(destination) {
      const current = destinations.get(destination.id);
      if (
        current === undefined ||
        current.entryId !== destination.entryId ||
        current.page !== destination.page ||
        current.generation !== destination.generation
      ) {
        return false;
      }
      const page = pageElements.get(current.page);
      if (page === undefined) return false;
      page.scrollIntoView({ block: "start", inline: "nearest" });
      return true;
    },
  };
}
