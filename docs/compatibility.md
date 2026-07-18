# Compatibility

The legacy PDF-first evidence below was verified on 2026-07-17. Fresh 2026-07-18 evidence verifies the current package split and one-page browser-Core vertical slice; the Chromium-reference rows still distinguish that slice from the pending full target.

## Current stable PDF-first path

| Surface | Engine/version | Status | Notes |
| --- | --- | --- | --- |
| PDF renderer (`@imposia/node`) | Playwright 1.57 Chromium 143.0.7499.4, build 1200 | Verified after package move | Fresh 2026-07-18 evidence includes a real `@imposia/node` CLI render producing a three-page PDF. |
| Viewer | Playwright Chromium 143.0.7499.4, build 1200 | 4/4 E2E passing | Pinned current page/zoom/modes/loading/error/mobile surface. |
| Viewer | Playwright Firefox 144.0.2, build 1497 | 4/4 E2E passing | Same PDF.js interaction contract. |
| Viewer | Playwright WebKit 26.0, build 2227 | 4/4 E2E passing | Controls explicitly retain focus after pointer activation. |
| PDF parsing/viewing | PDF.js 5.4.530 | Passing | Semantic inspection in Node and rendering in all Viewer engines. |
| PDF raster inspection | Playwright 1.57 Chromium + PDF.js 5.4.530 | Passing | No undeclared host binary; three A4 canvases at 96 DPI are screenshot and compared. |

The PDF adapter is Chromium-only by design. Cross-browser claims apply to viewing the generated PDF, not producing engine-identical HTML layout in Firefox or WebKit.

## Browser-Core vertical slice and target Chromium-reference path

| Surface | Reference | Status | Acceptance meaning |
| --- | --- | --- | --- |
| Browser Core (`@imposia/core`) | Chromium, Firefox, WebKit | One-page vertical slice verified | The browser-Core matrix recorded 28 passes and 2 expected Firefox/WebKit print skips. Resolver-mediated HTML/CSS asset loading, restrictive frame isolation, bounded resource handling, and blob-URL cleanup are implemented; full fragmentation remains pending. |
| Canonical iframe Viewer (`mountPageViewer`) | Chromium reference | Verified | It presents the exact Core iframe without canvas reconstruction or page cloning, supports newer-generation refreshes for that iframe, and prints the frame. It does not establish multi-engine pagination parity. |
| Browser print | Chromium | CSS-driven one-page print verified | Canonical page-document CSS with `preferCSSPageSize` produced one A4 sheet (approximately 594.96 × 841.92 pt). Separate lifecycle E2E tests prove `print()` targets the exact canonical iframe; this row does not claim a live-frame physical capture. Firefox/WebKit print cases are expected skips; full target resource/readiness coverage remains pending. |
| `@imposia/node` PDF adapter and CLI | Chromium reference | Legacy renderer and CLI verified; shared paginator pending | `createRenderer()` and the `render`/`pdf` CLI commands own the stable PDF export path; the real CLI produced a three-page PDF. It does not yet invoke the exported browser paginator. |
| Preview/export comparison | DOM structural comparator | Not implemented | Equality means page count, page dimensions, ordered text, decorations, and blank-page positions; not PDF bytes or pixels. |

Firefox and WebKit are not target pagination references. They may host the PDF.js Viewer shell where supported, but do not establish engine-identical page layout. The one-page Core slice does not satisfy the ADR 0004 rollback gate; the target remains pending structural equality, isolation, and cleanup tests.
