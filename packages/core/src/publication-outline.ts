import { pageSemanticSnapshot } from "./page-document-semantic.js";
import type { PageDocument } from "./page-document-types.js";
import type {
  CommittedPublicationEntry,
  PublicationDestination,
  PublicationOutlineItem,
} from "./publication-types.js";

export const PUBLICATION_ENTRY_MARKER = "data-imposia-publication-entry";
export const PUBLICATION_DESTINATION_MARKER = "data-imposia-publication-destination";

interface MutableOutlineItem {
  readonly kind: "entry" | "heading";
  readonly title: string;
  readonly level: number;
  readonly destination: PublicationDestination;
  readonly children: MutableOutlineItem[];
}

function safeDestinationToken(value: string): string {
  return [...value]
    .map((character) =>
      /[a-z0-9]/i.test(character) ? character : `-${(character.codePointAt(0) ?? 0).toString(16)}-`,
    )
    .join("");
}

export function entryDestinationId(entryId: string): string {
  return `imposia-entry-${safeDestinationToken(entryId)}`;
}

function isOutlineHeading(heading: Element): boolean {
  return heading.closest('[hidden],[inert],[aria-hidden="true"]') === null;
}

export function assignPublicationDestinations(wrapper: HTMLElement, entryId: string): void {
  const entryDestination = entryDestinationId(entryId);
  wrapper.setAttribute(PUBLICATION_DESTINATION_MARKER, entryDestination);
  const used = new Map<string, number>();
  for (const [index, heading] of [
    ...wrapper.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6"),
  ]
    .filter(isOutlineHeading)
    .entries()) {
    const authoredId = heading.getAttribute("id")?.trim();
    const base =
      authoredId === undefined || authoredId === ""
        ? `heading-${index + 1}`
        : `id-${safeDestinationToken(authoredId)}`;
    const occurrence = (used.get(base) ?? 0) + 1;
    used.set(base, occurrence);
    const suffix = occurrence === 1 ? "" : `-${occurrence}`;
    heading.setAttribute(PUBLICATION_DESTINATION_MARKER, `${entryDestination}--${base}${suffix}`);
  }
}

function pageByDestination(pageDocument: PageDocument): ReadonlyMap<string, number> {
  const pages = new Map<string, number>();
  const frameDocument = pageDocument.iframe.contentDocument;
  if (frameDocument === null) return pages;
  for (const element of frameDocument.querySelectorAll<HTMLElement>(
    `[${PUBLICATION_DESTINATION_MARKER}]`,
  )) {
    const id = element.getAttribute(PUBLICATION_DESTINATION_MARKER);
    const page = Number(
      element.closest<HTMLElement>("[data-imposia-page]")?.getAttribute("data-imposia-page-number"),
    );
    if (id !== null && Number.isInteger(page) && page > 0 && !pages.has(id)) pages.set(id, page);
  }
  return pages;
}

function destination(
  id: string,
  entry: CommittedPublicationEntry,
  pageDocument: PageDocument,
  pages: ReadonlyMap<string, number>,
): PublicationDestination {
  return Object.freeze({
    id,
    entryId: entry.id,
    page: pages.get(id) ?? entry.pageRange.start,
    generation: pageDocument.generation,
  });
}

function freezeOutlineItem(item: MutableOutlineItem): PublicationOutlineItem {
  return Object.freeze({
    kind: item.kind,
    title: item.title,
    level: item.level,
    destination: item.destination,
    children: Object.freeze(item.children.map(freezeOutlineItem)),
  });
}

function isVisuallyHidden(
  element: Element,
  view: Window,
  cache: WeakMap<Element, boolean>,
): boolean {
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
    (parent !== null &&
      !element.hasAttribute("data-imposia-page") &&
      isVisuallyHidden(parent, view, cache));
  cache.set(element, hidden);
  return hidden;
}

function visibleText(element: Element, view: Window, cache: WeakMap<Element, boolean>): string {
  if (isVisuallyHidden(element, view, cache)) return "";
  return [...element.childNodes]
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      return node.nodeType === Node.ELEMENT_NODE ? visibleText(node as Element, view, cache) : "";
    })
    .join("");
}

function visibleHeadingTitles(pageDocument: PageDocument): ReadonlyMap<string, string> {
  const fragments = new Map<string, string>();
  const frameDocument = pageDocument.iframe.contentDocument;
  const view = frameDocument?.defaultView;
  if (frameDocument === null || view === null || view === undefined) return fragments;
  const visibility = new WeakMap<Element, boolean>();
  for (const heading of frameDocument.querySelectorAll<HTMLElement>(
    `h1[${PUBLICATION_DESTINATION_MARKER}],h2[${PUBLICATION_DESTINATION_MARKER}],h3[${PUBLICATION_DESTINATION_MARKER}],h4[${PUBLICATION_DESTINATION_MARKER}],h5[${PUBLICATION_DESTINATION_MARKER}],h6[${PUBLICATION_DESTINATION_MARKER}]`,
  )) {
    const id = heading.getAttribute(PUBLICATION_DESTINATION_MARKER);
    if (id !== null) {
      if (heading.closest("thead") !== null && fragments.has(id)) continue;
      fragments.set(id, `${fragments.get(id) ?? ""}${visibleText(heading, view, visibility)}`);
    }
  }
  return new Map(
    [...fragments].map(([id, title]) => [id, title.replace(/\s+/gu, " ").trim()] as const),
  );
}

export function committedPublicationOutline(
  pageDocument: PageDocument,
  entries: readonly CommittedPublicationEntry[],
): readonly PublicationOutlineItem[] {
  const semantic = pageSemanticSnapshot(pageDocument);
  const parsed =
    semantic === undefined
      ? undefined
      : new DOMParser().parseFromString(semantic.html, "text/html");
  const pages = pageByDestination(pageDocument);
  const headingTitles = visibleHeadingTitles(pageDocument);
  const outline = entries.map((entry, entryIndex) => {
    const entryId = entryDestinationId(entry.id);
    const root: MutableOutlineItem = {
      kind: "entry",
      title: entry.title,
      level: 0,
      destination: destination(entryId, entry, pageDocument, pages),
      children: [],
    };
    const wrapper = [...(parsed?.body.children ?? [])].find(
      (element) => element.getAttribute(PUBLICATION_ENTRY_MARKER) === String(entryIndex),
    );
    if (wrapper === undefined) return freezeOutlineItem(root);

    const stack: MutableOutlineItem[] = [];
    for (const heading of wrapper.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      if (!isOutlineHeading(heading)) continue;
      const id = heading.getAttribute(PUBLICATION_DESTINATION_MARKER);
      const title = id === null ? "" : (headingTitles.get(id) ?? "");
      const level = Number(heading.localName.slice(1));
      if (title === "" || id === null || !Number.isInteger(level)) continue;
      const item: MutableOutlineItem = {
        kind: "heading",
        title,
        level,
        destination: destination(id, entry, pageDocument, pages),
        children: [],
      };
      while ((stack.at(-1)?.level ?? 0) >= level) stack.pop();
      (stack.at(-1) ?? root).children.push(item);
      stack.push(item);
    }
    return freezeOutlineItem(root);
  });
  return Object.freeze(outline);
}

export function resolvePublicationDestination(
  outline: readonly PublicationOutlineItem[],
  id: string,
): PublicationDestination | undefined {
  for (const item of outline) {
    if (item.destination.id === id) return item.destination;
    const child = resolvePublicationDestination(item.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

export function moveToPublicationDestination(
  pageDocument: PageDocument,
  destination: PublicationDestination,
): boolean {
  const frameDocument = pageDocument.iframe.contentDocument;
  if (frameDocument === null) return false;
  for (const element of frameDocument.querySelectorAll<HTMLElement>(
    `[${PUBLICATION_DESTINATION_MARKER}]`,
  )) {
    if (element.getAttribute(PUBLICATION_DESTINATION_MARKER) !== destination.id) continue;
    const page = Number(
      element.closest<HTMLElement>("[data-imposia-page]")?.getAttribute("data-imposia-page-number"),
    );
    if (page !== destination.page) continue;
    element.scrollIntoView({ block: "start", inline: "nearest" });
    return true;
  }
  return false;
}
