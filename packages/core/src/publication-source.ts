import { ImposiaError } from "./errors.js";
import { cssReferences, inlineCss, parseCss, replaceCssRange } from "./page-document-assets-css.js";
import { sameDocumentFragment, srcsetCandidates } from "./page-document-assets-html.js";
import { isLightDomSource, sourceHtml } from "./page-document-sanitize.js";
import type {
  PageExtensionEntryMetadata,
  PageExtensionPublicationMetadata,
  PageSource,
} from "./page-document-types.js";
import {
  assignPublicationDestinations,
  PUBLICATION_DESTINATION_MARKER,
  PUBLICATION_ENTRY_MARKER,
} from "./publication-outline.js";
import type { PublicationMetadata, PublicationSnapshot } from "./publication-types.js";

export interface PreparedPublicationSnapshot {
  readonly metadata: PublicationMetadata;
  readonly entries: readonly Readonly<{ id: string; title: string }>[];
  readonly source: PageSource;
}

export interface PublicationExtensionSource {
  readonly publication: PageExtensionPublicationMetadata;
  readonly entries: readonly Readonly<{
    metadata: PageExtensionEntryMetadata;
    html: string;
  }>[];
}

const publicationExtensionSources = new WeakMap<PageSource, PublicationExtensionSource>();

export function publicationExtensionSource(
  source: PageSource,
): PublicationExtensionSource | undefined {
  return publicationExtensionSources.get(source);
}

const URL_ATTRIBUTES = new Set([
  "action",
  "background",
  "dynsrc",
  "formaction",
  "href",
  "lowsrc",
  "ping",
  "poster",
  "src",
  "xlink:href",
]);

function invalidPublication(message: string): ImposiaError {
  return new ImposiaError("INVALID_PUBLICATION", message);
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

function nonblank(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidPublication(`${label} must be a nonblank string.`);
  }
  return value;
}

function metadataSnapshot(value: unknown): PublicationMetadata {
  const input = record(value);
  if (input === undefined) throw invalidPublication("Publication metadata must be an object.");
  const title = nonblank(input.title, "Publication metadata title");
  if (input.language !== undefined && typeof input.language !== "string") {
    throw invalidPublication("Publication metadata language must be a string.");
  }
  if (input.identifier !== undefined && typeof input.identifier !== "string") {
    throw invalidPublication("Publication metadata identifier must be a string.");
  }
  return Object.freeze({
    title,
    ...(input.language === undefined ? {} : { language: input.language }),
    ...(input.identifier === undefined ? {} : { identifier: input.identifier }),
  });
}

function entryIdentifier(value: unknown, index: number): string {
  const id = nonblank(value, `Publication entry ${index + 1} id`);
  const invalidCharacter = [...id].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /\s/u.test(character) || codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (invalidCharacter) {
    throw invalidPublication(
      `Publication entry ${index + 1} id must not contain whitespace or control characters.`,
    );
  }
  return id;
}

function entrySource(input: Readonly<Record<string, unknown>>, index: number): PageSource {
  const hasHtml = Object.hasOwn(input, "html");
  const hasLightDom = Object.hasOwn(input, "lightDom");
  if (hasHtml === hasLightDom) {
    throw invalidPublication(
      `Publication entry ${index + 1} must provide exactly one of html or lightDom.`,
    );
  }
  if (input.baseUrl !== undefined && typeof input.baseUrl !== "string") {
    throw invalidPublication(`Publication entry ${index + 1} baseUrl must be a string.`);
  }
  if (hasHtml) {
    if (typeof input.html !== "string") {
      throw invalidPublication(`Publication entry ${index + 1} html must be a string.`);
    }
    return {
      html: input.html,
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    };
  }
  if (!isLightDomSource(input.lightDom)) {
    throw invalidPublication(
      `Publication entry ${index + 1} lightDom must be an Element or DocumentFragment.`,
    );
  }
  return {
    lightDom: input.lightDom,
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
  };
}

function absoluteBaseUrl(value: string | undefined, index: number): string | undefined {
  if (value === undefined) return undefined;
  try {
    return new URL(value, document.baseURI).href;
  } catch (_error: unknown) {
    throw invalidPublication(`Publication entry ${index + 1} baseUrl must be a valid URL.`);
  }
}

function resolveUrl(value: string, baseUrl: string): string {
  if (value.trim() === "" || sameDocumentFragment(value)) return value;
  try {
    return new URL(value, baseUrl).href;
  } catch (_error: unknown) {
    return value;
  }
}

function rebaseCss(value: string, baseUrl: string, inline: boolean): string {
  try {
    const root = parseCss(value, inline);
    const references = cssReferences(root);
    const byNode = new Map<(typeof references)[number]["node"], (typeof references)[number][]>();
    for (const reference of references) {
      const grouped = byNode.get(reference.node) ?? [];
      grouped.push(reference);
      byNode.set(reference.node, grouped);
    }
    for (const [node, grouped] of byNode) {
      let text = node.type === "atrule" ? node.params : node.value;
      for (const reference of [...grouped].sort(
        (left, right) => right.token.start - left.token.start,
      )) {
        text = replaceCssRange(text, reference.token, resolveUrl(reference.token.url, baseUrl));
      }
      if (node.type === "atrule") node.params = text;
      else node.value = text;
    }
    return inline ? inlineCss(root) : root.toString();
  } catch (_error: unknown) {
    return value;
  }
}

function rebaseSrcset(value: string, baseUrl: string): string {
  let rebased = value;
  const candidates = srcsetCandidates(value);
  for (const candidate of [...candidates].reverse()) {
    rebased = `${rebased.slice(0, candidate.start)}${resolveUrl(candidate.url, baseUrl)}${rebased.slice(candidate.end)}`;
  }
  return rebased;
}

function prepareEntryMarkup(
  frameDocument: Document,
  source: PageSource,
  index: number,
  entryId: string,
  extensionCss: readonly string[] = [],
): HTMLElement {
  const parsed = new DOMParser().parseFromString(sourceHtml(source), "text/html");
  const wrapper = frameDocument.createElement("section");
  wrapper.setAttribute(PUBLICATION_ENTRY_MARKER, String(index));
  for (const node of [
    ...parsed.head.querySelectorAll('style,link[rel~="stylesheet" i]'),
    ...parsed.body.childNodes,
  ]) {
    wrapper.append(frameDocument.importNode(node, true));
  }
  for (const css of extensionCss) {
    const style = frameDocument.createElement("style");
    style.textContent = css;
    wrapper.append(style);
  }

  const baseUrl = absoluteBaseUrl(source.baseUrl, index);
  for (const element of wrapper.querySelectorAll<HTMLElement>("*")) {
    element.removeAttribute(PUBLICATION_ENTRY_MARKER);
    element.removeAttribute(PUBLICATION_DESTINATION_MARKER);
    element.setAttribute(PUBLICATION_ENTRY_MARKER, String(index));
    if (baseUrl === undefined) continue;
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name === "srcset") {
        element.setAttribute(attribute.name, rebaseSrcset(attribute.value, baseUrl));
      } else if (URL_ATTRIBUTES.has(name)) {
        element.setAttribute(attribute.name, resolveUrl(attribute.value, baseUrl));
      }
    }
    if (element.localName === "style") {
      element.textContent = rebaseCss(element.textContent ?? "", baseUrl, false);
    }
    const style = element.getAttribute("style");
    if (style !== null) element.setAttribute("style", rebaseCss(style, baseUrl, true));
  }
  assignPublicationDestinations(wrapper, entryId);
  return wrapper;
}

export function composePublicationExtensionSource(
  extensionSource: PublicationExtensionSource,
  transformed: readonly Readonly<{ html: string; css: readonly string[] }>[],
): PageSource {
  const composed = document.implementation.createHTMLDocument(extensionSource.publication.title);
  const fragment = composed.createDocumentFragment();
  for (const [index, entry] of extensionSource.entries.entries()) {
    const output = transformed[index];
    if (output === undefined)
      throw invalidPublication(`Publication entry ${index + 1} is missing.`);
    fragment.append(
      prepareEntryMarkup(
        composed,
        {
          html: output.html,
          ...(entry.metadata.baseUrl === undefined ? {} : { baseUrl: entry.metadata.baseUrl }),
        },
        index,
        entry.metadata.id,
        output.css,
      ),
    );
  }
  composed.body.replaceChildren(fragment);
  return Object.freeze({ html: composed.documentElement.outerHTML });
}

export function preparePublicationSnapshot(
  snapshot: PublicationSnapshot,
): PreparedPublicationSnapshot {
  const input = record(snapshot);
  if (input === undefined) throw invalidPublication("Publication snapshot must be an object.");
  const metadata = metadataSnapshot(input.metadata);
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw invalidPublication("Publication entries must be a non-empty array.");
  }

  const ids = new Set<string>();
  const entries: Array<Readonly<{ id: string; title: string }>> = [];
  const sources: PageSource[] = [];
  for (const [index, value] of input.entries.entries()) {
    const entry = record(value);
    if (entry === undefined)
      throw invalidPublication(`Publication entry ${index + 1} must be an object.`);
    const id = entryIdentifier(entry.id, index);
    if (ids.has(id)) throw invalidPublication(`Publication entry id "${id}" is duplicated.`);
    ids.add(id);
    entries.push(
      Object.freeze({ id, title: nonblank(entry.title, `Publication entry ${index + 1} title`) }),
    );
    sources.push(entrySource(entry, index));
  }

  const composed = document.implementation.createHTMLDocument(metadata.title);
  const fragment = composed.createDocumentFragment();
  for (const [index, source] of sources.entries()) {
    const entry = entries[index];
    if (entry === undefined) throw invalidPublication(`Publication entry ${index + 1} is missing.`);
    fragment.append(prepareEntryMarkup(composed, source, index, entry.id));
  }
  composed.body.replaceChildren(fragment);
  const source = Object.freeze({ html: composed.documentElement.outerHTML });
  const publication = Object.freeze({
    title: metadata.title,
    language: metadata.language,
    identifier: metadata.identifier,
    entryCount: entries.length,
  });
  publicationExtensionSources.set(
    source,
    Object.freeze({
      publication,
      entries: Object.freeze(
        sources.map((entrySourceValue, index) => {
          const entry = entries[index];
          if (entry === undefined)
            throw invalidPublication(`Publication entry ${index + 1} is missing.`);
          return Object.freeze({
            metadata: Object.freeze({
              id: entry.id,
              title: entry.title,
              index,
              totalEntries: entries.length,
              baseUrl: absoluteBaseUrl(entrySourceValue.baseUrl, index),
            }),
            html: sourceHtml(entrySourceValue),
          });
        }),
      ),
    }),
  );
  return Object.freeze({
    metadata,
    entries: Object.freeze(entries),
    source,
  });
}
