# Changelog

All notable changes to Imposia are recorded here. The project follows semantic
versioning for its published package interfaces.

## 0.4.0 — 2026-07-24

Minor release for cooperative main-thread pagination.

### Added

- Added `PageDocumentOptions.compose` with an 8 ms default yield budget,
  injectable scheduler, and `Infinity` opt-out.
- Added pass-local provisional page-allocation progress with one-based
  convergence pass metadata.
- Added deterministic font and image settlement after staging source and styles
  are mounted.

### Changed

- Time-sliced constraint capture and recursive text, element, grid, line, and
  table fragmentation without changing the accepted page structure.
- Made scheduler waits abortable and serialized superseding generations so a
  predecessor cleans up before the winning staging generation starts.
- Added layout containment to committed page roots without enabling
  counter-altering style containment.
- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.4.0`.

## 0.3.1 — 2026-07-24

Patch release for the public `@imposia/*` package family.

### Fixed

- Preserved the canonical source document's `html` and `body` context,
  body-scoped CSS selectors, and computed custom properties in the isolated
  native-print snapshot used by Core, Viewer, Client, and React.

### Changed

- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.3.1`.

## 0.3.0 — 2026-07-24

Minor release for deterministic browser printing and constrained table extension
composition.

### Added

- Added synchronous `finalizePage` hooks for Core and Publication extensions.
  Hooks receive the measurable live page element and deterministic split-table
  continuation provenance before commit.
- Added `createTableColgroupExtension()` as an opt-in preset that freezes
  measured column widths in split table continuations while Core continues to
  carry authored `<colgroup>` structure by default.

### Changed

- Switched Core, Viewer, Client, and React native printing to a transient,
  isolated top-document snapshot of accepted pages. This avoids Chromium's
  sandboxed-iframe blank-sheet failure without rerunning pagination.
- Split tables, safe grids, and over-tall normal blocks now fragment into the
  current page's remaining space instead of unnecessarily relocating to a fresh
  page.
- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.3.0`.

## 0.2.0 — 2026-07-24

Minor release for the public `@imposia/*` package family.

### Added

- Added `controls: false` to the canonical page Viewer so host applications can
  compose their own navigation, single/continuous/spread mode, and zoom UI
  without mounting the built-in rail.
- Added immediate Viewer state subscriptions and React state callbacks, plus
  imperative page navigation and zoom controls on `ImposiaPageViewer`.

### Changed

- Scoped Viewer tokens, box sizing, canvas presentation, and responsive rules
  to each Viewer root. Importing Viewer styles no longer changes the host
  document's `body`, `:root`, scroll behavior, background, or unrelated
  elements.
- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.2.0`.

## 0.1.3 — 2026-07-23

Patch release for the public `@imposia/*` package family.

### Added

- A cross-browser continuity fixture that records the first and last source
  token on every committed content page, then proves that the flattened page
  sequence contains all 96 tokens exactly once and in order.
- A public CSR continuity specimen that displays the committed token ledger and
  runs three rapid source revisions while retaining the canonical iframe.

### Changed

- Made HTML/CSR pagination integrity the primary product contract. Reflowable
  EPUB remains a supported semantic projection rather than the headline
  promise.
- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.1.3` without changing their public interfaces.

## 0.1.2 — 2026-07-23

Patch release for the public `@imposia/*` package family.

### Changed

- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.1.2` without changing their public interfaces.
- Added automatic CodeRabbit review alongside the existing verification and
  code-scanning checks for pull requests.

### Security

- Removed the unused request-delay behavior from the loopback-only demo server,
  eliminating the corresponding CodeQL resource-exhaustion finding.
- Reviewed the structural-selector CodeQL finding and confirmed that the value
  is used only by `Element.matches()` with conservative fallback behavior, not
  as an HTML or attribute injection sink.

## 0.1.1 — 2026-07-23

Patch release for the public `@imposia/*` package family.

### Added

- Page setup controls in the publishing demo with portrait-first A4 defaults,
  orientation switching, and A3, A4, and B1 paper presets.
- Expanded multilingual documentation navigation for package APIs and public
  publishing workflows.
- A protected GitHub Actions release path that validates the exact release
  commit, publishes through npm trusted publishing, and creates the matching
  Git tag and GitHub Release with package tarballs.

### Changed

- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.1.1` while preserving their existing public
  interfaces.

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
