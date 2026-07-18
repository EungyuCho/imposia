import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type Source = Readonly<{ html: string; baseUrl?: string }>;

type EpubMetadata = Readonly<{
  title: string;
  language: string;
  identifier: string;
  modified?: string;
}>;

type EpubExportOptions = Readonly<{
  metadata: EpubMetadata;
  signal?: AbortSignal;
  limits?: Readonly<{ maxEntries?: number; maxBytes?: number }>;
}>;

type CoreOptions = Readonly<{
  css?: readonly string[];
  headerTemplate?: string;
  footerTemplate?: string;
  assetResolver?: (request: {
    url: string;
    kind: "font" | "image" | "media" | "stylesheet";
    baseUrl?: string;
    signal: AbortSignal;
  }) => Promise<
    | { status: "resolved"; bytes: Uint8Array; mimeType: string; resolvedUrl?: string }
    | { status: "blocked"; reason?: string }
  >;
  extensions?: readonly {
    name: string;
    transform?: (
      input: {
        readonly html: string;
        readonly css: readonly string[];
        readonly baseUrl: string | undefined;
      },
      context: {
        readonly signal: AbortSignal;
        warn(warning: { code: `EXTENSION_${string}`; message: string }): void;
      },
    ) =>
      | { html?: string; css?: readonly string[] }
      | undefined
      | Promise<{ html?: string; css?: readonly string[] } | undefined>;
  }[];
}>;

type BrowserPageDocument = Readonly<{
  iframe: HTMLIFrameElement;
  generation: number;
  pageCount: number;
}>;

type Controller = {
  readonly ready: Promise<BrowserPageDocument>;
  readonly current: BrowserPageDocument | undefined;
  update(source: Source): Promise<BrowserPageDocument>;
  destroy(): Promise<void>;
};

type CoreModule = {
  mountPageDocument(container: HTMLElement, source: Source, options?: CoreOptions): Controller;
};

type Failure = Readonly<{ name: string; code: string; message: string }>;

type ExportResult =
  | Readonly<{ status: "fulfilled"; type: string; bytes: number[] }>
  | Readonly<{ status: "rejected"; error: Failure }>;

type ArchiveEntry = Readonly<{ name: string; method: number; bytes: Uint8Array }>;

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const METADATA: EpubMetadata = {
  title: "Imposia EPUB RED fixture",
  language: "en",
  identifier: "urn:imposia:red:epub",
  modified: "2026-07-18T00:00:00Z",
};

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function inspectArchive(bytes: Uint8Array): readonly ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("EPUB ZIP end record is missing.");
  const count = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  if (centralOffset + centralSize > bytes.byteLength)
    throw new Error("EPUB central directory is truncated.");

  const entries: ArchiveEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error("EPUB central record is invalid.");
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = text(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = text(bytes.slice(localOffset + 30, localOffset + 30 + localNameLength));
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE || localName !== name) {
      throw new Error(`EPUB local record does not match ${name}.`);
    }
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > bytes.byteLength)
      throw new Error(`EPUB data is truncated for ${name}.`);
    if (method !== 0 || compressedSize !== uncompressedSize) {
      throw new Error(`EPUB entry ${name} is not store-mode.`);
    }
    entries.push({ name, method, bytes: bytes.slice(dataOffset, dataOffset + compressedSize) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize)
    throw new Error("EPUB central record size is inconsistent.");
  return entries;
}

function entryText(entries: readonly ArchiveEntry[], name: string): string {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`Missing EPUB entry ${name}.`);
  return text(entry.bytes);
}

async function exportBytesInPage(input: {
  source: Source;
  options: EpubExportOptions;
}): Promise<ExportResult> {
  const errorDetailsInPage = (error: unknown): Failure => {
    const object = typeof error === "object" && error !== null ? error : undefined;
    const code =
      object !== undefined && "code" in object && typeof object.code === "string"
        ? object.code
        : "";
    return {
      name: error instanceof Error ? error.name : "UnknownError",
      code,
      message: error instanceof Error ? error.message : String(error),
    };
  };
  const corePath = "/packages/core/dist/index.js";
  const core = (await import(corePath)) as CoreModule;
  const host = document.body.appendChild(document.createElement("div"));
  let controller: Controller | undefined;
  try {
    controller = core.mountPageDocument(host, input.source, {});
    const pageDocument = await controller.ready;
    const candidate = Reflect.get(pageDocument, "exportEpub");
    if (typeof candidate !== "function") throw new TypeError("PageDocument.exportEpub is missing.");
    const exportEpub = candidate as (options: EpubExportOptions) => Promise<Blob>;
    const blob = await exportEpub.call(pageDocument, input.options);
    if (!(blob instanceof Blob))
      throw new TypeError("PageDocument.exportEpub did not return a Blob.");
    return {
      status: "fulfilled",
      type: blob.type,
      bytes: [...new Uint8Array(await blob.arrayBuffer())],
    };
  } catch (error: unknown) {
    return { status: "rejected", error: errorDetailsInPage(error) };
  } finally {
    await controller?.destroy();
    host.remove();
  }
}

async function assetExportInPage(): Promise<ExportResult & Readonly<{ resolverCalls?: string[] }>> {
  const pngBytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (character) => character.charCodeAt(0),
  );
  const metadata: EpubMetadata = {
    title: "Imposia EPUB RED fixture",
    language: "en",
    identifier: "urn:imposia:red:epub",
    modified: "2026-07-18T00:00:00Z",
  };
  const errorDetailsInPage = (error: unknown): Failure => {
    const object = typeof error === "object" && error !== null ? error : undefined;
    const code =
      object !== undefined && "code" in object && typeof object.code === "string"
        ? object.code
        : "";
    return {
      name: error instanceof Error ? error.name : "UnknownError",
      code,
      message: error instanceof Error ? error.message : String(error),
    };
  };
  const corePath = "/packages/core/dist/index.js";
  const core = (await import(corePath)) as CoreModule;
  const resolverCalls: string[] = [];
  const resolver = async ({
    url,
  }: {
    url: string;
  }): Promise<
    | { status: "resolved"; bytes: Uint8Array; mimeType: string; resolvedUrl?: string }
    | { status: "blocked"; reason?: string }
  > => {
    resolverCalls.push(url);
    if (url === "cover.png") return { status: "resolved", bytes: pngBytes, mimeType: "image/png" };
    return { status: "blocked" };
  };
  const host = document.body.appendChild(document.createElement("div"));
  let controller: Controller | undefined;
  try {
    controller = core.mountPageDocument(
      host,
      {
        html: '<article class="book"><h1>Semantic chapter</h1><p id="target">Target text</p><p><a href="#target">Same document</a> <a href="https://network.invalid/docs">Outbound</a></p><img src="cover.png" alt="cover"><img src="cover.png" alt="duplicate"><img src="https://network.invalid/never-fetch.png" alt="network"></article>',
        baseUrl: "https://authored.invalid/book/",
      },
      {
        css: [".book { color: rgb(1 2 3); }"],
        headerTemplate: "<span>Generated header {{pageNumber}}</span>",
        footerTemplate: "<span>Generated footer {{totalPages}}</span>",
        assetResolver: resolver as CoreOptions["assetResolver"],
      },
    );
    const pageDocument = await controller.ready;
    const candidate = Reflect.get(pageDocument, "exportEpub");
    if (typeof candidate !== "function") throw new TypeError("PageDocument.exportEpub is missing.");
    const exportEpub = candidate as (options: EpubExportOptions) => Promise<Blob>;
    const blob = await exportEpub.call(pageDocument, { metadata });
    return {
      status: "fulfilled",
      type: blob.type,
      bytes: [...new Uint8Array(await blob.arrayBuffer())],
      resolverCalls,
    };
  } catch (error: unknown) {
    return { status: "rejected", error: errorDetailsInPage(error), resolverCalls };
  } finally {
    await controller?.destroy();
    host.remove();
  }
}

type LifecycleProbe = Readonly<{
  initial: ExportResult;
  malformed: Readonly<{ status: "rejected"; error: Failure }>;
  afterMalformed: ExportResult;
  abort: Readonly<{ status: "rejected"; error: Failure }>;
  destroyed: Readonly<{ status: "rejected"; error: Failure }>;
  currentSame: boolean;
}>;

async function lifecycleProbeInPage(): Promise<LifecycleProbe> {
  const metadata: EpubMetadata = {
    title: "Imposia EPUB RED fixture",
    language: "en",
    identifier: "urn:imposia:red:epub",
    modified: "2026-07-18T00:00:00Z",
  };
  const errorDetailsInPage = (error: unknown): Failure => {
    const object = typeof error === "object" && error !== null ? error : undefined;
    const code =
      object !== undefined && "code" in object && typeof object.code === "string"
        ? object.code
        : "";
    return {
      name: error instanceof Error ? error.name : "UnknownError",
      code,
      message: error instanceof Error ? error.message : String(error),
    };
  };
  const corePath = "/packages/core/dist/index.js";
  const core = (await import(corePath)) as CoreModule;
  const host = document.body.appendChild(document.createElement("div"));
  let controller: Controller | undefined;
  const runExport = async (
    pageDocument: BrowserPageDocument,
    options: EpubExportOptions,
  ): Promise<ExportResult> => {
    try {
      const candidate = Reflect.get(pageDocument, "exportEpub");
      if (typeof candidate !== "function")
        throw new TypeError("PageDocument.exportEpub is missing.");
      const exportEpub = candidate as (nextOptions: EpubExportOptions) => Promise<Blob>;
      const blob = await exportEpub.call(pageDocument, options);
      return {
        status: "fulfilled",
        type: blob.type,
        bytes: [...new Uint8Array(await blob.arrayBuffer())],
      };
    } catch (error: unknown) {
      return { status: "rejected", error: errorDetailsInPage(error) };
    }
  };
  try {
    controller = core.mountPageDocument(host, { html: "<article>Stable generation</article>" }, {});
    const pageDocument = await controller.ready;
    const initial = await runExport(pageDocument, { metadata });
    const malformed = await runExport(pageDocument, {
      metadata: { title: "", language: "", identifier: "" },
    });
    const afterMalformed = await runExport(pageDocument, { metadata });
    const abortController = new AbortController();
    abortController.abort();
    const abort = await runExport(pageDocument, {
      metadata,
      signal: abortController.signal,
    });
    const currentSameBeforeDestroy = controller.current === pageDocument;
    await controller.destroy();
    const destroyed = await runExport(pageDocument, { metadata });
    return {
      initial,
      malformed:
        malformed.status === "rejected"
          ? malformed
          : {
              status: "rejected",
              error: { name: "UnexpectedSuccess", code: "", message: "metadata was accepted" },
            },
      afterMalformed,
      abort:
        abort.status === "rejected"
          ? abort
          : {
              status: "rejected",
              error: { name: "UnexpectedSuccess", code: "", message: "abort was ignored" },
            },
      destroyed:
        destroyed.status === "rejected"
          ? destroyed
          : {
              status: "rejected",
              error: { name: "UnexpectedSuccess", code: "", message: "destroy was ignored" },
            },
      currentSame: currentSameBeforeDestroy,
    };
  } finally {
    await controller?.destroy();
    host.remove();
  }
}

type AtomicProbe = Readonly<{
  update: Failure;
  currentSame: boolean;
  before: ExportResult;
  after: ExportResult;
  transformCalls: number;
  resolverCalls: number;
}>;

async function atomicProbeInPage(): Promise<AtomicProbe> {
  const pngBytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (character) => character.charCodeAt(0),
  );
  const metadata: EpubMetadata = {
    title: "Imposia EPUB RED fixture",
    language: "en",
    identifier: "urn:imposia:red:epub",
    modified: "2026-07-18T00:00:00Z",
  };
  const errorDetailsInPage = (error: unknown): Failure => {
    const object = typeof error === "object" && error !== null ? error : undefined;
    const code =
      object !== undefined && "code" in object && typeof object.code === "string"
        ? object.code
        : "";
    return {
      name: error instanceof Error ? error.name : "UnknownError",
      code,
      message: error instanceof Error ? error.message : String(error),
    };
  };
  const corePath = "/packages/core/dist/index.js";
  const core = (await import(corePath)) as CoreModule;
  const host = document.body.appendChild(document.createElement("div"));
  let controller: Controller | undefined;
  let transformCalls = 0;
  let resolverCalls = 0;
  const resolver = async (): Promise<{
    status: "resolved";
    bytes: Uint8Array;
    mimeType: string;
  }> => {
    resolverCalls += 1;
    return { status: "resolved", bytes: pngBytes, mimeType: "image/png" };
  };
  const extension = {
    name: "red/export-observer",
    transform(input: { readonly html: string }) {
      transformCalls += 1;
      return { html: input.html };
    },
  };
  const runExport = async (pageDocument: BrowserPageDocument): Promise<ExportResult> => {
    try {
      const candidate = Reflect.get(pageDocument, "exportEpub");
      if (typeof candidate !== "function")
        throw new TypeError("PageDocument.exportEpub is missing.");
      const exportEpub = candidate as (options: EpubExportOptions) => Promise<Blob>;
      const blob = await exportEpub.call(pageDocument, { metadata });
      return {
        status: "fulfilled",
        type: blob.type,
        bytes: [...new Uint8Array(await blob.arrayBuffer())],
      };
    } catch (error: unknown) {
      return { status: "rejected", error: errorDetailsInPage(error) };
    }
  };
  try {
    controller = core.mountPageDocument(
      host,
      { html: '<img src="cover.png"><p>Committed content</p>' },
      { assetResolver: resolver as CoreOptions["assetResolver"], extensions: [extension] },
    );
    const pageDocument = await controller.ready;
    const before = await runExport(pageDocument);
    const callsAfterReady = { transformCalls, resolverCalls };
    let updateFailure: Failure = {
      name: "UnexpectedSuccess",
      code: "",
      message: "update was accepted",
    };
    try {
      await controller.update({ lightDom: {} as Element } as unknown as Source);
    } catch (error: unknown) {
      updateFailure = errorDetailsInPage(error);
    }
    const after = await runExport(pageDocument);
    return {
      update: updateFailure,
      currentSame: controller.current === pageDocument,
      before,
      after,
      transformCalls: transformCalls - callsAfterReady.transformCalls,
      resolverCalls: resolverCalls - callsAfterReady.resolverCalls,
    };
  } finally {
    await controller?.destroy();
    host.remove();
  }
}

type LimitProbe = Readonly<{
  normal: ExportResult;
  entries: ExportResult;
  bytes: ExportResult;
  path: ExportResult;
}>;

async function limitProbeInPage(): Promise<LimitProbe> {
  const pngBytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (character) => character.charCodeAt(0),
  );
  const metadata: EpubMetadata = {
    title: "Imposia EPUB RED fixture",
    language: "en",
    identifier: "urn:imposia:red:epub",
    modified: "2026-07-18T00:00:00Z",
  };
  const errorDetailsInPage = (error: unknown): Failure => {
    const object = typeof error === "object" && error !== null ? error : undefined;
    const code =
      object !== undefined && "code" in object && typeof object.code === "string"
        ? object.code
        : "";
    return {
      name: error instanceof Error ? error.name : "UnknownError",
      code,
      message: error instanceof Error ? error.message : String(error),
    };
  };
  const corePath = "/packages/core/dist/index.js";
  const core = (await import(corePath)) as CoreModule;
  const png = pngBytes;
  const resolver = async ({
    url,
  }: {
    url: string;
  }): Promise<{
    status: "resolved";
    bytes: Uint8Array;
    mimeType: string;
    resolvedUrl?: string;
  }> => ({
    status: "resolved",
    bytes: png,
    mimeType: "image/png",
    resolvedUrl: url,
  });
  const run = async (html: string, options: EpubExportOptions): Promise<ExportResult> => {
    const host = document.body.appendChild(document.createElement("div"));
    let controller: Controller | undefined;
    try {
      controller = core.mountPageDocument(
        host,
        { html },
        { assetResolver: resolver as CoreOptions["assetResolver"] },
      );
      const pageDocument = await controller.ready;
      const candidate = Reflect.get(pageDocument, "exportEpub");
      if (typeof candidate !== "function")
        throw new TypeError("PageDocument.exportEpub is missing.");
      const exportEpub = candidate as (nextOptions: EpubExportOptions) => Promise<Blob>;
      const blob = await exportEpub.call(pageDocument, options);
      return {
        status: "fulfilled",
        type: blob.type,
        bytes: [...new Uint8Array(await blob.arrayBuffer())],
      };
    } catch (error: unknown) {
      return { status: "rejected", error: errorDetailsInPage(error) };
    } finally {
      await controller?.destroy();
      host.remove();
    }
  };
  const safe = '<img src="same.png"><img src="same.png"><p>safe duplicate reference</p>';
  return {
    normal: await run(safe, { metadata }),
    entries: await run(safe, { metadata, limits: { maxEntries: 2 } }),
    bytes: await run(safe, { metadata, limits: { maxBytes: 1 } }),
    path: await run('<img src="../evil.png">', { metadata }),
  };
}

function assertNoBrowserErrors(errors: readonly unknown[], pageErrors: readonly string[]): void {
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
}

test("returns a store-mode EPUB Blob with coherent metadata, manifest, spine, nav, content, and CSS", async ({
  page,
  browserName,
}) => {
  const captured = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const result = await page.evaluate(exportBytesInPage, {
      source: {
        html: '<style>.chapter { color: red; }</style><article class="chapter"><h1>RED chapter</h1><p>Semantic body</p></article>',
      },
      options: { metadata: METADATA },
    });
    expect(result.status).toBe("fulfilled");
    if (result.status !== "fulfilled") throw new Error(result.error.message);
    expect(result.type).toBe("application/epub+zip");
    const entries = inspectArchive(Uint8Array.from(result.bytes));
    expect(entries[0]?.name).toBe("mimetype");
    expect(entries[0]?.method).toBe(0);
    expect(text(entries[0]?.bytes ?? new Uint8Array())).toBe("application/epub+zip");
    expect(entries.map(({ name }) => name)).toEqual([
      "mimetype",
      "META-INF/container.xml",
      "EPUB/package.opf",
      "EPUB/nav.xhtml",
      "EPUB/content.xhtml",
      "EPUB/styles.css",
    ]);
    const container = entryText(entries, "META-INF/container.xml");
    const opf = entryText(entries, "EPUB/package.opf");
    const nav = entryText(entries, "EPUB/nav.xhtml");
    const content = entryText(entries, "EPUB/content.xhtml");
    expect(container).toContain('full-path="EPUB/package.opf"');
    expect(opf).toContain("<dc:title>Imposia EPUB RED fixture</dc:title>");
    expect(opf).toContain("<dc:language>en</dc:language>");
    expect(opf).toContain("<dc:identifier>urn:imposia:red:epub</dc:identifier>");
    expect(opf).toContain("2026-07-18T00:00:00Z");
    expect(opf).toContain('id="nav"');
    expect(opf).toContain('href="nav.xhtml"');
    expect(opf).toContain('id="content"');
    expect(opf).toContain('href="content.xhtml"');
    expect(opf).toContain('id="css"');
    expect(opf).toContain('href="styles.css"');
    expect(opf).toContain('media-type="application/xhtml+xml"');
    expect(opf).toContain('media-type="text/css"');
    expect(opf).toContain('properties="nav"');
    expect(opf).toContain('idref="content"');
    expect(nav).toContain('href="content.xhtml"');
    expect(content).toContain("Semantic body");
    expect(entryText(entries, "EPUB/styles.css")).toContain(".chapter");
  } finally {
    assertNoBrowserErrors(captured.errors, captured.pageErrors);
  }
});

test("exports semantic links and resolver assets without page furniture, blob URLs, duplicates, or authored fetches", async ({
  page,
  browserName,
}) => {
  const captured = captureBrowserErrors(page, browserName);
  const networkRequests: string[] = [];
  const routeHandler = async (route: import("@playwright/test").Route): Promise<void> => {
    networkRequests.push(route.request().url());
    await route.abort();
  };
  await page.route("**://network.invalid/**", routeHandler);
  await page.goto("/examples/book.html");
  try {
    const result = await page.evaluate(assetExportInPage);
    expect(result.status).toBe("fulfilled");
    if (result.status !== "fulfilled") throw new Error(result.error.message);
    expect(result.resolverCalls).toContain("cover.png");
    expect(networkRequests).toEqual([]);
    const entries = inspectArchive(Uint8Array.from(result.bytes));
    const names = entries.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    const assets = entries.filter(({ name }) => name.startsWith("EPUB/assets/"));
    expect(assets).toHaveLength(1);
    expect(entryText(entries, "EPUB/package.opf")).toContain('media-type="image/png"');
    const content = entryText(entries, "EPUB/content.xhtml");
    expect(content).toContain('href="#target"');
    expect(content).toContain('href="https://network.invalid/docs"');
    expect(content).not.toContain("data-imposia-page");
    expect(content).not.toContain("data-imposia-page-header");
    expect(content).not.toContain("data-imposia-page-footer");
    expect(content).not.toContain("data-imposia-");
    expect(content).not.toContain("blob:");
    expect(content).not.toMatch(
      /pageNumber|totalPages|page-number|Generated header|Generated footer/,
    );
    expect(content).not.toContain("network.invalid/never-fetch.png");
  } finally {
    await page.unroute("**://network.invalid/**", routeHandler);
    assertNoBrowserErrors(captured.errors, captured.pageErrors);
  }
});

test("rejects malformed metadata, AbortSignal, and destroyed-document exports atomically", async ({
  page,
  browserName,
}) => {
  const captured = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const result = await page.evaluate(lifecycleProbeInPage);
    expect(result.initial.status).toBe("fulfilled");
    expect(result.malformed.error.code).toBe("INVALID_EPUB_METADATA");
    expect(result.afterMalformed.status).toBe("fulfilled");
    if (result.initial.status === "fulfilled" && result.afterMalformed.status === "fulfilled") {
      expect(result.afterMalformed.bytes).toEqual(result.initial.bytes);
    }
    expect(result.abort.error.name).toBe("AbortError");
    expect(result.destroyed.error.message).toMatch(/destroyed/i);
    expect(result.currentSame).toBe(true);
  } finally {
    assertNoBrowserErrors(captured.errors, captured.pageErrors);
  }
});

test("retains the last committed generation after a failed update and does not rerun extensions or resolvers", async ({
  page,
  browserName,
}) => {
  const captured = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const result = await page.evaluate(atomicProbeInPage);
    expect(result.update.name).toBe("TypeError");
    expect(result.currentSame).toBe(true);
    expect(result.before.status).toBe("fulfilled");
    expect(result.after.status).toBe("fulfilled");
    if (result.before.status === "fulfilled" && result.after.status === "fulfilled") {
      expect(result.after.bytes).toEqual(result.before.bytes);
    }
    expect(result.transformCalls).toBe(0);
    expect(result.resolverCalls).toBe(0);
  } finally {
    assertNoBrowserErrors(captured.errors, captured.pageErrors);
  }
});

test("enforces entry and byte ceilings, sanitizes traversal, and deduplicates repeated asset references", async ({
  page,
  browserName,
}) => {
  const captured = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const result = await page.evaluate(limitProbeInPage);
    expect(result.normal.status).toBe("fulfilled");
    if (result.normal.status === "fulfilled") {
      const entries = inspectArchive(Uint8Array.from(result.normal.bytes));
      const names = entries.map(({ name }) => name);
      expect(new Set(names).size).toBe(names.length);
      expect(entries.filter(({ name }) => name.startsWith("EPUB/assets/")).length).toBe(1);
    }
    expect(result.entries.status).toBe("rejected");
    expect(result.bytes.status).toBe("rejected");
    if (result.path.status === "fulfilled") {
      for (const entry of inspectArchive(Uint8Array.from(result.path.bytes))) {
        expect(entry.name).not.toContain("..");
        expect(entry.name).not.toMatch(/^\//);
      }
    } else {
      expect(result.path.error.message).toMatch(/path|archive|resource|epub/i);
    }
  } finally {
    assertNoBrowserErrors(captured.errors, captured.pageErrors);
  }
});
