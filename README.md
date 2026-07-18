# Imposia

Imposia is a clean-room HTML/CSS publishing toolkit that produces a real paginated PDF with a pinned Chromium engine and opens that exact artifact in a framework-free PDF.js Viewer.

## Packages

- `@imposia/core`: input validation, sanitization, break compatibility, decorations, warnings, lifecycle hooks, reusable Chromium, PDF metadata, and timing data.
- `@imposia/viewer`: accessible continuous/single-page PDF canvas viewer for Chromium, Firefox, and WebKit.
- `@imposia/cli`: `render` and `pdf` commands with JSON output and stable exit codes.

## Quick start

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm preflight
pnpm build
pnpm cli -- render examples/book.html --output output/pdf/imposia-example.pdf --json
```

The successful command exits `0` and reports the page count, A4 point dimensions, warnings, and phase timings. Usage, input, output, and unexpected internal failures exit `2`, `3`, `4`, and `5` respectively.

## Core API

```ts
import { createRenderer } from "@imposia/core";

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

Remote resources are blocked unless `allowRemoteResources` is enabled. Scripts, inline event handlers, unsafe URLs, file-root escapes, oversized input, and readiness deadlines are handled at explicit trust boundaries.

## Viewer API

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

See [`examples/viewer/index.html`](examples/viewer/index.html) for the no-framework integration and [`docs/routing.md`](docs/routing.md) for contracts, compatibility, architecture, limitations, benchmarks, and verification evidence.

## Verification

`pnpm check` begins with a deterministic prerequisite preflight, then runs type checking, Biome, unit/integration tests, build, fresh example PDF generation, semantic PDF regression, Playwright/PDF.js visual regression, three-browser Viewer E2E, the release/dependency license audit, and the requirement/artifact ledger. `pnpm verify` runs that complete gate while preserving raw stdout/stderr, timestamps, exit status, and artifact hashes. `pnpm setup:browsers` is the declared browser-provisioning step; no host Poppler installation is required. Performance is intentionally separate: `pnpm benchmark` performs 30 measured representative real-browser renders against [`benchmarks/baseline.json`](benchmarks/baseline.json).

Imposia is Apache-2.0 licensed. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and the contributor checklist in [`docs/clean-room.md`](docs/clean-room.md). The clean-room policy reduces provenance risk but is not legal advice.
