# Changelog

All notable changes to Imposia are recorded here. The project follows semantic
versioning for its published package interfaces. What that means before `1.0`
— what counts as public, and what a minor release is allowed to break — is in
[`docs/api-policy.md`](docs/api-policy.md).

## 0.6.0 — Unreleased

Minor release for the asset and print pipeline. Four changes are breaking —
two print defaults, one status union, and the removed PDF viewer — and each
has an upgrade path in
[`docs/migrations/unreleased.md`](docs/migrations/unreleased.md), which is
renamed to `0.6.0.md` when this release ships.

### Breaking

- Printing preserves backgrounds by default: the print shadow root sets
  `print-color-adjust: exact` (with the WebKit prefix), so the printed sheet
  matches the composed page instead of depending on the print dialog's
  "Background graphics" checkbox. Every consumer's printed output changes.
  The rule carries no `!important`; content that wants ink saving can still
  set `print-color-adjust: economy`. (ASA-459)
- Printing renames every hoisted `@font-face` family to
  `imposia-print-<n>--<family>` and rewrites the shadow's style rules and
  inline styles to match, so a face the host application declared under the
  same name can no longer satisfy a weight or range the composed document
  never loaded. Anything that matched those families by name in the transient
  print stylesheet sees the new prefix. The rewrite is CSSOM-based and does
  not reach `font` shorthands, `adoptedStyleSheets`, or `var()`-carried
  families. (ASA-462)
- `ImposiaDocumentStatus` and `ImposiaPublicationStatus` gained `"aborted"`.
  When the live run's generation is aborted — a caller's `options.signal`
  reaches it through `documentOptions`/`publicationOptions` — both hooks now
  transition to this terminal state instead of stranding the caller in
  `loading`, and a previously committed document or publication stays on the
  state exactly as it does for `loading` and `error`. Exhaustive switches
  over these unions stop compiling until they handle the new member;
  `status !== "loading"` checks need no change. (ASA-461)
- Removed the independent PDF.js viewer: `mountViewer`, its `ViewerController`,
  `ViewerMode`, `ViewerOptions`, `ViewerSource`, and `ViewerState` types, and
  the stylesheet rules only it used. `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` no longer depend on `pdfjs-dist`. Imposia does not produce
  PDF bytes, so the viewer had no input from the rest of the toolkit.
  `mountPageViewer` is unchanged.

### Changed

- Fonts declared with pre-RFC 8081 MIME spellings (`application/font-woff`,
  `application/x-font-woff`, `application/vnd.ms-opentype`, and nine more)
  are accepted and canonicalised onto the `font/*` tree; previously they were
  blocked and the document silently composed with a fallback face. The
  canonical spelling flows downstream, so the object URL's `Blob` type and
  the reported `mimeType` carry `font/woff`, never the legacy string.
  Container magic bytes and `FontFace.load()` still gate acceptance. (ASA-457)
- `RESOURCE_BLOCKED` is reported once per blocked resource — up to 20 per
  generation — with the resource kind in `property`, a Core-authored refusal
  reason in `recovery`, and the resource named by its `sourceIdentity`
  marker, including the case where the resolver reported success and Core
  overruled it on validation. Warnings stay safe to publish: they never
  carry the authored URL, and a resolver's own `reason` text never reaches
  them — a resolver block always reads "the resolver refused this
  resource". Documents that previously produced one aggregate warning can
  now produce several; the aggregate form remains only when nothing was
  recorded individually. (ASA-458, ASA-465)
- A `@font-face` `src` list that contains a plain `format(woff2)` candidate
  collapses to that single candidate, halving font resolver calls for the
  common `woff2, woff` pairing; `AssetResolver` implementations see fewer
  requests. Candidates carrying `tech()` are never chosen, and lists without
  a plain woff2 entry are requested as authored. Trade-off: the engine's
  load-failure fallback to later candidates disappears for collapsed lists —
  a woff2 whose bytes fail to load no longer falls back to its woff sibling.
  (ASA-460)
- Core imports only the postcss parser and `AtRule` instead of the postcss
  package entry. Core · PageDocument drops from 62.0 KiB to 56.7 KiB gzip and
  the page Viewer route from 28.9 KiB to 11.6 KiB; bundle budgets were
  lowered to match.
- Committed pages use `content-visibility: auto` on screen, so the browser
  skips rendering off-screen pages. The first frame after a commit dropped
  from 39 ms to 4 ms on a 156-page document; scroll geometry and print are
  unchanged. Code that reads layout inside an off-screen page still gets
  correct values, at the cost of a forced layout for that page.
- Publication commits compute every entry's page range in one pass over the
  committed pages, and build the search index on first use instead of on
  every commit. On a 595-page, 100-entry Publication a commit dropped from
  2760 ms to 2567 ms; the first search, destination lookup, or navigation
  after a commit now pays the index build (about 64 ms at that size).

### Fixed

- `@imposia/react/styles.css` imports `@imposia/client/styles.css` instead of
  `@imposia/viewer/styles.css`. `@imposia/viewer` is not a direct dependency
  of `@imposia/react`, so under strict package layouts such as pnpm's the
  documented `import "@imposia/react/styles.css"` failed to resolve in
  bundlers. The imported rules are unchanged.
- A paragraph or table taller than a page no longer overflows the current
  page when no line or row of it fits in the remaining space. Plain-text
  paragraphs, `<br>`-separated line blocks, and tables now break before the
  block and fragment it from a fresh page; `PAGE_OVERFLOW` is reported only
  when nothing fits on a fresh page. Previously Core kept the block on the
  current page and reported overflow, and every following page-tall block
  then piled up on that same overflowing page — in a 120-paragraph document,
  112 paragraphs landed on the last page. Text was never lost or duplicated;
  page assignment was wrong. Paragraphs with inline elements and grids were
  not affected.
- A `<style>` element in the middle of a document no longer makes earlier
  pages overflow without a warning. Core placed each style into the page
  being filled, after the styles still waiting in the source, which reversed
  their cascade order until those were placed too; earlier pages were
  measured under one winning rule and committed under another. Core now
  moves every body and Publication entry `<style>` to the start of the flow
  before pagination, keeping their order, so the cascade is the same while
  measuring and after commit. Styles using `@scope` without a selector stay
  in place. Documents whose later styles override earlier ones can paginate
  differently (a 300-section fixture went from 70 pages, 30 of them
  overflowing, to 75 pages with none). Publication entry styles also stop
  forcing a style recalculation per entry: 200 styled entries paginate in
  203 ms instead of 362 ms, with identical page text.
- Pages with a running header or footer (`<template data-page-header>`,
  `<template data-page-footer>`, or the `headerTemplate`/`footerTemplate`
  options) no longer overflow into the footer without a warning. Core added
  the decorations only after pagination, so every split path — tables,
  paragraphs, line blocks, lists, grid and flex — measured the page as if the
  header and footer rows were empty, and a page filled to its last line lost
  the decorations' height (about 45px on A4 with both rows) once they were
  added. Core now renders the header and footer templates into each page as
  it is allocated, with page tokens resolved provisionally, and fit checks
  read the content row's height instead of the page geometry's. Documents
  with decorations can move a line or row to the next page. `decoratePage`
  extension output is still added after pagination and is not reserved; when
  it, or a final page token, shrinks a page that fit, Core now reports
  `PAGE_OVERFLOW`.

## 0.5.0 — 2026-08-20

Minor release for browser-native parsing and a pagination performance batch.
The version is a minor bump because Core's string-parsing domain changed
observably; every behavior change below is covered by an equivalence oracle or
a typed warning.

### Security

- Patched `postcss` to 8.5.26 and its transitive `nanoid` to 3.3.18. Both were
  flagged by `pnpm audit --prod` and both are bundled into the `@imposia/core`
  browser artifact, so the exposure reached consumers rather than staying in
  the toolchain. (ASA-423)

### Breaking

- Core parses the string domain with the browser-native parser (`DOMParser`,
  template fragment parsing, native serialization) instead of `parse5`, and
  `nodeOrder` became a strided document-order slot. `parse5` and `entities`
  left the Core bundle. Callers that depended on `parse5`-specific parse or
  serialization details may observe different output for malformed markup.
  See [`docs/migrations/0.5.0.md`](docs/migrations/0.5.0.md) for the upgrade
  path and `docs/architecture/0013-browser-native-parsing.md` for the
  decision. (ASA-404)

### Added

- `experimental.forceSequentialPlacement` restores per-node placement.
  (ASA-424)
- `experimental.forceLegacyLineEnds` restores the per-grapheme rendered-line
  scan. (ASA-425)
- `experimental.forceFullConstraintCapture` restores the full break-constraint
  sweep. (ASA-426)

  These three escape hatches exist so the corresponding fast paths can be
  disabled in the field for one release while they earn confidence. Each ships
  alongside the implementation it replaces, which is why the Core bundle grew;
  removing the hatches in a later release reclaims that size.

- `committedFrameGeneration(frameDocument)` reports the generation Core
  stamped on the canonical frame at commit time, or `undefined` for a frame
  that has not committed a stamped generation. Presentation layers use it to
  recognize the window between a commit landing in the frame and their own
  `PageDocument` reference being replaced. Core remains the only authority for
  what that generation means. (ASA-438)

### Performance

- Sibling runs are placed as chunks and bisected only on overflow, replacing a
  forced synchronous reflow and an inline-overflow check per node. The boundary
  node re-enters the unchanged sequential path, so splitting, fresh-page retry,
  and warnings keep their existing behavior. (ASA-424)
- The page-crossing text split derives rendered-line boundaries from line-box
  rects plus a verified search instead of one `Range.getClientRects()` call per
  grapheme, and grapheme segmentation is cached per text node and reused across
  page splits by offset shift. Measured on long-paragraph fixtures:
  `getClientRects` calls fell 98.1% (English) and 95.9% (CJK). (ASA-425)
- Break-constraint capture skips the interior of atomic subtrees when the
  document's CSS and the subtree's inline styles provably contain no
  fragmentation-relevant declarations, falling back silently otherwise. The
  widows/orphans inline walk now runs only when the computed value reads 0,
  source identity is memoized down the sweep instead of walking ancestors, and
  the hyphenation sweep folded into capture. A heavy-SVG fixture skipped 21,240
  interior captures per pass. (ASA-426)
- Within one generation, image, font, and media requests that absolutize to the
  same URL share a single resolver call, byte copy, decode validation, and blob
  URL. Occurrence-level semantics — the extension `allowAsset` veto, scheme
  check, byte accounting, and per-occurrence substitution — are unchanged.
  (ASA-427)
- Publishing-pass lookups are indexed and fixed-point passes are accepted
  early. (ASA-406)

### Changed

- Browser bundles are minified with an `oxc-minify` post-pass. (ASA-405)
- Bundle budgets were re-based twice: down after the `parse5` removal (ASA-407)
  and up after the performance batch, which ships fast and legacy paths
  together. Core · PageDocument is 60.0 KiB gzip — 43.6 KiB below the
  pre-ASA-404 route. See `docs/bundle-size.md`.
- The spread-cover visual gate compares structural geometry instead of checked-in
  Chromium/Darwin PNG baselines. The old gate always skipped in CI (Ubuntu) and
  always failed locally on Darwin, so it protected nothing and blocked the
  release gate; the replacement runs on all three engines with no skip. Removed
  with it: an unreferenced `tests/fixtures/{parity,pdf}` corpus left over from
  the deleted Node renderer, the `test:integration` script, and the unused
  `pixelmatch`/`pngjs` dev dependencies. (ASA-432)

### Fixed

- Viewer no longer throws `canonical page markers do not match pageCount` when
  a host application updates a document under load. Core commits a generation
  into the canonical frame synchronously, but a host that refreshes the Viewer
  from a passive effect leaves a brief window in which the frame carries the
  new generation's markers while the Viewer still holds the previous
  `PageDocument`. Ambient synchronization — the resize-driven interface sync
  and the stale-geometry scroll step — now defers while the frame's stamp is
  ahead, instead of surfacing that transient as an uncaught error. Explicit
  calls (`mountPageViewer`, `refresh`) still validate and throw, and a marker
  mismatch without a newer stamp is still reported as corruption. The commit
  itself was always atomic and no stale generation was ever rendered; the
  defect was in how the transient was classified. Present since at least
  `0.4.1` and reproduced there. (ASA-438)

## 0.4.1 — 2026-07-27

Patch release for reliable multi-page printing and compact Viewer controls.

### Fixed

- Prevented caller-authored `html` and `body` viewport constraints from
  clipping the isolated native-print snapshot to one sheet while preserving
  the source document's print cascade.
- Positioned Viewer TOC, search, thumbnail, and Inspector panels below the
  actual responsive control rail, including the wrapped 320 px layout.

### Changed

- Reorganized the localized documentation around getting started, concepts,
  publishing guides, package API references, and browser-native Save as PDF.
- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.4.1`.

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
- Preserved the canonical source document's `html` and `body` context,
  body-scoped CSS selectors, and computed custom properties in the isolated
  native-print snapshot.
- Added layout containment to committed page roots without enabling
  counter-altering style containment.
- Synchronized `@imposia/core`, `@imposia/viewer`, `@imposia/client`, and
  `@imposia/react` at version `0.4.0`.

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
