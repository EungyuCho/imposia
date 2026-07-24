# @imposia/client

`@imposia/client` is the browser ESM convenience entrypoint for the Core
page-document and Viewer APIs. It is framework-neutral and does not add a second
layout engine, iframe, or network boundary.

Rapid source updates retain the previous committed page sequence while Core
stages a replacement. Viewer navigation and print continue to target the one
current canonical iframe.

## Install

```bash
pnpm add @imposia/client
```

## Mount, present, print, and export

```ts
import {
  mountPageDocument,
  mountPageViewer,
  type EpubMetadata,
} from "@imposia/client";
import "@imposia/client/styles.css";

const host = document.querySelector<HTMLElement>("#preview")!;
const controller = mountPageDocument(
  host,
  { html: "<article><h1>Hello</h1></article>" },
  {
    page: { size: "A4", margin: "18mm" },
    compose: { yieldBudgetMs: 8 },
  },
);
const pageDocument = await controller.ready;
const viewer = mountPageViewer(host, pageDocument, {
  mode: "spread",
  spread: { cover: true },
  inspector: true,
  theme: {
    "--imposia-viewer-color-accent": "#8b6cff",
    "--imposia-viewer-control-size": "40px",
  },
});

viewer.setMode("single");
viewer.setMode("spread");
viewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
viewer.inspector?.open();
await viewer.print();

const metadata: EpubMetadata = {
  title: "Hello",
  language: "en",
  identifier: "urn:example:hello",
};
const epub = await pageDocument.exportEpub({ metadata });
console.log(epub.type); // application/epub+zip
```

The entrypoint re-exports the Core page-document API and types together with the
Viewer APIs and types. `mountPageViewer()` presents Core's existing canonical
iframe; it does not clone pages or run a second layout pass. `print()` uses a
transient isolated top-document snapshot of the committed pages before invoking
the native `Window.print()`; Save as PDF is supplied by the browser, not by a
PDF-byte export API.

The entrypoint also re-exports `PageComposeOptions` and
`PageComposeProgress`. Cooperative pagination defaults to an 8 ms main-thread
budget; progress is pass-local staging information and does not replace the
atomic committed-document contract.

`PageViewerMode` adds `spread` to the page-document Viewer's existing
`continuous` and `single` choices without changing the PDF Viewer's
`ViewerMode`. A cover spread keeps page 1 alone, and narrow containers
temporarily expose `state.effectiveMode === "single"` while preserving the
requested mode and current global page.

Set `controls: false` to retain navigation, mode, zoom, responsive spread, and
print behavior without the built-in rail. Compose host controls with
`goToPage()`, `nextPage()`, `previousPage()`, `setMode()`, and `setZoom()`;
`subscribe(listener)` immediately emits the current `PageViewerState` and
returns an unsubscribe function. Client's Viewer stylesheet is scoped to the
Viewer root and does not mutate the host document's `body`, `:root`, or
unrelated elements.

`ViewerTheme` is a typed map of `--imposia-viewer-*` custom properties. Themes
are scoped to one Viewer shell, can be replaced with `setTheme()`, and never
cross the canonical iframe into authored document styles.

`inspector: true` adds Viewer's opt-in diagnostics panel. Its state contains only
the current immutable `PageDocument.warnings`. Selecting a located warning
uses the existing page navigation path and a temporary, non-layout screen
outline. Refresh and destroy remove stale warning state and highlighting. The
panel is not part of native iframe printing or semantic EPUB export. Client
re-exports `ViewerInspectorController` and `ViewerInspectorState` for custom
controls.

For a custom presentation-only overlay, Client also re-exports Core's
`pageWarningTargetBounds(pageDocument, warning)`. It returns frozen numeric
bounds for a current trusted source fragment without exposing or marking the
canonical DOM.

Client re-exports `validatePageViewerOptions(pageDocument, options)` for adapters
that must validate a structural Viewer replacement before tearing down the
working presentation.

The EPUB export is a browser-only, reflowable EPUB 3.3 Blob from the latest
committed semantic source. It requires `EpubMetadata` (`title`, `language`, and
`identifier`; optional `modified`), accepts optional abort and archive limits,
and includes only assets retained through Core's resolver. Page wrappers, margin
furniture, generated counters, Blob URLs, and page-only experimental artifacts
are omitted. Fixed-layout EPUB and complete CSS parity are outside this contract.

## Mount an ordered Publication

`mountPublication` is a direct Core re-export. Client adds no wrapper, controller,
iframe, or runtime boundary around the Publication lifecycle.

```ts
import { mountPublication, type PublicationSnapshot } from "@imposia/client";

const snapshot: PublicationSnapshot = {
  metadata: {
    title: "Field Notes",
    language: "en",
    identifier: "urn:example:field-notes",
  },
  entries: [
    { id: "cover", title: "Cover", html: "<h1>Field Notes</h1>" },
    { id: "chapter", title: "Chapter", html: "<h1>First chapter</h1>" },
  ],
};

const controller = mountPublication(host, snapshot);
const publication = await controller.ready;
const chapter = publication.outline[1]?.destination;

if (chapter !== undefined) controller.navigate(chapter);

const reader = mountPageViewer(host, publication, {
  reader: {
    controller,
    onDeepLinkChange: (value) =>
      history.replaceState(
        null,
        "",
        value === undefined ? `${location.pathname}${location.search}` : `#${value}`,
      ),
  },
});
if (chapter !== undefined) reader.reader?.navigate(chapter);

const matches = reader.reader?.search("first chapter") ?? [];
if (matches[0] !== undefined) reader.reader?.selectSearchResult(matches[0]);

const thumbnails = reader.reader?.state.thumbnails ?? [];
if (thumbnails[0] !== undefined) reader.reader?.selectThumbnail(thumbnails[0]);

const epub = await publication.exportEpub({
  metadata: {
    title: snapshot.metadata.title,
    language: snapshot.metadata.language ?? "en",
    identifier: snapshot.metadata.identifier ?? "urn:example:field-notes",
  },
});
```

`controller.update(nextSnapshot)` replaces the whole snapshot and atomically
commits metadata, ordered entries, shared outline, page ranges, and page content.
Resolve destinations again after each commit. Publication EPUB spine order
matches the committed entry order, and its navigation comes from the same shared
outline. Export uses resolver-retained assets and never fetches source URLs.
Client also re-exports Viewer's Publication Reader. Its table of contents is a
projection of the same committed outline, and its URL-safe deep links resolve
through the current Core controller rather than storing a stale generation. Its
search API returns only immutable entry metadata, global pages, plain-text
excerpts, and current-generation destinations from sanitized visible committed
text. Snapshot replacement rebuilds the index and removes stale results.
Client also re-exports `PublicationThumbnail` and the Reader thumbnail methods.
The immutable models use committed page metadata and cap their abstract preview
at six line marks per page. They do not clone authored DOM, create another
iframe, rasterize pages, or run pagination. Snapshot replacement discards the
old models; `selectThumbnail()` rejects a retained stale model.

## Core extensions

The Core extension contract is available from the same entrypoint:

```ts
import { mountPageDocument, type PageExtension } from "@imposia/client";

const lastPageFooter: PageExtension = {
  name: "example/last-page-footer",
  decoratePage: ({ blank, number, totalPages }) =>
    blank || number !== totalPages
      ? undefined
      : { footerHtml: "The End · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, { extensions: [lastPageFooter] });
```

Extensions run in declaration order and remain inside Core's sanitizer, resolver,
warning, abort, rollback, and cleanup boundaries. The compatibility matrix in
[`docs/compatibility.md`](../../docs/compatibility.md) describes the supported
page media, fragmentation, publishing, and browser split.

Client also re-exports `PublicationExtension`. Its `transformEntry` callback
receives frozen publication and entry metadata plus copied string input. It can
return only `html` and `css` strings or emit namespaced diagnostics. Core removes
executable markup and normalizes CSS before the callback; the extension cannot
access the composed Publication DOM, canonical iframe, or resolver. Cleanup
registered with `context.onCleanup()` runs after success, failure, abort,
supersession, and destroy-driven cancellation.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
