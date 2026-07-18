# Imposia

Imposia is a clean-room HTML/CSS publishing toolkit. The current implementation has browser-Core canonical page-DOM pagination with resolver-mediated assets, a canonical-iframe Viewer surface, and a separate Node/Chromium PDF renderer; the full browser-first product remains in progress.

## Packages

- `@imposia/core`: browser-only `mountPageDocument()` API, isolated canonical page-DOM pagination, and resolver-mediated asset loading. The current implementation is Chromium-reference pagination, not the complete target fragmentation engine.
- `@imposia/node`: legacy Node/Playwright PDF renderer, Chromium lifecycle, PDF metadata, and timing data.
- `@imposia/viewer`: accessible continuous/single-page PDF canvas viewer for Chromium, Firefox, and WebKit, plus `mountPageViewer()` for presenting the existing canonical Core iframe in Chromium.
- `@imposia/cli`: `render` and `pdf` commands with JSON output and stable exit codes, backed by `@imposia/node`.

## Quick start

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm preflight
pnpm build
pnpm cli -- render examples/book.html --output output/pdf/imposia-example.pdf --json
```

The successful command exits `0` and reports the page count, A4 point dimensions, warnings, and phase timings. Usage, input, output, and unexpected internal failures exit `2`, `3`, `4`, and `5` respectively.

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

This browser surface paginates canonical pages in an isolated iframe. It accepts an optional `assetResolver`; discovered HTML and CSS assets are resolved only through that boundary and inserted as Core-owned blob URLs. `mountPageViewer()` can present that same iframe without cloning it or rerunning layout. The current paginator is verified against Chromium; broader target fragmentation and Node PDF generation through this same paginator remain pending.

## Node PDF API (current stable PDF path)

```ts
import { createRenderer } from "@imposia/node";

const renderer = createRenderer();
try {
  const result = await renderer.render(
    { file: "examples/book.html" },
    { allowFileRoot: process.cwd() },
  );
  console.log(result.pageCount, result.warnings, result.timings);
} finally {
  await renderer.close();
}
```

Remote resources are blocked unless `allowRemoteResources` is enabled. Scripts, inline event handlers, unsafe URLs, file-root escapes, oversized input, and readiness deadlines are handled at explicit trust boundaries on this legacy PDF path.

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

See [`examples/viewer/index.html`](examples/viewer/index.html) for the no-framework integration and [`docs/routing.md`](docs/routing.md) for contracts, compatibility, architecture, limitations, benchmarks, and verification evidence.

## Verification

`pnpm check` begins with a deterministic prerequisite preflight, then runs type checking, Biome, unit/integration tests, build, fresh example PDF generation, semantic PDF regression, Playwright/PDF.js visual regression, three-browser Viewer E2E, the release/dependency license audit, and the requirement/artifact ledger. `pnpm verify` runs that complete gate while preserving raw stdout/stderr, timestamps, exit status, and artifact hashes. `pnpm setup:browsers` is the declared browser-provisioning step; no host Poppler installation is required. Performance is intentionally separate: `pnpm benchmark` performs 30 measured representative real-browser renders against [`benchmarks/baseline.json`](benchmarks/baseline.json).

Imposia is Apache-2.0 licensed. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and the contributor checklist in [`docs/clean-room.md`](docs/clean-room.md). The clean-room policy reduces provenance risk but is not legal advice.
