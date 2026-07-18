# Compatibility

Verified on 2026-07-17.

| Surface | Engine/version | Status | Notes |
| --- | --- | --- | --- |
| PDF renderer | Playwright 1.57 Chromium 143.0.7499.4, build 1200 | Passing | Default pinned runtime; `IMPOSIA_CHROMIUM_EXECUTABLE` is an explicit override. |
| Viewer | Playwright Chromium 143.0.7499.4, build 1200 | 3/3 E2E passing | Pinned current page/zoom/modes/loading/error/mobile surface. |
| Viewer | Playwright Firefox 144.0.2, build 1497 | 3/3 E2E passing | Same PDF.js interaction contract. |
| Viewer | Playwright WebKit 26.0, build 2227 | 3/3 E2E passing | Controls explicitly retain focus after pointer activation. |
| PDF parsing/viewing | PDF.js 5.4.530 | Passing | Semantic inspection in Node and rendering in all Viewer engines. |
| PDF raster inspection | Playwright 1.57 Chromium + PDF.js 5.4.530 | Passing | No undeclared host binary; three A4 canvases at 96 DPI are screenshot and compared. |

The PDF adapter is Chromium-only by design. Cross-browser claims apply to viewing the generated PDF, not producing engine-identical HTML layout in Firefox or WebKit.
