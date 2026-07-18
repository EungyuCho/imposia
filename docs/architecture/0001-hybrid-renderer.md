# ADR 0001: browser-native PDF plus PDF.js Viewer

Status: superseded by [ADR 0004](0004-browser-first-page-dom.md) on 2026-07-18. Historical decision; its legacy PDF path is now owned by `@imposia/node` in the current implementation.

Use pinned Chromium print layout for PDF generation and PDF.js for cross-browser viewing. This shares the actual output artifact between export and preview, avoids reimplementing line breaking and font shaping, and keeps browser-specific behavior behind an adapter. A custom layout engine remains out of scope until measured compatibility failures justify it.

## Historical context

This was the v1 decision for the legacy implementation. Its exported artifact is a PDF: the legacy Node/Chromium renderer, now exported by `@imposia/node`, produces Chromium PDF bytes and `@imposia/viewer` renders those bytes with PDF.js. `@imposia/cli` invokes the Node package for this path. At the time of this ADR, that renderer lived in Core.

ADR 0004 replaces the architectural decision for the next product contract: one browser-owned paginated page DOM becomes authoritative and PDF becomes an optional export of that DOM. This ADR is retained so migration reviews can distinguish the shipped PDF-first path from the target browser-first path.
