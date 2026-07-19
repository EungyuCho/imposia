# @imposia/core

`@imposia/core` is the browser ESM API for creating a sanitized, paginated page
document in one isolated canonical iframe. It is the framework-neutral source of
truth and can be used directly without React, Node, or a CLI.

## Install

```bash
pnpm add @imposia/core
```

## Mount and inspect a page document

```ts
import { mountPageDocument } from "@imposia/core";

const controller = mountPageDocument(
  document.querySelector<HTMLElement>("#preview")!,
  { html: "<article><h1>Hello</h1><p>Browser page DOM</p></article>" },
  {
    page: { size: "A4", orientation: "portrait", margin: "18mm" },
  },
);
const pageDocument = await controller.ready;

console.log(pageDocument.pageCount, pageDocument.pages, pageDocument.warnings);
```

`PageMetadata` includes normalized sheet/content geometry, page side and name,
blank state, context, and ordered body text. Supported authored `@page` selectors
and six margin boxes, breaks, constrained tables/flex/grid/multi-column layout,
local references, and named strings are described in the [compatibility matrix](../../docs/compatibility.md).
Structural pagination is a Chromium-reference behavior; this package does not
claim complete CSS parity across engines.

Local `target-counter()` and `target-text()` support is intentionally bounded to
top-level `::before`/`::after` rules. It follows authored `content` importance,
specificity, and source order. Keep marker styling in the same rule as the target
function; conditional/layered target content and competing conditional
pseudo-content recover with a typed warning instead of being flattened.

## Resolver-only assets and ordered extensions

Core accepts an optional `assetResolver`. Every discovered HTML or CSS resource
must pass through that resolver before Core creates a Blob URL inside the frame.
Authored URLs do not fetch directly; Core-owned URLs are revoked on replacement,
failure, and destroy. Input, resolver output, and extension output remain subject
to sanitization, limits, abort, rollback, warnings, and cleanup.

Ordered extensions can transform string input, filter resolver requests, and add
page decorations without receiving DOM or network access:

```ts
import { mountPageDocument, type PageExtension } from "@imposia/core";

const runningHead: PageExtension = {
  name: "example/running-head",
  decoratePage: ({ blank }) =>
    blank ? undefined : { headerHtml: "Chapter · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, { extensions: [runningHead] });
```

Extension order is fixed for the controller lifetime. Extensions cannot replace
the resolver, access the canonical DOM, weaken limits/CSP, or change lifecycle
atomicity.

## Reflowable EPUB export

`PageDocument.exportEpub()` returns a browser `Blob` with MIME type
`application/epub+zip` from the latest committed semantic source:

```ts
const epub = await pageDocument.exportEpub({
  metadata: {
    title: "Hello",
    language: "en",
    identifier: "urn:example:hello",
    modified: "2026-07-19T00:00:00Z",
  },
  limits: { maxEntries: 512, maxBytes: 16 * 1024 * 1024 },
});

const downloadUrl = URL.createObjectURL(epub);
const link = document.createElement("a");
link.href = downloadUrl;
link.download = "hello.epub";
link.click();
setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
```

`title`, `language`, and `identifier` are required; `modified`, `signal`,
`maxEntries`, and `maxBytes` are optional and bounded. Export does not rerun
extensions or resolvers. The archive is reflowable EPUB 3.3, uses retained
resolver bytes only, and omits page wrappers, margin furniture, generated page
counters, Blob URLs, and page-only experimental artifacts. It is not a
fixed-layout EPUB or PDF-byte exporter.

When an update is in flight, both `exportEpub()` and `controller.print()` wait
for the same latest successful committed generation. A failed update keeps the
previous committed document available; `destroy()` aborts pending publishing
work and waits for it to settle before it resolves.

Printing remains native browser printing:

```ts
await controller.print(); // invokes the current canonical iframe's Window.print()
```

The canonical iframe sandbox permits modals only so this native print dialog can
open; authored scripts remain disabled by the sandbox and CSP. The browser can
offer Save as PDF from the print dialog; Core does not return PDF bytes. Call
`controller.destroy()` when the host is no longer needed.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
