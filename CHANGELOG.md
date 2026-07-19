# Changelog

All notable changes to Imposia are recorded here. The project follows semantic
versioning for its published package interfaces.

## 0.1.0 — 2026-07-19

Initial browser-only release of the `@imposia/*` package family.

### Added

- `@imposia/core` for sanitized canonical iframe pagination, typed publishing
  diagnostics, resolver-only assets, ordered extensions, native print, and
  reflowable EPUB 3.3 export.
- `@imposia/viewer` for canonical page-document presentation and independent
  PDF.js viewing.
- `@imposia/client` as the browser ESM convenience entrypoint, and
  `@imposia/react` as the primary React adapter.
- Public Viewer theme tokens, a React imperative print/EPUB handle, and explicit
  source and document-option revision lifecycles.

### Compatibility

Chromium is the structural pagination reference. Browser API, isolation,
lifecycle, native print, and EPUB behavior are covered across Chromium, Firefox,
and WebKit. The authoritative supported, constrained, experimental, and
unsupported behavior is in [`docs/compatibility.md`](./docs/compatibility.md).
