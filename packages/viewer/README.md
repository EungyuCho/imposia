# @imposia/viewer

`@imposia/viewer` is a browser ESM viewer for PDF documents and for Core's canonical page document.

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

`mountViewer()` uses PDF.js and supports continuous and single-page modes in Chromium, Firefox, and WebKit.

## Present a Core page document

```ts
import { mountPageViewer } from "@imposia/viewer";

const pageViewer = mountPageViewer(host, pageDocument);
await pageViewer.print();
```

`mountPageViewer()` retains Core's exact iframe. Its `host` must be the iframe's current parent, and it is currently a Chromium-reference surface.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
