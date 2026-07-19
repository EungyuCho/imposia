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

## Theme modules

The Viewer shell is themed through the public `--imposia-viewer-*` custom
properties declared by `@imposia/viewer/styles.css`. A theme is an ordinary CSS
module loaded after the package stylesheet, so it can be published or composed
like a plugin without adding a second runtime lifecycle:

```css
/* viewer-theme.css */
.imposia-viewer {
  --imposia-viewer-color-ink: #171522;
  --imposia-viewer-color-ink-soft: #28233b;
  --imposia-viewer-color-paper: #fff8e8;
  --imposia-viewer-color-accent: #8b6cff;
  --imposia-viewer-font-serif: "Iowan Old Style", Georgia, serif;
  --imposia-viewer-control-size: 40px;
}
```

```ts
import "@imposia/viewer/styles.css";
import "./viewer-theme.css";
```

Scope the overrides to a parent selector when different viewer instances need
different themes. The tokens cover the shell palette, spacing, typography,
controls, borders, and shadows. They do not cross Core's iframe isolation or
change the authored document CSS; pass document styles through Core's `css`
input instead.

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
