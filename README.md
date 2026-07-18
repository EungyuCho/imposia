# Imposia

Imposia is a clean-room, browser-first HTML/CSS publishing toolkit. The client runtime is exposed through `@imposia/client`, which combines Core pagination and Viewer presentation.

## Packages

- `@imposia/core`: browser-only `mountPageDocument()` API, isolated canonical page-DOM pagination, and resolver-mediated asset loading. The current implementation is Chromium-reference pagination, not the complete target fragmentation engine.
- `@imposia/client`: browser-only convenience entrypoint for the Core page-document and Viewer APIs.
- `@imposia/react`: React-first adapter for mounting the Core page document and Viewer.
- `@imposia/viewer`: accessible continuous/single-page PDF canvas viewer for Chromium, Firefox, and WebKit, plus `mountPageViewer()` for presenting the existing canonical Core iframe in Chromium.

## Quick start

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm preflight
pnpm build
```

The published packages are browser ESM libraries. Each package tarball contains its own README, license, and third-party notices.

## Browser Core API (current canonical pagination)

```ts
import { mountPageDocument } from "@imposia/core";

const controller = mountPageDocument(
  document.querySelector("#preview")!,
  { html: "<article><h1>Hello</h1><p>Browser page DOM</p></article>" },
  {},
);
const pageDocument = await controller.ready;
console.log(pageDocument.pageCount, pageDocument.pages, pageDocument.warnings);
```

This browser surface paginates canonical pages in an isolated iframe. It accepts an optional `assetResolver`; discovered HTML and CSS assets are resolved only through that boundary and inserted as Core-owned blob URLs. `mountPageViewer()` can present that same iframe without cloning it or rerunning layout. The current paginator is verified against Chromium; broader target fragmentation remains pending.

For client applications that want one browser-only dependency, use the unified entrypoint:

```ts
import { mountPageDocument, mountPageViewer } from "@imposia/client";
import "@imposia/client/styles.css";
```

React applications can use the primary adapter:

```tsx
import { ImposiaPageViewer } from "@imposia/react";
import "@imposia/react/styles.css";

export function BookPreview() {
  return (
    <ImposiaPageViewer
      source={{ html: "<article><h1>Hello</h1></article>" }}
      onReady={(pageDocument) => console.log(pageDocument.pageCount)}
      onError={(error) => console.error(error)}
    />
  );
}
```

Core behavior can be composed through ordered, controller-lifetime extensions:

```ts
import { mountPageDocument, type PageExtension } from "@imposia/client";

const runningHead: PageExtension = {
  name: "example/running-head",
  decoratePage: ({ blank }) =>
    blank ? undefined : { headerHtml: "Chapter · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, { extensions: [runningHead] });
```

Transform, asset-policy, and decoration output is treated as untrusted input and stays inside Core's sanitizer, resolver, warning, abort, rollback, and cleanup boundaries. Extension order is the composition order and is fixed for the controller lifetime.

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

For the browser-Core page document, mount the canonical iframe in the same container where it was created:

```ts
import { mountPageViewer } from "@imposia/viewer";

const pageViewer = mountPageViewer(document.querySelector("#preview")!, pageDocument);
pageViewer.setMode("single");
await pageViewer.print();
```

`mountPageViewer()` retains the exact Core iframe and refreshes only to a newer generation from that controller. It is currently a Chromium-reference surface; the PDF.js `mountViewer()` API remains the cross-browser PDF viewer.

See [`examples/viewer/index.html`](examples/viewer/index.html) for the no-framework integration and [`docs/routing.md`](docs/routing.md) for contracts, compatibility, architecture, and verification evidence.

## Interactive demo

The React-first publishing lab at [`examples/demo`](examples/demo) demonstrates live source updates, page metrics, the ordered running-head extension, Viewer controls, and equivalent React/Core setup code.

```bash
pnpm build
node scripts/serve-viewer.mjs
```

Open `http://127.0.0.1:4178/examples/demo/`.

## Verification

`pnpm check` runs type checking, lint, unit tests, build, browser E2E, and the release/dependency license audit. `pnpm setup:browsers` provisions the declared browser engines.

Imposia is Apache-2.0 licensed. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and the contributor checklist in [`docs/clean-room.md`](docs/clean-room.md). The clean-room policy reduces provenance risk but is not legal advice.
