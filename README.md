# Imposia

Imposia is a React-first, browser-only HTML/CSS publishing toolkit. The browser
ESM packages share one Core-owned canonical page iframe for pagination, preview,
and native print. Core can be used directly without React; there is no Node
runtime, CLI renderer, server export, or full CSS-parity promise.

## Packages

- `@imposia/core`: browser-only `mountPageDocument()` API, sanitized canonical
  page-DOM pagination, normalized page media, constrained fragmentation and
  publishing content, resolver-mediated assets, and reflowable EPUB Blob export.
- `@imposia/client`: browser-only convenience entrypoint for the Core
  page-document and Viewer APIs.
- `@imposia/react`: primary React adapter with `ImposiaPageViewer`,
  `ImposiaDocument`, `useImposiaDocument()`, and the imperative page handle.
- `@imposia/viewer`: accessible continuous/single-page PDF canvas viewer for
  Chromium, Firefox, and WebKit, plus `mountPageViewer()` for presenting the
  existing canonical Core iframe in Chromium.

The authoritative capability and browser matrix is
[`docs/compatibility.md`](docs/compatibility.md). It distinguishes Stable,
Experimental, Constrained, and Unsupported behavior; constrained CSS subsets are
not claims of complete CSS parity.

## Install and build

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm preflight
pnpm build
```

Published packages are browser ESM libraries. Each package tarball contains its
own README, license, and third-party notices.

## Browser Core API

```ts
import { mountPageDocument } from "@imposia/core";

const controller = mountPageDocument(
  document.querySelector("#preview")!,
  {
    html: "<article><h1>Hello</h1><p>Browser page DOM</p></article>",
  },
  {
    page: { size: "A4", margin: "18mm" },
  },
);

const pageDocument = await controller.ready;
console.log(pageDocument.pageCount, pageDocument.pages, pageDocument.warnings);

const epub = await pageDocument.exportEpub({
  metadata: {
    title: "Hello",
    language: "en",
    identifier: "urn:example:hello",
  },
});
// epub is a reflowable application/epub+zip Blob, not a fixed-layout export.
```

Core paginates one canonical document in an isolated iframe. HTML and CSS assets
are discovered through the optional `assetResolver`; authored URLs never become
frame requests, and resolved bytes become Core-owned Blob URLs that are revoked
on replacement, failure, or destroy. `PageDocument.exportEpub()` serializes the
latest committed semantic source, does not rerun extensions or resolvers, and
enforces metadata, archive-size, entry-count, abort, and lifecycle limits.

Core page options normalize A4/Letter or custom dimensions, orientation, and
absolute margins. Supported authored `@page` selectors and six margin boxes,
breaks, tables, safe flex/grid, local references, and named strings are described
in the [support matrix](docs/compatibility.md); multicol is a constrained path,
while footnotes and page floats remain explicitly bounded opt-in experiments.

## Unified client API

```ts
import {
  mountPageDocument,
  mountPageViewer,
  type EpubMetadata,
} from "@imposia/client";
import "@imposia/client/styles.css";

const host = document.querySelector<HTMLElement>("#preview")!;
const controller = mountPageDocument(host, { html: "<article><h1>Hello</h1></article>" });
const pageDocument = await controller.ready;
const viewer = mountPageViewer(host, pageDocument);

viewer.setMode("single");
const metadata: EpubMetadata = {
  title: "Hello",
  language: "en",
  identifier: "urn:example:hello",
};
const epub = await pageDocument.exportEpub({ metadata });
```

The client entrypoint re-exports the Core page-document types and the Viewer
types. `mountPageViewer()` presents the exact iframe created by Core; it does not
clone pages or run a second layout pass.

## React API

The adapter owns the same controller and iframe through React effects. The
imperative ref is useful for actions that should target the committed document:

```tsx
import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
  type EpubExportOptions,
} from "@imposia/react";
import { useRef } from "react";
import "@imposia/react/styles.css";

export function BookPreview() {
  const handle = useRef<ImposiaPageViewerHandle>(null);
  const epubOptions: EpubExportOptions = {
    metadata: { title: "Hello", language: "en", identifier: "urn:example:hello" },
  };
  return (
    <>
      <ImposiaPageViewer
        ref={handle}
        source={{ html: "<article><h1>Hello</h1></article>" }}
        onReady={(pageDocument) => console.log(pageDocument.pageCount)}
        onError={(error) => console.error(error)}
      />
      <button type="button" onClick={() => void handle.current?.print()}>
        Print
      </button>
      <button
        type="button"
        onClick={async () => {
          const pageDocument = handle.current?.current;
          if (pageDocument === undefined) return;
          const blob = await handle.current?.exportEpub(epubOptions);
          console.log(pageDocument.pageCount, blob?.type);
        }}
      >
        Export EPUB
      </button>
    </>
  );
}
```

For custom presentation, `useImposiaDocument()` exposes the same lifecycle
without creating a second Core mount:

```tsx
import { useImposiaDocument } from "@imposia/react";

export function CustomPreview({ html }: { html: string }) {
  const { hostRef, state, controller } = useImposiaDocument({ source: { html } });
  return (
    <section>
      <div ref={hostRef} data-status={state.status} />
      <button type="button" disabled={state.status !== "ready"} onClick={() => void controller?.print()}>
        Print
      </button>
      {state.document === undefined ? null : <output>{state.document.pageCount} pages</output>}
    </section>
  );
}
```

The React API does not promise fixed-layout EPUB, PDF bytes, a second layout
engine, or complete CSS parity. Native browser Save as PDF remains available
through `print()`.

## Viewer APIs

```ts
import { mountViewer } from "@imposia/viewer";
import "@imposia/viewer/styles.css";

const viewer = mountViewer(document.querySelector("#viewer")!, "/book.pdf", {
  workerSrc: "/pdf.worker.min.mjs",
});

viewer.nextPage();
viewer.setZoom(1.2);
viewer.setMode("single");
```

For the browser Core page document, mount the canonical iframe in the same
container where it was created:

```ts
import { mountPageViewer } from "@imposia/viewer";

const pageViewer = mountPageViewer(document.querySelector("#preview")!, pageDocument);
pageViewer.setMode("single");
await pageViewer.print();
```

`mountPageViewer()` retains the exact Core iframe and refreshes only to a newer
generation from that controller. It is currently a Chromium-reference surface;
the PDF.js `mountViewer()` API remains the cross-browser PDF viewer.

See [`examples/viewer/index.html`](examples/viewer/index.html) for no-framework
integration and [`docs/routing.md`](docs/routing.md) for contracts, compatibility,
architecture, clean-room rationale, and verification evidence.

## Interactive demo

The React-first publishing lab at [`examples/demo`](examples/demo) demonstrates
live source updates, page metrics, normalized page media, margin boxes, the
ordered running-head extension, constrained publishing cases, Viewer controls,
and browser EPUB export.

```bash
pnpm build
node scripts/serve-viewer.mjs
```

Open `http://127.0.0.1:4178/examples/demo/`.

## Verification

`pnpm check` runs type checking, lint, unit tests, build, browser E2E, and the
release/dependency license audit. `pnpm setup:browsers` provisions the declared
browser engines. Detailed commands and captured artifacts are listed in
[`docs/verification.md`](docs/verification.md).

Imposia is Apache-2.0 licensed. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
and the contributor checklist in [`docs/clean-room.md`](docs/clean-room.md). The
clean-room policy reduces provenance risk but is not legal advice.
