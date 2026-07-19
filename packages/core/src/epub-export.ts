import postcss, { type AtRule, type Declaration, type Root } from "postcss";
import { createStoredZip, type StoredZipEntry } from "./epub-zip.js";
import { ImposiaError } from "./errors.js";
import { scanCssUrls } from "./page-document-assets-css.js";
import {
  rewriteSrcset,
  sameDocumentFragment,
  srcsetCandidates,
} from "./page-document-assets-html.js";
import { abortError } from "./page-document-frame.js";
import { safeSemanticHyperlink } from "./page-document-sanitize-resolver-input.js";
import { type PageSemanticSnapshot, pageSemanticSnapshot } from "./page-document-semantic.js";
import type {
  EpubExportLimits,
  EpubExportOptions,
  EpubMetadata,
  PageDocument,
} from "./page-document-types.js";

const EPUB_MIME_TYPE = "application/epub+zip";
const DEFAULT_MODIFIED = "1970-01-01T00:00:00Z";
const INTERNAL_MAX_ENTRIES = 4096;
const INTERNAL_MAX_BYTES = 256 * 1024 * 1024;
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const EPUB_NAMESPACE = "http://www.idpf.org/2007/ops";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

const MEDIA_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["font/woff", "woff"],
  ["font/woff2", "woff2"],
  ["font/ttf", "ttf"],
  ["font/otf", "otf"],
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/webm", "webm"],
  ["video/mp4", "mp4"],
  ["video/ogg", "ogv"],
  ["video/webm", "webm"],
]);

type ValidatedMetadata = Readonly<{
  title: string;
  language: string;
  identifier: string;
  modified: string;
}>;

type EpubAsset = Readonly<{
  id: string;
  href: string;
  archivePath: string;
  mediaType: string;
  bytes: Uint8Array<ArrayBuffer>;
}>;

function invalidMetadata(message: string): ImposiaError {
  return new ImposiaError("INVALID_EPUB_METADATA", message);
}

function invalidLimits(message: string): ImposiaError {
  return new ImposiaError("INVALID_EPUB_LIMITS", message);
}

function invalidResource(message: string): ImposiaError {
  return new ImposiaError("INVALID_EPUB_RESOURCE", message);
}

function releasedDocumentError(): Error {
  return new Error("Page document has been destroyed or released.");
}

const GRANDFATHERED_LANGUAGE_TAGS: ReadonlySet<string> = new Set([
  "art-lojban",
  "cel-gaulish",
  "en-gb-oed",
  "i-ami",
  "i-bnn",
  "i-default",
  "i-enochian",
  "i-hak",
  "i-klingon",
  "i-lux",
  "i-mingo",
  "i-navajo",
  "i-pwn",
  "i-tao",
  "i-tay",
  "i-tsu",
  "no-bok",
  "no-nyn",
  "sgn-be-fr",
  "sgn-be-nl",
  "sgn-ch-de",
  "zh-guoyu",
  "zh-hakka",
  "zh-min",
  "zh-min-nan",
  "zh-xiang",
]);

function isAsciiAlpha(value: string): boolean {
  return /^[A-Za-z]+$/u.test(value);
}

function isAsciiDigit(value: string): boolean {
  return /^[0-9]+$/u.test(value);
}

function isAsciiAlphanumeric(value: string): boolean {
  return /^[A-Za-z0-9]+$/u.test(value);
}

function validBcp47LanguageTag(value: string): boolean {
  const lower = value.toLowerCase();
  if (GRANDFATHERED_LANGUAGE_TAGS.has(lower)) return true;
  const subtags = value.split("-");
  if (subtags.some((subtag) => subtag === "")) return false;

  const language = subtags[0];
  if (language === undefined) return false;
  let index = 1;
  if (language.toLowerCase() === "x") {
    return (
      subtags.length > 1 && subtags.slice(1).every((subtag) => /^[A-Za-z0-9]{1,8}$/u.test(subtag))
    );
  }

  if (isAsciiAlpha(language) && language.length >= 2 && language.length <= 3) {
    let extlangCount = 0;
    while (
      index < subtags.length &&
      extlangCount < 3 &&
      subtags[index] !== undefined &&
      isAsciiAlpha(subtags[index] ?? "") &&
      subtags[index]?.length === 3
    ) {
      index += 1;
      extlangCount += 1;
    }
  } else if (
    !(
      (isAsciiAlpha(language) && language.length === 4) ||
      (isAsciiAlpha(language) && language.length >= 5 && language.length <= 8)
    )
  ) {
    return false;
  }

  const script = subtags[index];
  if (script !== undefined && isAsciiAlpha(script) && script.length === 4) index += 1;

  const region = subtags[index];
  if (
    region !== undefined &&
    ((isAsciiAlpha(region) && region.length === 2) || (isAsciiDigit(region) && region.length === 3))
  ) {
    index += 1;
  }

  const variants = new Set<string>();
  while (index < subtags.length) {
    const variant = subtags[index];
    if (variant === undefined) return false;
    const validVariant =
      (isAsciiAlphanumeric(variant) && variant.length >= 5 && variant.length <= 8) ||
      (/^[0-9][A-Za-z0-9]{3}$/u.test(variant) && variant.length === 4);
    if (!validVariant) break;
    const normalizedVariant = variant.toLowerCase();
    if (variants.has(normalizedVariant)) return false;
    variants.add(normalizedVariant);
    index += 1;
  }

  const extensionSingletons = new Set<string>();
  while (index < subtags.length) {
    const singleton = subtags[index]?.toLowerCase();
    if (singleton === "x") break;
    if (singleton === undefined || !/^[0-9A-WY-Za-wy-z]$/u.test(singleton)) return false;
    if (extensionSingletons.has(singleton)) return false;
    extensionSingletons.add(singleton);
    index += 1;
    let extensionSubtagCount = 0;
    while (index < subtags.length) {
      const extensionSubtag = subtags[index];
      if (
        extensionSubtag === undefined ||
        extensionSubtag.length < 2 ||
        extensionSubtag.length > 8 ||
        !isAsciiAlphanumeric(extensionSubtag)
      ) {
        break;
      }
      index += 1;
      extensionSubtagCount += 1;
    }
    if (extensionSubtagCount === 0) return false;
  }

  if (subtags[index]?.toLowerCase() === "x") {
    index += 1;
    if (index >= subtags.length) return false;
    while (index < subtags.length) {
      const privateUseSubtag = subtags[index];
      if (
        privateUseSubtag === undefined ||
        privateUseSubtag.length < 1 ||
        privateUseSubtag.length > 8 ||
        !isAsciiAlphanumeric(privateUseSubtag)
      ) {
        return false;
      }
      index += 1;
    }
  }

  return index === subtags.length;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

function nonblankMetadata(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidMetadata(`EPUB ${name} must be a nonblank string.`);
  }
  const hasInvalidXmlCharacter = [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
  });
  if (hasInvalidXmlCharacter) {
    throw invalidMetadata(`EPUB ${name} contains invalid XML characters.`);
  }
  const trimmed = value.trim();
  if (name === "language" && !validBcp47LanguageTag(trimmed)) {
    throw invalidMetadata("EPUB language must be a well-formed BCP 47 language tag.");
  }
  return trimmed;
}

function validModifiedTimestamp(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z$/u.exec(value);
  if (match === null) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) return false;
  return parsed.toISOString().replace(".000Z", "Z") === value;
}

function validateMetadata(value: unknown): ValidatedMetadata {
  const metadata = recordValue(value);
  if (metadata === undefined) throw invalidMetadata("EPUB metadata must be an object.");
  const modifiedValue = metadata.modified;
  if (modifiedValue !== undefined && typeof modifiedValue !== "string") {
    throw invalidMetadata("EPUB modified must be a UTC timestamp string.");
  }
  const modified = modifiedValue ?? DEFAULT_MODIFIED;
  if (!validModifiedTimestamp(modified)) {
    throw invalidMetadata("EPUB modified must be a valid UTC timestamp ending in Z.");
  }
  return Object.freeze({
    title: nonblankMetadata(metadata.title, "title"),
    language: nonblankMetadata(metadata.language, "language"),
    identifier: nonblankMetadata(metadata.identifier, "identifier"),
    modified,
  });
}

function boundedLimit(value: unknown, fallback: number, maximum: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value <= 0 || value > maximum) {
    throw invalidLimits(`EPUB ${name} must be a positive safe integer no greater than ${maximum}.`);
  }
  return value;
}

function validateLimits(value: unknown): Required<EpubExportLimits> {
  const limits = value === undefined ? undefined : recordValue(value);
  if (value !== undefined && limits === undefined) {
    throw invalidLimits("EPUB limits must be an object.");
  }
  return Object.freeze({
    maxEntries: boundedLimit(
      limits?.maxEntries,
      INTERNAL_MAX_ENTRIES,
      INTERNAL_MAX_ENTRIES,
      "maxEntries",
    ),
    maxBytes: boundedLimit(limits?.maxBytes, INTERNAL_MAX_BYTES, INTERNAL_MAX_BYTES, "maxBytes"),
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw abortError();
}

async function awaitWithAbort<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  throwIfAborted(signal);
  if (signal === undefined) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function requireSnapshot(
  pageDocument: PageDocument,
  expected?: PageSemanticSnapshot,
): PageSemanticSnapshot {
  const snapshot = pageSemanticSnapshot(pageDocument);
  if (snapshot === undefined || (expected !== undefined && snapshot !== expected)) {
    throw releasedDocumentError();
  }
  return snapshot;
}

function normalizedMediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function byteFingerprint(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function collectAssets(
  pageDocument: PageDocument,
  snapshot: PageSemanticSnapshot,
  signal: AbortSignal | undefined,
): Promise<Readonly<{ assets: readonly EpubAsset[]; blobHrefs: ReadonlyMap<string, string> }>> {
  const assets: EpubAsset[] = [];
  const blobHrefs = new Map<string, string>();
  const dedupe = new Map<string, EpubAsset[]>();
  for (const retained of snapshot.assets) {
    throwIfAborted(signal);
    requireSnapshot(pageDocument, snapshot);
    if (retained.kind === "stylesheet" || retained.blobUrl === undefined) continue;
    const mediaType = normalizedMediaType(retained.mimeType);
    const extension = MEDIA_EXTENSIONS.get(mediaType);
    if (extension === undefined) {
      throw invalidResource(`Unsupported retained EPUB media type: ${mediaType || "unknown"}`);
    }
    const buffer = await awaitWithAbort(retained.bytes.arrayBuffer(), signal);
    requireSnapshot(pageDocument, snapshot);
    const bytes = new Uint8Array(buffer);
    const key = `${mediaType}:${bytes.byteLength}:${byteFingerprint(bytes)}`;
    const candidates = dedupe.get(key) ?? [];
    const duplicate = candidates.find((candidate) => equalBytes(candidate.bytes, bytes));
    if (duplicate !== undefined) {
      blobHrefs.set(retained.blobUrl, duplicate.href);
      continue;
    }
    const number = assets.length + 1;
    const suffix = String(number).padStart(4, "0");
    const asset = Object.freeze({
      id: `asset-${suffix}`,
      href: `assets/asset-${suffix}.${extension}`,
      archivePath: `EPUB/assets/asset-${suffix}.${extension}`,
      mediaType,
      bytes,
    });
    assets.push(asset);
    candidates.push(asset);
    dedupe.set(key, candidates);
    blobHrefs.set(retained.blobUrl, asset.href);
  }
  return Object.freeze({ assets: Object.freeze(assets), blobHrefs });
}

function replaceCssUrls(value: string, blobHrefs: ReadonlyMap<string, string>): string | undefined {
  let output = value;
  const tokens = [...scanCssUrls(value)];
  for (const token of tokens.reverse()) {
    if (sameDocumentFragment(token.url)) continue;
    const replacement = blobHrefs.get(token.url.trim());
    if (replacement === undefined) return undefined;
    output = `${output.slice(0, token.start)}${replacement}${output.slice(token.end)}`;
  }
  return output;
}

function cleanCssRoot(root: Root, blobHrefs: ReadonlyMap<string, string>): void {
  root.walkAtRules((rule: AtRule) => {
    const name = rule.name.trim().toLowerCase();
    if (name === "page" || name === "import" || name === "namespace") {
      rule.remove();
      return;
    }
    const params = replaceCssUrls(rule.params, blobHrefs);
    if (params === undefined) rule.remove();
    else rule.params = params;
  });
  root.walkRules((rule) => {
    if (/data-imposia-/iu.test(rule.selector)) rule.remove();
  });
  root.walkDecls((declaration: Declaration) => {
    const property = declaration.prop.trim().toLowerCase();
    const value = declaration.value.trim();
    if (
      property === "page" ||
      property === "float-reference" ||
      property === "string-set" ||
      property.startsWith("--imposia-") ||
      (property === "float" && /^(?:footnote|top|bottom)$/iu.test(value)) ||
      /counter\(\s*pages?\s*\)/iu.test(value)
    ) {
      declaration.remove();
      return;
    }
    const rewritten = replaceCssUrls(declaration.value, blobHrefs);
    if (rewritten === undefined) declaration.remove();
    else declaration.value = rewritten;
  });
}

function rewriteStylesheet(css: string, blobHrefs: ReadonlyMap<string, string>): string {
  try {
    const root = postcss.parse(css);
    cleanCssRoot(root, blobHrefs);
    return root.toString();
  } catch {
    return "";
  }
}

function rewriteInlineStyle(css: string, blobHrefs: ReadonlyMap<string, string>): string {
  try {
    const root = postcss.parse(`x{${css}}`);
    cleanCssRoot(root, blobHrefs);
    const rule = root.first;
    return rule?.type === "rule" ? rule.nodes.map((node) => node.toString()).join(";") : "";
  } catch {
    return "";
  }
}

function rewriteSrcsetAttribute(
  value: string,
  blobHrefs: ReadonlyMap<string, string>,
): string | undefined {
  const candidates = srcsetCandidates(value);
  if (candidates.length === 0) return undefined;
  const replacements = new Map<number, string | undefined>();
  for (const [index, candidate] of candidates.entries()) {
    replacements.set(index, blobHrefs.get(candidate.url.trim()));
  }
  const rewritten = rewriteSrcset(value, candidates, replacements);
  return rewritten === "" ? undefined : rewritten;
}

function resourceHref(value: string, blobHrefs: ReadonlyMap<string, string>): string | undefined {
  const trimmed = value.trim();
  if (sameDocumentFragment(trimmed)) return trimmed;
  return blobHrefs.get(trimmed);
}

function sanitizeContentDocument(
  snapshot: PageSemanticSnapshot,
  metadata: ValidatedMetadata,
  blobHrefs: ReadonlyMap<string, string>,
): Readonly<{ xhtml: string; css: string }> {
  const parsed = new DOMParser().parseFromString(
    "<!DOCTYPE html><html><head></head><body></body></html>",
    "text/html",
  );
  parsed.body.innerHTML = snapshot.html;
  for (const element of parsed.querySelectorAll(
    "script,iframe,object,embed,base,meta,link,frame,portal,template",
  )) {
    element.remove();
  }
  for (const element of parsed.querySelectorAll(
    "[data-imposia-page-header],[data-imposia-page-footer],[data-imposia-margin-box],[data-imposia-footnote-area]",
  )) {
    element.remove();
  }
  for (const form of parsed.querySelectorAll("form")) form.replaceWith(...[...form.childNodes]);

  const embeddedCss = [...parsed.querySelectorAll<HTMLStyleElement>("style")].map(
    (style) => style.textContent ?? "",
  );
  for (const style of parsed.querySelectorAll("style")) style.remove();

  for (const element of parsed.querySelectorAll<Element>("*")) {
    const localName = element.localName.toLowerCase();
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name.startsWith("data-imposia-") || name === "target") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style") {
        const style = rewriteInlineStyle(attribute.value, blobHrefs);
        if (style === "") element.removeAttribute(attribute.name);
        else element.setAttribute(attribute.name, style);
        continue;
      }
      if (name === "srcset") {
        const srcset = rewriteSrcsetAttribute(attribute.value, blobHrefs);
        if (srcset === undefined) element.removeAttribute(attribute.name);
        else element.setAttribute(attribute.name, srcset);
        continue;
      }
      if (name === "href" && (localName === "a" || localName === "area")) {
        if (safeSemanticHyperlink(attribute.value)) {
          element.setAttribute(attribute.name, attribute.value.trim());
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      if (["src", "poster", "href", "xlink:href"].includes(name)) {
        const href = resourceHref(attribute.value, blobHrefs);
        if (href === undefined) element.removeAttribute(attribute.name);
        else element.setAttribute(attribute.name, href);
        continue;
      }
      if (["action", "formaction", "ping", "background", "lowsrc", "dynsrc"].includes(name)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (scanCssUrls(attribute.value).length > 0) {
        const rewritten = replaceCssUrls(attribute.value, blobHrefs);
        if (rewritten === undefined) element.removeAttribute(attribute.name);
        else element.setAttribute(attribute.name, rewritten);
      }
    }
  }

  const styles = [...snapshot.css, ...embeddedCss]
    .map((css) => rewriteStylesheet(css, blobHrefs))
    .filter((css) => css.trim() !== "")
    .join("\n");
  const title = parsed.createElement("title");
  title.textContent = metadata.title;
  const stylesheet = parsed.createElement("link");
  stylesheet.setAttribute("rel", "stylesheet");
  stylesheet.setAttribute("type", "text/css");
  stylesheet.setAttribute("href", "styles.css");
  parsed.head.replaceChildren(title, stylesheet);
  parsed.documentElement.setAttribute("lang", metadata.language);
  parsed.documentElement.setAttributeNS(XML_NAMESPACE, "xml:lang", metadata.language);
  parsed.documentElement.setAttributeNS(XMLNS_NAMESPACE, "xmlns", XHTML_NAMESPACE);
  parsed.documentElement.setAttributeNS(XMLNS_NAMESPACE, "xmlns:epub", EPUB_NAMESPACE);
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>${new XMLSerializer().serializeToString(parsed.documentElement)}`;
  if (/data-imposia-|\bblob:/iu.test(xhtml) || /\bblob:/iu.test(styles)) {
    throw invalidResource("EPUB semantic projection contains a page-only or unresolved resource.");
  }
  return Object.freeze({ xhtml, css: styles });
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function containerDocument(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
}

function packageDocument(metadata: ValidatedMetadata, assets: readonly EpubAsset[]): string {
  const assetItems = assets
    .map((asset) => `<item id="${asset.id}" href="${asset.href}" media-type="${asset.mediaType}"/>`)
    .join("");
  const identifier = escapeXml(metadata.identifier);
  return `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${escapeXml(metadata.language)}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier>${identifier}</dc:identifier><dc:identifier id="pub-id">${identifier}</dc:identifier><dc:title>${escapeXml(metadata.title)}</dc:title><dc:language>${escapeXml(metadata.language)}</dc:language><meta property="dcterms:modified">${metadata.modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="css" href="styles.css" media-type="text/css"/>${assetItems}</manifest><spine><itemref idref="content"/></spine></package>`;
}

function navigationDocument(metadata: ValidatedMetadata): string {
  const title = escapeXml(metadata.title);
  const language = escapeXml(metadata.language);
  return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="${XHTML_NAMESPACE}" xmlns:epub="${EPUB_NAMESPACE}" lang="${language}" xml:lang="${language}"><head><title>${title}</title></head><body><nav epub:type="toc" id="toc"><h1>${title}</h1><ol><li><a href="content.xhtml">${title}</a></li></ol></nav></body></html>`;
}

function textEntry(name: string, value: string): StoredZipEntry {
  return Object.freeze({ name, bytes: new TextEncoder().encode(value) });
}

export async function exportPageDocumentEpub(
  pageDocument: PageDocument,
  options: EpubExportOptions,
): Promise<Blob> {
  const input = recordValue(options);
  if (input === undefined) throw invalidMetadata("EPUB export options must be an object.");
  const signal = input.signal instanceof AbortSignal ? input.signal : undefined;
  throwIfAborted(signal);
  const metadata = validateMetadata(input.metadata as EpubMetadata | undefined);
  const limits = validateLimits(input.limits);
  const snapshot = requireSnapshot(pageDocument);
  const collected = await collectAssets(pageDocument, snapshot, signal);
  throwIfAborted(signal);
  requireSnapshot(pageDocument, snapshot);
  const content = sanitizeContentDocument(snapshot, metadata, collected.blobHrefs);
  const entries: StoredZipEntry[] = [
    textEntry("mimetype", EPUB_MIME_TYPE),
    textEntry("META-INF/container.xml", containerDocument()),
    textEntry("EPUB/package.opf", packageDocument(metadata, collected.assets)),
    textEntry("EPUB/nav.xhtml", navigationDocument(metadata)),
    textEntry("EPUB/content.xhtml", content.xhtml),
    textEntry("EPUB/styles.css", content.css),
    ...collected.assets.map((asset) =>
      Object.freeze({ name: asset.archivePath, bytes: asset.bytes }),
    ),
  ];
  const archive = createStoredZip(entries, limits);
  throwIfAborted(signal);
  requireSnapshot(pageDocument, snapshot);
  return new Blob([archive], { type: EPUB_MIME_TYPE });
}
