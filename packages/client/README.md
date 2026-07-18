# @imposia/client

`@imposia/client` is the browser ESM convenience entrypoint for the Core
page-document and Viewer APIs. It is framework-neutral and does not add a second
layout engine, iframe, or network boundary.

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
  { page: { size: "A4", margin: "18mm" } },
);
const pageDocument = await controller.ready;
const viewer = mountPageViewer(host, pageDocument);

viewer.setMode("single");
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
iframe; it does not clone pages or run a second layout pass. `print()` invokes
that iframe's native `Window.print()`; Save as PDF is supplied by the browser,
not by a PDF-byte export API.

The EPUB export is a browser-only, reflowable EPUB 3.3 Blob from the latest
committed semantic source. It requires `EpubMetadata` (`title`, `language`, and
`identifier`; optional `modified`), accepts optional abort and archive limits,
and includes only assets retained through Core's resolver. Page wrappers, margin
furniture, generated counters, Blob URLs, and page-only experimental artifacts
are omitted. Fixed-layout EPUB and complete CSS parity are outside this contract.

## Core extensions

The Core extension contract is available from the same entrypoint:

```ts
import { mountPageDocument, type PageExtension } from "@imposia/client";

const runningHead: PageExtension = {
  name: "example/running-head",
  decoratePage: ({ blank }) =>
    blank ? undefined : { headerHtml: "Chapter · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, { extensions: [runningHead] });
```

Extensions run in declaration order and remain inside Core's sanitizer, resolver,
warning, abort, rollback, and cleanup boundaries. The compatibility matrix in
[`docs/compatibility.md`](../../docs/compatibility.md) describes the supported
page media, fragmentation, publishing, and browser split.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
