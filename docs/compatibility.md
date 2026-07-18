# Compatibility

Verified current stable path on 2026-07-17. The Chromium-reference browser-first rows below are target acceptance criteria, not completed compatibility claims.

## Current stable PDF-first path

| Surface | Engine/version | Status | Notes |
| --- | --- | --- | --- |
| PDF renderer | Playwright 1.57 Chromium 143.0.7499.4, build 1200 | Passing | Default pinned runtime; `IMPOSIA_CHROMIUM_EXECUTABLE` is an explicit override. |
| Viewer | Playwright Chromium 143.0.7499.4, build 1200 | 3/3 E2E passing | Pinned current page/zoom/modes/loading/error/mobile surface. |
| Viewer | Playwright Firefox 144.0.2, build 1497 | 3/3 E2E passing | Same PDF.js interaction contract. |
| Viewer | Playwright WebKit 26.0, build 2227 | 3/3 E2E passing | Controls explicitly retain focus after pointer activation. |
| PDF parsing/viewing | PDF.js 5.4.530 | Passing | Semantic inspection in Node and rendering in all Viewer engines. |
| PDF raster inspection | Playwright 1.57 Chromium + PDF.js 5.4.530 | Passing | No undeclared host binary; three A4 canvases at 96 DPI are screenshot and compared. |

The PDF adapter is Chromium-only by design. Cross-browser claims apply to viewing the generated PDF, not producing engine-identical HTML layout in Firefox or WebKit.

## Target browser-first Chromium-reference path

| Surface | Reference | Status | Acceptance meaning |
| --- | --- | --- | --- |
| Browser Core | Chromium reference | Not implemented | One isolated iframe contains the library-owned page DOM; no browser-core network/file fetches occur. |
| Viewer | Chromium reference | Not implemented | Viewer wraps/displays the canonical iframe and never clones pages or runs another paginator. |
| Browser print | Chromium reference | Not implemented | Print is initiated on the canonical frame after its resources are ready. |
| `@imposia/node` PDF adapter | Chromium reference | Not published | It invokes the same exported browser paginator, then Chromium PDF, with no independent Node pagination. |
| Preview/export comparison | DOM structural comparator | Not implemented | Equality means page count, page dimensions, ordered text, decorations, and blank-page positions; not PDF bytes or pixels. |

Firefox and WebKit are not target pagination references. They may host the Viewer shell where supported, but do not establish engine-identical page layout. The target remains behind the ADR 0004 rollback gate until its structural equality, isolation, and cleanup tests pass.
