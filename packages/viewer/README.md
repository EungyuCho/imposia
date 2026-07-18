# @imposia/viewer

`@imposia/viewer` is a browser ESM viewer for PDF documents and for Core's
canonical page document. It presents an existing document; it is not a renderer
or a PDF-byte exporter.

## Install

```bash
pnpm add @imposia/viewer
```

## View a PDF

```ts
import { mountViewer } from "@imposia/viewer";
import "@imposia/viewer/styles.css";

const viewer = mountViewer(document.querySelector<HTMLElement>("#viewer")!, "/book.pdf", {
  workerSrc: "/pdf.worker.min.mjs",
});

viewer.setZoom(1.2);
viewer.setMode("single");
```

`mountViewer()` uses PDF.js and supports continuous and single-page modes in
Chromium, Firefox, and WebKit.

## Present a Core page document

```ts
import { mountPageViewer } from "@imposia/viewer";

const pageViewer = mountPageViewer(host, pageDocument);
pageViewer.setMode("single");
await pageViewer.print();
```

`mountPageViewer()` retains Core's exact canonical iframe. Its `host` must be the
iframe's current parent, and it is currently a Chromium-reference presentation
surface. `print()` invokes that iframe's native `Window.print()`; the browser may
offer Save as PDF, but this package does not produce PDF bytes. For reflowable
EPUB export, call `pageDocument.exportEpub()` through Core, Client, or React.

See the [compatibility matrix](../../docs/compatibility.md) for browser support,
constrained fragmentation, and the explicit fixed-layout/complete-parity limits.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
