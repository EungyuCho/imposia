# Changelog

All notable changes to Imposia are recorded here. The project follows semantic
versioning for its published package interfaces.

## 0.1.0 — 2026-07-19

Initial browser-only release of the `@imposia/*` package family.

### Added

- `@imposia/core` for sanitized staging pagination, atomic commit into one
  persistent canonical iframe, typed publishing diagnostics, resolver-only
  assets, ordered extensions, native print, and reflowable EPUB 3.3 export.
- `@imposia/viewer` for canonical page-document presentation and independent
  PDF.js viewing.
- `@imposia/client` as the browser ESM convenience entrypoint, and
  `@imposia/react` as the primary React adapter.
- Ordered `PublicationSnapshot` composition with immutable entry ranges and a
  shared outline for Core navigation, Reader contents, React, and EPUB spine
  order.
- Publication Reader controls for stable deep links, committed-text search, and
  bounded page thumbnails. Retained destinations, results, and thumbnails from
  an older controller or generation are rejected.
- Continuous, single-page, and spread presentation with optional cover pairing,
  exact global-page navigation, and a responsive single-page fallback.
- Public Viewer theme tokens, a React imperative print/EPUB handle, and explicit
  source and document-option revision lifecycles.
- Immutable current and total page numbers in extension decoration callbacks for
  conditional page furniture such as final-page-only footers.
- Capability-bounded Publication entry extensions with frozen metadata,
  string-only transforms, located diagnostics, typed failures, and
  generation-scoped cleanup.
- Per-instance `ViewerTheme` token maps and runtime `setTheme()` updates for the
  PDF Viewer, canonical page Viewer, Client entrypoint, and React adapter.
- An opt-in Viewer diagnostics Inspector with current-generation warning
  metadata, existing-path page navigation, temporary presentation-only
  highlighting, and Client/React controls.
- Source-aware warning locations and constrained table, Flex, Grid,
  multi-column, and language-tagged CJK fragmentation with typed fallback
  diagnostics outside each declared subset.
- A documented same-iframe staged-generation contract that keeps the committed
  document visible until an update can be atomically accepted.

### Compatibility

Chromium is the structural pagination reference. Browser API, isolation,
lifecycle, native print, and EPUB behavior are covered across Chromium, Firefox,
and WebKit. The authoritative supported, constrained, experimental, and
unsupported behavior is in [`docs/compatibility.md`](./docs/compatibility.md).

### Security

- Updated PostCSS to 8.5.19 to ensure serialized caller CSS escapes HTML style
  terminators before reaching browser or EPUB embedding boundaries.
- Added a production dependency vulnerability gate and private reporting policy.
