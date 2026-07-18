# ADR 0006: browser publishing contract

Status: accepted for the browser publishing surface

## Context

Imposia needs one auditable contract for preview, pagination, native print, and
semantic document export. The product is React-first but Core must remain usable
directly from browser ESM. A second layout authority would make page metadata,
Viewer presentation, React updates, and export disagree; an unbounded CSS claim
would make browser differences indistinguishable from defects.

## Decision

1. `@imposia/core` owns one sanitized canonical iframe and one committed
   `PageDocument` generation. `mountPageDocument()` is the framework-neutral
   primitive. `@imposia/client` re-exports Core and Viewer for browser-only
   applications.
2. `@imposia/react` is the primary adapter. `ImposiaPageViewer` and
   `ImposiaDocument` retain the same Core controller and iframe through React
   effects. Its imperative handle exposes `current`, `print()`, and
   `exportEpub()`. `useImposiaDocument()` exposes the host ref, lifecycle state,
   current document, and controller for custom presentation. No React path may
   create a second iframe or rerun layout.
3. Core normalizes page presets/custom dimensions/orientation/margins, applies
   host page options with explicit precedence, and supports the documented
   `@page` selectors and six margin boxes. Breaks, widows/orphans, tables,
   flex/grid, multicol, target references, named strings, footnotes, and page
   floats use the exact Stable/Experimental/Constrained/Unsupported boundaries
   in [`docs/compatibility.md`](../compatibility.md).
4. The host `assetResolver` is the only admitted resource boundary. Authored
   URLs never become direct frame requests. Resolved bytes are Core-owned Blob
   URLs with limits, abort, rollback, warning, and revocation semantics.
5. `PageDocument.exportEpub()` returns a browser `Blob` containing reflowable EPUB
   3.3 content projected from the latest committed semantic source. It does not
   rerun extensions or resolvers. Required metadata and optional abort/archive
   limits are validated; only retained resolver assets may be included. Page
   wrappers, margin furniture, generated counters, Blob URLs, and page-only
   experimental artifacts are excluded.
6. `print()` remains a native browser action on the canonical iframe's
   `Window.print()`. Save as PDF is the browser's print destination. Imposia does
   not expose PDF bytes, fixed-layout EPUB, Node/CLI rendering, or complete CSS
   parity.

## Rationale and audit trail

This decision is intentionally auditable rather than a private reasoning record.
Each row in the compatibility matrix names the observable surface, status,
boundary, and warning/fallback behavior. The public contracts behind the model
are linked in [`docs/clean-room.md`](../clean-room.md): CSS Fragmentation and
Paged Media, generated content and page floats, Tables, Multi-column, Flexbox,
Grid, WHATWG HTML/DOM fragment identity, EPUB 3.3/OCF, and the platform iframe,
CSP, cloning, and print contracts.

The implementation and independently authored tests derive from repository
requirements and those public contracts. Public competitor documentation may
inform a high-level capability inventory only; it is not an implementation,
architecture, API, test, fixture, naming, or behavior reference.

## Consequences

- Chromium is the structural pagination reference. Firefox and WebKit preserve
  API, isolation, resolver, lifecycle, cleanup, print, and archive behavior while
  pagination metrics can differ.
- Unsupported authored syntax is ignored, kept atomic, or rejected with a typed
  warning; it is never silently advertised as equivalent output.
- Semantic EPUB export and paginated preview are related projections, not the same
  artifact. A successful print action does not imply PDF bytes, and a successful
  EPUB export does not imply fixed page geometry.
- Consumers can rely on one DOM authority and one lifecycle while choosing Core,
  Client, or React integration.

## Verification evidence

- Core page media and print: [page-media-green.md](../../.omo/evidence/browser-publishing-coverage/page-media-green.md)
- Recursive/constrained fragmentation: [fragmentation-green.md](../../.omo/evidence/browser-publishing-coverage/fragmentation-green.md)
- Generated publishing content: [publishing-content-green.md](../../.omo/evidence/browser-publishing-coverage/publishing-content-green.md)
- Browser EPUB archive: [epub-export-green.md](../../.omo/evidence/browser-publishing-coverage/epub-export-green.md)
- React lifecycle and handle contract: [docs-react-handle-rerun.md](../../.omo/evidence/browser-publishing-coverage/docs-react-handle-rerun.md) and [react-imperative-handle-green.md](../../.omo/evidence/react-imperative-handle-green.md)
