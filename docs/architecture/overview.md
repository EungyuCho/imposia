# Architecture overview

This document describes how Imposia is built as a whole: the layers, the
pagination pipeline, the invariants each layer is responsible for, and the
machinery that keeps those invariants honest.

It is a *descriptive* map of the system as of `0.4.1`. It does not make
decisions — decisions live in the numbered ADRs in this directory, and the
authoritative behavior boundary lives in [../compatibility.md](../compatibility.md).
Where this document and an ADR disagree, the ADR wins.

- Domain vocabulary: [../../CONTEXT.md](../../CONTEXT.md)
- Documentation entry point: [../routing.md](../routing.md)

---

## 1. What the system is

Imposia turns browser HTML and CSS into a **committed page document** that
presentation, native print, and semantic EPUB export all observe — without
introducing a second rendering authority.

The problem it solves is drift. In a typical browser publishing workflow the
editor measures one tree, preview clones another, and print reconstructs a
third; small differences become different page counts, broken cross-references,
and output that cannot be reproduced. Imposia's answer is architectural rather
than algorithmic: there is exactly **one** DOM that has been paginated, it lives
in a Core-owned iframe, and every other surface reads back from it.

Three consequences follow directly, and most of the codebase is an expression of
them:

1. **Nothing renders twice.** The Viewer decorates the canonical iframe instead
   of drawing pages; search reads committed text; the outline reads committed
   headings; print clones the committed frame into an isolated shadow root;
   EPUB projects from a retained pre-pagination semantic snapshot rather than
   from a second layout run.
2. **Nothing is observed half-built.** Pagination happens in a temporary,
   offscreen staging iframe. The canonical frame changes only in one synchronous
   swap after a complete success, with rollback if anything downstream of that
   swap throws.
3. **Nothing is promised beyond what is proven.** Support is declared per
   behavior in a four-tier matrix; input outside a declared tier is either kept
   atomic or produces a typed warning that names the recovery taken.

What Imposia deliberately is **not** (ADR 0006, `docs/roadmap.md`): a PDF-byte
generator, a Node/CLI or server-side renderer, a fixed-layout EPUB producer, an
authored-content editor, an EPUB reading engine, or a claim of complete CSS
fragmentation parity.

---

## 2. Package topology

Four published packages, all version-locked and released together, ESM-only,
Apache-2.0.

```
                         ┌───────────────────────────┐
                         │  @imposia/core            │  pagination engine
                         │  native parser + postcss  │  owns the canonical iframe
                         │  (bundled)                │  browser-only, no DOM outside the frame
                         └────────────┬──────────────┘
                                      │
                    ┌─────────────────┴──────────────────┐
                    │                                    │
        ┌───────────▼───────────┐                        │
        │  @imposia/viewer      │  presentation shell     │
        │  + pdfjs-dist         │  decorates the iframe   │
        └───────────┬───────────┘                        │
                    │                                    │
                    └─────────────────┬──────────────────┘
                                      │
                         ┌────────────▼──────────────┐
                         │  @imposia/client          │  framework-neutral façade
                         │  (zero own runtime code)  │  core ∪ viewer, one import
                         └────────────┬──────────────┘
                                      │
                         ┌────────────▼──────────────┐
                         │  @imposia/react           │  React adapter
                         │  peer react/react-dom ≥18 │  primary supported path
                         └───────────────────────────┘
```

| Package | Size | Role |
|---|---:|---|
| `@imposia/core` | ~11.5k LOC | Sanitization, asset resolution, fragmentation, commit, print, EPUB, Publication |
| `@imposia/viewer` | ~2.5k LOC | Viewer chrome, reader panels, PDF.js viewer, theme tokens |
| `@imposia/react` | ~1.2k LOC | Components, hooks, imperative handles |
| `@imposia/client` | ~90 LOC | Pure re-export union of core + viewer |

The dependency direction is strictly one-way with no cycles. `@imposia/client`
exists so that the pagination API and the presentation API can be imported
together **without** core ever depending on viewer — core must stay free of
`pdfjs-dist` and of every Node builtin, and that is mechanically enforced
(§7).

`@imposia/react` re-exports the entire client surface (`export * from
"@imposia/client"`), so React consumers install one package.

---

## 3. The pagination pipeline

### 3.1 Two iframes

A controller (`mountPageDocument`) creates the **canonical iframe** once, at
mount, and never replaces it until `destroy()`. Every update additionally
creates a **staging iframe**, offscreen at `left: -100000px`, `visibility:
hidden`, sized to match the canonical frame's client box so measurement
conditions are identical. Both use the same hardened document:

- `sandbox="allow-same-origin allow-modals"` — notably **no** `allow-scripts`
- `srcdoc` carrying `<meta http-equiv="Content-Security-Policy">` with
  `default-src 'none'`, `style-src 'unsafe-inline'`, `img/font/media-src blob:`

The staging iframe is removed in a `finally` after every operation. It can never
become a presentation or print authority — that is the "staged generation"
term's whole point (`CONTEXT.md`).

### 3.2 One generation, end to end

```
  source (html | lightDom)
        │
        ▼
  [1] input byte limit
        │
  [2] extension transform / transformEntry     ← re-sanitized + re-limited after EACH
        │
  [3] prepareDocument (string domain)          ← DOMParser; script/handler/URL policy, break-contract normalization
        │                                        extracts <template data-page-header/footer>
  [4] asset resolution                          ← the ONLY gate for external bytes
        │                                        MIME allowlist → magic bytes → decode proof → blob:
  [5] copy into staging frame + node limit
        │
  [6] sanitizeFrameContent × 2                  ← semantic copy (keeps safe links) + frame copy (strips them)
        │
  [7] compile page-media + publishing CSS       ← @page rules, target-counter/text, string-set, floats
        │
  [8] retain semantic snapshot                  ← pre-pagination truth, feeds EPUB + outline
        │
  [9] multi-pass pagination in a probe element
        │     ├─ settle fonts + image decode
        │     ├─ capture break constraints per element
        │     ├─ recursive fragmentation (yielding at every checkpoint)
        │     └─ resolve generated values → layout signature
        │        repeat until the signature is a fixed point
        │
  [10] decorate pages, resolve tokens + margin boxes,
       locate warnings, finalizePage extensions
        │
        ▼
  BuiltGeneration { fragment, css, pages, warnings, timings, blobUrls, snapshot, revoke() }
        │
        ▼
  ══════ COMMIT ══════  snapshot canonical head/body/lang
                        replaceChildren(head) ; replaceChildren(body)   ← synchronous, atomic
                        finalizeCommit (Publication builds its document here)
                        on throw → restore snapshot
        │
        ▼
  frozen PageDocument { generation: n+1, iframe, pages, warnings, ... }
  then: release previous semantic snapshot, revoke PREVIOUS blob URLs
```

Everything from [1] to [10] happens against the staging document. The canonical
frame is touched exactly once, at the commit line.

### 3.3 Convergence

Pagination is not single-pass because generated content depends on layout and
layout depends on generated content: `target-counter(page)` needs to know which
page a target landed on, and inserting the resolved number can change where
things land. Each pass produces a **layout signature** (page membership +
generated values + placements). The loop accepts a pass when its signature
equals the previous one. A repeated-but-not-equal signature is a cycle, and
exhausting `maxLayoutPasses` is a failure — both surface as
`LAYOUT_NON_CONVERGENT` rather than as a silently wrong document. When nothing
requires convergence, exactly one pass runs.

### 3.4 Fragmentation is a proven subset, not a best effort

Per element, `captureBreakConstraints` classifies a `FragmentationLayout`:
`normal`, `table`, `safe-flex`, `safe-grid`, `safe-multicol`, or one of the
`unsupported-*` classes. The "safe" classes are gated behind strict structural
predicates — e.g. a table is only split when its structure is recognizable
(bounded spans, well-formed `thead`/`tfoot`/`colgroup`), a grid only when tracks
are explicit and unnamed with row auto-flow, multicol only for a tightly
enumerated horizontal LTR subset. Anything else is kept **atomic** on one page
and reported with `UNSUPPORTED_LAYOUT`.

This is the mechanism behind the compatibility matrix's Constrained tier: the
tier is not documentation about code, it is a description of these predicates.

Fragmentation strategies in use: shell cloning for normal blocks; grapheme
binary-search for text with rendered-line widow/orphan legality; `<br>`-line
groups; row-cluster table splitting with repeated caption/colgroup/thead/tfoot;
row-group grid splitting with track reassignment. Overflow tolerance is 0.5 CSS
px.

### 3.5 Cooperative time-slicing

Pagination cannot run in a worker — it needs live layout measurement, and any
worker approximation would be a second rendering authority (ADR 0012). Instead
every input-sized loop calls a shared `checkpoint(signal)`: it returns
`undefined` while inside the `yieldBudgetMs` budget (default 8 ms, no
allocation on the hot path) and otherwise an abortable promise that yields via
`scheduler.yield()` → `MessageChannel` → `setTimeout(0)`.

Two correctness rules make this safe: the scheduler promise is raced against the
`AbortSignal`, and the wall-clock `resourceDeadlineMs` counts scheduler, font,
and image waits — so a host scheduler that never resolves cannot hang the
controller. Cooperative and uninterrupted modes must produce the *same* accepted
page structure for identical input.

**Naming caution:** `page-document-scheduler.ts` is *only* this yielding
mechanism. Update serialization and commit atomicity live in
`createPageDocumentController` (`page-document.ts`), not in the file named
"scheduler".

### 3.6 Update serialization

A single `latestWork` promise chain guarantees at most one generation is
measuring or committing at any time. `begin()` aborts the active operation, then
awaits its predecessor (swallowing its rejection) before touching either iframe.
Abort/destroy/supersession guards are re-checked at both the pre-build and
pre-commit boundaries.

Failure semantics are uniform: a failed or superseded update rejects its own
promise and leaves `current` untouched. `latestCommitted()` loops until the work
chain is stable and returns the last good document even when the newest attempt
failed — it throws only if there has never been a commit.

### 3.7 Transactional resources

Everything the pipeline acquires follows commit/rollback discipline:

| Resource | On success | On failure / supersession |
|---|---|---|
| Blob URLs | revoke the **previous** generation's, after the swap | revoke the **new** generation's |
| Semantic snapshot | release the previous one | discard the new one |
| Extension `onCleanup` | run LIFO | run LIFO |
| Staging iframe | removed in `finally` | removed in `finally` |

Semantic snapshots are **lease-counted**, so an EPUB export already in flight
keeps its snapshot alive across a supersede.

---

## 4. Security boundary

**Threat model.** Authored HTML/CSS is untrusted. Extensions are semi-trusted
code whose *output* is untrusted. The host `assetResolver` is the single gate
through which external bytes may enter. The committed frame must end up
containing no executable content and no network references — only inline styles
and `blob:` URLs minted by the resolver.

Defense is layered, and every transition re-sanitizes:

1. **String-domain policy** (`DOMParser`, before the staging iframe) — removes
   `script`/`iframe`/`object`/`embed` and `meta http-equiv=refresh`, strips
   `on*` handlers, blocks `javascript:` and `data:text/html` unconditionally.
2. **Resolver-input sanitization** — narrows HTML to resource attributes the
   resolver can legitimately service; strips SVG animation, SVG CSS-valued
   attributes with external `url()`, `target`; unwraps forms.
3. **Asset resolution** — the resolver's bytes are *copied*, then must pass a
   MIME allowlist, container-signature sniffing (font magic, media magic), and
   an actual **decode proof** (`createImageBitmap` / `FontFace.load` /
   `loadedmetadata`) before a `blob:` URL is minted. Failures are
   `RESOURCE_RESOLUTION_FAILED`; extension vetoes and unsafe URLs are a blocked
   *outcome*, not an error. Reference count, recursion depth, and cumulative
   bytes are all hard-limited.
4. **Frame-content sanitization** — strips *all* resource attributes unless the
   value is a same-document fragment or provably one of this generation's
   resolved blob URLs (for `srcset`, **every** candidate must be resolved). CSS
   escapes are decoded first, so `\75 rl(...)` cannot smuggle a URL through.
5. **Frame hardening** — sandbox without `allow-scripts` plus the CSP meta. Even
   if a vector survived every DOM pass, the frame can neither execute script nor
   fetch.
6. **Export assertion** — serialized EPUB XHTML is rejected outright if it still
   contains `data-imposia-` or `blob:`.

CSS-parity differences are explicitly out of security scope (`SECURITY.md`);
iframe/CSP/sandbox escape, sanitization, resolver-only loading, blob URL
lifecycle, EPUB generation, and cross-document exposure are in scope.

---

## 5. Extension runtime

Extensions are ordered, browser-only policy objects. Composition has exactly one
rule: **array order**. There is deliberately no priority sorting, no
before/after hooks, no command registry, and no extension storage (ADR 0005).

| Hook | Sync? | Receives | Constraint |
|---|---|---|---|
| `transform` | async | html/css strings | page documents only; output re-sanitized and re-limited |
| `transformEntry` | async | one sanitized entry copy | publications only; never the composed source |
| `allowAsset` | sync | asset request | AND-combined; first `false` blocks; reasons deliberately not exposed |
| `decoratePage` | sync | immutable `{number, totalPages, side, blank}` | returns header/footer HTML; no DOM access, cannot repaginate |
| `finalizePage` | sync | the **live** page element + table split provenance | the narrow, deliberate exception to DOM isolation |

`finalizePage` is the one place an extension touches real DOM. Its output is
*not* re-sanitized — doing so would mangle Core's `!important` geometry — and
safety rests instead on the script-disabled sandbox and the resolver-only asset
pipeline.

What no extension ever receives: an iframe, a `Document`, the resolver, a blob
URL, the raw committed source, a mutable warning collection, or a lifecycle
hook. No extension can weaken CSP or limits, suppress a Core warning, replace
the resolver, intercept `print()`, or break atomicity. Warning codes must be
`EXTENSION_*`, are deduplicated, and are ordered deterministically after Core
warnings. Any failure rejects the whole generation with `EXTENSION_FAILED`.

The options array is snapshotted field-by-field at mount, so mutating the
caller's objects later cannot change behavior mid-flight.

The shipped preset, `createTableColgroupExtension`, uses `finalizePage` to
measure an origin table's column widths and freeze them onto continuation
fragments across a page split.

---

## 6. Layers above Core

### 6.1 DOM ownership

This is the single rule that organizes all three upper layers:

| Layer | Owns | Restores on destroy |
|---|---|---|
| Core | the canonical iframe and everything inside it | removes the iframe |
| Viewer | removable chrome *around* the iframe, in the host document | every snapshotted container/iframe attribute |
| React | exactly one `<div>` host | unmounts it |

`mountPageViewer` **adopts, never creates**: it requires that the page
document's iframe already be a child of the container, validates the canonical
frame markers, snapshots existing attributes, and restores all of them on
`destroy()`. Presentation is done by measuring page geometry inside the frame
and driving the *outer* iframe element's width/height/margin/clip-path/
transform — pages are never cloned or re-laid-out. Spread mode injects one
scoped `<style>` plus two attributes into the frame and removes them on destroy.

### 6.2 Generation as the universal safety primitive

All cross-generation safety in the system reduces to two primitives:

1. the monotonic `generation` number, and
2. object-identity membership in frozen per-commit arrays (warnings,
   thumbnails, search results).

The generation number appears everywhere: `refresh()` demands a strictly newer
generation; the React binding compares `viewer.state.generation !==
pageDocument.generation`; destinations carry their generation and throw
`STALE_PUBLICATION_DESTINATION` on mismatch; it is even surfaced declaratively
as `data-imposia-generation` on the React host div.

### 6.3 React adapter

The seam is: **declarative in, imperative out.**

- `source`/`snapshot` props plus revision tokens flow *in* and become
  `controller.update()` calls. A source change never remounts — only an
  options-revision bump does.
- The committed `PageDocument` *is* the React state value.
- Everything below the host div — viewer chrome, iframe layout, panels — plus
  all handle methods (`goToPage`, `setMode`, `setZoom`, `print`, `exportEpub`,
  TOC/search/thumbnail/deep-link control) are imperative.

Three mechanisms keep this correct under React 19 StrictMode and concurrent
rendering:

- **Staleness fencing.** A monotonic operation counter is captured per async
  operation; every continuation checks disposal, counter identity, and mounted
  options revision before committing state. StrictMode's mount→unmount→mount
  therefore produces a destroyed first controller whose late resolution is
  dropped and whose `AbortError` is swallowed.
- **Callback churn immunity.** Every prop is mirrored into a ref each render and
  read through the ref inside effects, so re-created callbacks never retrigger
  an effect. `onProgress` is wrapped once at mount so Core keeps a stable
  function reference.
- **Ready gating.** The user's `onReady` fires only after the *viewer* has
  caught up to the committed generation, so handle methods called from inside
  `onReady` observe a consistent viewer.

Loading and error states are non-destructive: the previously committed document
stays in `state.document` during a reload, mirroring Core's retain-while-staging
contract at the React layer.

### 6.4 Viewer

Two disjoint mount APIs rather than runtime polymorphism:

- `mountViewer(container, source, options)` — the PDF.js viewer. Creates its own
  DOM, rasterizes pages to canvas with windowed rendering and render-task
  cancellation.
- `mountPageViewer(container, pageDocument, options)` — the Imposia viewer.
  Adopts Core's iframe as described above.

They share only the chrome factory (rail, toolbar, indicators), the theme
binding, and the stylesheet. `PageViewerMode` extends `ViewerMode` with
`"spread"` on the page side only, leaving the PDF contract untouched.

Reader features are projections, never independent sources of truth: the TOC is
a projection of `PublicationDocument.outline`; search is a UI shell over
`controller.search()`; thumbnails are abstract CSS previews computed from
committed page metadata (no rasterization, no cloning, no second iframe).

**Deep links** store *only* the destination id (`v1.` + `encodeURIComponent(id)`).
Page and generation are always re-derived by resolving that id against the
current commit — which is exactly why a link survives snapshot replacement.
Restoration strictly round-trips the encoding before resolving.

**Themes** are `--imposia-viewer-*` custom properties, validated against
`/^--imposia-viewer-[a-z0-9-]+$/u`, applied as inline styles **only on the
viewer root element** — outside the canonical iframe — with per-property
original values recorded and restored on change and on destroy. Nothing crosses
`contentDocument`. The claim that viewer theming never restyles the authored
document is structural, not conventional.

---

## 7. Publication

A Publication is an ordered collection of semantic entries that share metadata,
reading order, outline, and **one** committed page sequence.

The key implementation fact: entries are composed into a **single HTML
document**, each wrapped in `<section data-imposia-publication-entry="i">` with
head styles hoisted and URLs rebased against the entry's `baseUrl`. Global page
numbering therefore falls out for free — it is one pagination over one
concatenated flow, not a merge of independently paginated documents. Entry page
ranges are derived at commit by scanning committed pages for entry markers.

Mutation is **whole-snapshot replacement** (ADR 0007). Core deliberately exposes
no partial-update scheduler, which is what keeps atomicity, CSP, cleanup, and
the resolver boundary intact.

The **outline** is the single navigation authority (ADR 0008), shared by the
Viewer TOC, EPUB nav, and deep links. Its structure comes from the semantic
snapshot; its titles come from *visible* committed heading text (accounting for
`thead` repetition across page fragments); its pages come from the first
committed occurrence of each destination marker. No surface re-parses rendered
DOM on its own.

**Page identity is global** (ADR 0009). Every entry exposes an inclusive range
into one continuous sequence; Viewer state, destinations, deep links, print, and
diagnostics all address the same immutable numbers. Global page numbers are
stable *within* a generation; stable destination ids are what resolve *across*
generations.

Publications mount through an internal `mountPageDocumentWithFinalizer` seam:
the `PublicationDocument` — entry ranges, relocated warnings, outline, search
index — is built inside `finalizeCommit`, within the atomic commit. If it
throws, the page-document commit rolls back with it.

---

## 8. Output surfaces

### 8.1 Native print

`print()` waits for the latest commit, then clones the committed frame content
into the **top window's** document inside a `div[data-imposia-print-root]` with
an open shadow root and `:host { all: initial }`. Computed custom properties and
inherited typographic properties are copied across the boundary.

Because `@page` and `@font-face` cannot act from inside a shadow root, those
rules are hoisted into a top-document `<style>` alongside print isolation CSS
that hides every other body child under `@media print`. Fonts and images are
settled within a deadline, then `window.print()` runs. Cleanup happens on
`afterprint` or via a 60 s retention timer.

Per-page sheet sizes come from the committed `@page imposia-sheet-N` rules bound
by page number, so documents with mixed page geometries print correctly.

**There is no PDF byte generation.** Save-as-PDF is the browser's, which is
precisely how a second renderer is prevented from drifting away from preview.

### 8.2 Semantic EPUB export

Export is **semantic, not visual**. It reads the retained pre-pagination
`PageSemanticSnapshot` — HTML, compiled CSS, resolved asset bytes — and never
the paginated pages. `exportEpub()` always routes through the controller so it
exports the latest committed document under a snapshot lease.

The projection strips page furniture (headers, footers, margin boxes, footnote
areas) and every `data-imposia-*` attribute, rewrites `blob:` URLs to archive
hrefs, removes page-only CSS (`@page`, `string-set`, `float-reference`,
`counter(page)`, `data-imposia-` selectors), and keeps only safe semantic
hyperlinks.

The output is **byte-deterministic**: a hand-written *stored* (uncompressed) ZIP
with fixed DOS timestamps, `mimetype` first as OCF requires, path-traversal
validation, duplicate rejection, byte-deduplicated assets numbered stably, and
an epoch default for `modified`.

Two shapes: a single `content.xhtml` for a page document, or one
`entry-NNNN.xhtml` per entry in spine order with nav built from the committed
outline.

Export lives inside Core rather than in a separate package because it reads
private state — the retained snapshot, resolver-owned asset bytes, private
Publication markers, the outline. ADR 0010 fixes that boundary and sets three
explicit revisit triggers (EPUB > 10 KiB gzip; Core route over budget with EPUB
as the largest removable contributor; a second exporter needing the same trusted
projection). Measured cost at the time of the decision: **5.4 KiB gzip**.

---

## 9. Errors, warnings, and recovery

**Errors** abort a generation; the controller and the previously committed
document survive. They are `ImposiaError(code, message)`, `TypeError`, or
`AbortError`. Codes cluster into limits (`NODE_LIMIT`, `PAGE_LIMIT`,
`ASSET_*_LIMIT`, `GENERATED_*_LIMIT`, `EPUB_ARCHIVE_LIMIT`), timing
(`RESOURCE_TIMEOUT`), convergence (`LAYOUT_NON_CONVERGENT`), resolution
(`RESOURCE_RESOLUTION_FAILED`), extensions (`EXTENSION_FAILED`), and validation
(`INVALID_PAGE_GEOMETRY`, `INVALID_PUBLICATION`, `INVALID_EPUB_*`,
`STALE_PUBLICATION_DESTINATION`, `PUBLICATION_DESTINATION_NOT_FOUND`).

**Warnings** are the mechanism by which "out of boundary" stays visible instead
of becoming silent approximation. Every warning names the recovery that was
taken — kept atomic, applied `overflow-wrap: anywhere`, relaxed widows/orphans
to the latest legal breakpoint, left the reference empty, kept the footnote in
flow, retained the prior valid `@page` value.

Warnings are **deduplicated and ordered in authored source order** at every
layer: prepare-stage warnings dedupe by `(code, property, value)` and sort by
source offset; fragmentation warnings dedupe by `(code, sourceIdentity)`. At
commit they are relocated with the final generation number and page, and
`pageWarningTargetBounds()` can point diagnostics UI at the offending live
element — which is what the opt-in Viewer Inspector uses to draw its
highlights in the top document (never inside the frame).

**Limits are ceilings, not defaults.** User-supplied limits may only *lower*
`DEFAULT_PAGE_LIMITS`; values above the default are rejected.

---

## 10. The compatibility model

The four tiers in [../compatibility.md](../compatibility.md) *are* the "declared
input boundary" that pagination integrity is scoped to.

| Tier | Meaning |
|---|---|
| **Stable** | Public, tested behavior in the declared browser contract; shape and lifecycle preserved |
| **Constrained** | A stable, intentionally smaller subset; input outside it stays atomic or warns. Not full CSS parity |
| **Experimental** | Opt-in, draft-heavy, explicit limits, may produce a typed fallback warning |
| **Unsupported** | Outside the product contract; no equivalent result promised |

Roughly: the package surface, committed sequence integrity, cooperative
pagination, the React lifecycle, Publication + Reader navigation, search,
thumbnails, the Inspector, presentation modes, the canonical DOM/staging/
resolver/rollback machinery, authored `@page` rules and the six margin boxes,
breaks and parity and `break-inside: avoid`, widows/orphans, EPUB export, and
native print are **Stable**. CJK line breaking, hyphenation, long tokens,
tables, flex, grid, multicol, and local target references / named strings are
**Constrained**, each with an enumerated legal subset and a named fallback
warning code. Footnotes and page floats are **Experimental** behind flags.
Fixed-layout EPUB, PDF bytes, Node/CLI rendering, and full CSS parity are
**Unsupported**.

Chromium is the **structural pagination reference**. Firefox and WebKit are
exercised for the public API, iframe/CSP isolation, resolver boundary, lifecycle
and cleanup, print invocation, and EPUB archive behavior. Exact cross-browser
page-count or pixel parity is not promised.

Promotion between tiers is evidence-gated: a new Stable or Constrained subset
requires a minimal fixture demonstrating the legal boundary *and* the fallback
outside it (ADR 0011).

---

## 11. The five integrity invariants

ADR 0011 states the product contract as five invariants that hold for Stable and
Constrained behavior. Mapping each to the mechanism that implements it:

| # | Invariant | Implemented by |
|---|---|---|
| 1 | **Content integrity** — fixture content exactly once, in source order | Fragmentation with source-order traversal; marker uniqueness/order asserted by the parity suites |
| 2 | **Page-sequence integrity** — metadata, membership, destinations, located warnings, Viewer state, and print all address one immutable global sequence | Single concatenated flow; global numbering; warning relocation at commit |
| 3 | **Generation integrity** — only the latest committed generation is observable | Staging iframe; single atomic swap; frozen `PageDocument` |
| 4 | **Update integrity** — failure, cancel, or supersession preserves the previous commit; success is one atomic commit | `latestWork` chain; commit rollback; transactional blob/snapshot lifecycle |
| 5 | **Failure visibility** — out-of-boundary input stays atomic, recovers, or warns; never described as complete CSS support | `unsupported-*` layout classes + typed warnings naming the recovery |

---

## 12. Verification

The project's verification stance is that a passing static check is not
sufficient: the canonical iframe, the export Blob, rollback, and the
cross-browser boundary are exercised on real surfaces.

| Layer | Location | What it proves |
|---|---|---|
| Vitest unit | `tests/core/` (9 files) | Core logic *and the enforcement scripts themselves* — package boundary, bundle budgets, license policy are unit-tested |
| Type surface | `tests/typecheck/public-surface.ts` | The published type surface compiles for a consumer; API-shape regressions become type errors with no runtime involved |
| Playwright e2e | `tests/e2e/` (45 specs) | Chromium + Firefox + WebKit, driving the **built** `packages/core/dist/index.js` through an import map — not source |
| Parity | `browser-core-fragmentation` + `browser-core-breaks` | Source ↔ committed-page content parity: every marker exactly once, in source order; authored breaks produce the exact page/side/blank structure |
| Site | `playwright.site.config.ts` | Locale routing, redirects, zero console errors |
| Visual | Playwright `toHaveScreenshot` | Committed spread/cover snapshots (Chromium/Darwin) |

Two details matter architecturally. First, e2e loads the **built bundle**, so
the tests exercise what consumers actually install. Second, every spec asserts
zero browser errors against a small allowlist of expected sandbox traces.

Live fixtures are typed `ConformanceFixture` objects (flex/grid/table/multicol/
CJK) carrying generated numbered markers, per-browser expected status
(`supported` | `fallback`), and expected warning codes — so a fixture asserts
both the legal case and its documented fallback.

Recorded release matrix (`docs/verification.md`): **354 browser scenarios
passed, 120 intentional skips, 0 failures, 474 total**, plus 8 site scenarios
and 23 Vitest scenarios.

A performance baseline is recorded in `benchmarks/baseline.json` (M1 Max,
schemaVersion 2): warm medians of **105 ms / 10 pages, 146 ms / 50 pages,
332 ms / 200 pages**, broken down into resource wait, print preparation, and PDF
generation phases.

---

## 13. Build and enforcement

### 13.1 `pnpm build`

```
clean-package-dists      remove dist/ + tsbuildinfo (no stale incremental state)
      ↓
tsc -b                   project references: core → viewer → client → react
      ↓
build-core-browser       esbuild core to ONE browser ESM bundle (inlines postcss),
                         then fail if the metafile shows a Node builtin, Playwright, or pdfjs
      ↓
build-demo               bundle examples/demo + examples/react to committed .js
      ↓
site:build               react-router build → check-site-prerender → copy-site-demo
      ↓
check-core-package-boundary   textual re-scan of the final publishable dist
```

Core's tsc output is deliberately **overwritten** by the esbuild bundle; only
its `.d.ts` files survive from `tsc -b`.

### 13.2 What the scripts protect

| Script | Invariant |
|---|---|
| `check-core-package-boundary` / `core-package-boundary` | Published core is browser-only and clean-room-safe: no Node builtins, no Playwright, no pdfjs — plus a **legacy renderer blocklist** so remnants of the pre-clean-room Node renderer can never resurface — and the package entry (`dist/index.js` / `dist/index.d.ts`) never exports an `internal*TestApi` test seam (§13.5) |
| `check-site-prerender` | All 40 routes (4 locales × 10 paths) truly prerendered — Fumadocs shell present, `<html lang>` matches the path locale, no `hydrate-fallback` — and `_redirects` matches exactly |
| `bundle-size` / `bundle-size-report` | Six consumer routes stay under gzip budgets; overage is a hard failure naming the route and the excess |
| `preflight` | Node ≥22, lockfile, full Apache-2.0 text, third-party notices, all three Playwright browsers installed — fails fast before expensive steps |
| `licenses` + `license-policy` + `license-package-audit` + `core-bundle-license-audit` | SPDX allowlist with version-pinned reviewed exceptions; every packed tarball carries LICENSE/README/notices; **every package bundled into core's source map must appear in both notice files with full upstream text** |
| `copy-site-demo` | The deployed demo is byte-identical to `examples/demo/` |
| `capture-check` | Writes an evidence receipt for a full `pnpm check` run |
| `serve-viewer.mjs` | Hardened e2e static server with path-traversal and symlink-escape defenses |

The gates are themselves unit-tested in `tests/core/`, which is why a boundary
regression fails in seconds rather than at publish time.

### 13.3 Budgets

| Route | Gzip budget | Recorded (2026-08-20) |
|---|---:|---:|
| Core · PageDocument | 60 KiB | 56.8 |
| Core · Publication | 64 KiB | 60.8 |
| Viewer · PageDocument | 30 KiB | 28.2 |
| Viewer · PDF (incl. PDF.js) | 125 KiB | 120.1 |
| Client · PageDocument | 69 KiB | 65.3 |
| React · PageViewer | 71 KiB | 67.0 |

Budgets are constants in the script, so raising one is an explicit reviewed
diff.

### 13.4 CI and release

`pnpm check` = `preflight → typecheck → lint → test → bundle:size → build →
test:site → test:e2e → audit:prod → licenses`.

CI runs `CI=true pnpm check` followed by **`git diff --exit-code`** — the
checked-in generated artifacts (`examples/*/app.js`, `viewer.css`) must be
byte-identical to what the build regenerates.

Release is `workflow_dispatch` with an exact version input, gated by a protected
`release` environment and **npm trusted publishing via OIDC** (no npm token in
secrets). It asserts the ref is `main`, all four manifests equal the input
version, and release notes exist; then publishes **idempotently** — if the
version already exists on npm its `dist.integrity` must match the local
tarball's sha512 or the job fails. Publish order follows the dependency graph:
core → viewer → client → react. Tags are immutable (an existing tag must resolve
to the same SHA and is never moved).

### 13.5 Test seams and the published dist

Core occasionally needs a test-only seam so an e2e oracle spec can drive an
internal function directly (today: `internalTextSplitTestApi` in
`packages/core/src/page-document-generation.ts`, consumed by
`tests/e2e/browser-core-line-ends-oracle.spec.ts` through a deep URL import of
the compiled `dist/page-document-generation.js`). The convention:

- **Naming.** A test seam is a frozen namespace whose name follows the
  `internal*TestApi` pattern. Nothing else may use that name shape.
- **Never on the entry surface.** A seam is never exported from the package
  entry (`src/index.ts`, and therefore `dist/index.js` / `dist/index.d.ts`).
  `check-core-package-boundary` enforces this: it extracts every exported name
  from both built entry artifacts and fails on any `internal*TestApi` match; a
  wildcard re-export on the entry also fails, since it would make the export
  surface unverifiable.
- **Lifetime.** A seam lives exactly as long as the oracle spec that consumes
  it — they are added and removed together. In particular, the sequential
  line-ends path remains the authoritative fallback even after ASA-444 removes
  the `forceLegacyLineEnds` hatch, so ASA-444 must not delete the seam or its
  oracle spec as "legacy".
- **dist internals are not a contract.** Only the `"."` entry of the exports
  map is public API. The per-module `dist/*.js` files (tsc output left in
  place next to the bundled `index.js`) do ship in the tarball and are
  reachable through CDN deep URLs, but they are unsupported internals that may
  change or disappear in any release without notice. They are currently kept
  in the tarball because `tests/core/packed-publication-adapters.test.ts`
  packs the workspace in the tsc-only dist state (before `build-core-browser`
  has overwritten `dist/index.js`), where the entry still resolves its
  per-module siblings; pruning per-module `.js`/`.js.map` from the tarball
  (~54% of its unpacked bytes as of 2026-08-21) is a known follow-up once
  packing is guaranteed to happen only after the browser bundle build.

---

## 14. Documentation site

`site/` is a React Router 8 **SPA** (`ssr: false`) with prerendering, deployed to
Cloudflare Pages from `site/build/client`.

Three routes only: `/` redirects to `/en`; `/:lang` is the marketing landing on
a Fumadocs `HomeLayout`; `/:lang/docs/*` is the docs on `DocsLayout`/`DocsPage`.
Content is Fumadocs-MDX over `site/content/docs`, with locale-suffixed filenames
(`getting-started.ko.mdx`) across `en`, `ko`, `zh-CN`, `ja` — 9 logical pages ×
4 locales = 36 MDX files. `hideLocale: "never"`, so the locale is always in the
URL.

Prerendering covers 10 paths × 4 locales = 40 static HTML routes, verified after
every build. The runnable demo is served by a Vite middleware in dev and copied
into the build output in production, so the site always ships exactly the demo
in `examples/demo/`.

Public docs follow the reader journey — `getting-started`, `concepts`, `guides`
— with package references grouped under `api/react`, `api/core`, `api/viewer`.
Legacy flat URLs are redirected both by Cloudflare `_redirects` and client-side.

Localized READMEs mirror the English structure exactly (same 17 headings in the
same order, same 16 code examples); only prose is localized. Package READMEs,
ADRs, contracts, and the CHANGELOG are intentionally English-only.

---

## 15. Governance

- **License** — Apache-2.0 throughout. Core bundles PostCSS, nanoid, and
  picocolors; `pdfjs-dist` stays an external Viewer dependency. Every
  tarball carries its own LICENSE and notices.
- **Clean-room** — Independently authored from repository requirements and
  cited public specifications only (W3C CSS break/page/content/GCPM/page-floats/
  tables/multicol/flexbox/grid, WHATWG HTML/DOM, EPUB 3.3/OCF, MDN, Playwright).
  Competitor documentation may inform only a high-level capability inventory,
  never implementation, API, architecture, test, fixture, or naming decisions.
  An eight-item contributor checklist is mandatory before review.
- **Security** — Private reporting via GitHub Security Advisories; ack ≤5
  business days, initial assessment ≤10.
- **Contribution** — One public contract per change; contract changes require
  doc updates plus an observable regression test; behavior must be tested
  "through the same public interface a user calls."
- **Agent workflow** — Issues are local Markdown under `.scratch/<feature>/`;
  triage uses five canonical labels; domain docs use a single-context layout
  rooted at `CONTEXT.md` with `docs/routing.md` as the entry point. Agents must
  use glossary vocabulary and **flag ADR conflicts explicitly** rather than
  silently overriding them.

---

## 16. Maturity

`0.4.1` (2026-07-27). The project describes itself as "a feature-complete early
`0.x` release, not a mature replacement for every CSS typesetting or PDF
generation workflow" — the evidence is fixture-scoped and broad adoption is not
yet proven.

Release history: `0.1.0` initial family → `0.1.1–0.1.3` (trusted publishing,
security fixes, repositioning integrity as the primary contract) → `0.2.0`
(headless Viewer controls, scoped Viewer CSS) → `0.3.0` (`finalizePage`,
table-colgroup preset, isolated top-document print) → `0.4.0` (cooperative
pagination) → `0.4.1` (multi-page print fix, responsive Viewer panels) →
`0.5.0` (browser-native parsing, fragmenter performance batch, bundled
dependency security patch) — prepared but **not yet published**.

Milestones are named by outcome and are **decoupled from package version
numbers** — a milestone may span several releases, and a release may carry
work from several milestones. See [`../roadmap.md`](../roadmap.md), which is
authoritative for ordering: **Publish** (`0.5.0` actually reaches consumers
and its recorded debts are settled) → **Proof** (an adopter can reproduce the
CSR publishing advantage from packed artifacts, a comparison protocol, and
representative fixtures) → **Adoption** (accepted real-document blockers drive
compatibility and performance work) → **Contract** (migration policy,
deprecation rules, extension guidance, operational diagnostics) → **`1.0`**,
the one milestone that keeps its number, which "must not be declared from
internal scenario count or feature breadth alone" but only from external
production evidence.

Prioritization order: integrity defects inside a declared boundary > adopter
reproducibility > accepted real-document blockers > maintenance > new
capability.

---

## Appendix A — Where things live

| Concern | Module |
|---|---|
| Controller, commit, rollback, print entry, destroy | `core/src/page-document.ts` |
| The whole build pipeline (stages 1–10 above) | `core/src/page-document-generation.ts` |
| Cooperative yielding only (**not** update serialization) | `core/src/page-document-scheduler.ts` |
| Frame identity, sandbox, CSP, atomic swap | `core/src/page-document-frame.ts` |
| String-domain HTML policy | `core/src/html-policy.ts`, `core/src/document.ts` |
| Frame/CSS/resolver-input sanitization | `core/src/page-document-sanitize*.ts` |
| Asset discovery → resolution → readiness | `core/src/page-document-assets*.ts` |
| `@page` model, cascade, margin boxes | `core/src/page-media.ts` |
| GCPM: target-counter/text, string-set, footnotes, floats | `core/src/page-document-publishing.ts` |
| Extension runtime and hook dispatch | `core/src/page-document-extensions.ts` |
| Publication composition, outline, search | `core/src/publication*.ts` |
| Semantic snapshot registry | `core/src/page-document-semantic.ts` |
| EPUB projection + deterministic ZIP | `core/src/epub-export.ts`, `core/src/epub-zip.ts` |
| Print isolation and rule hoisting | `core/src/page-document-print.ts` |
| Viewer adoption, presentation, spread | `viewer/src/mount-page-viewer.ts` |
| Reader panels | `viewer/src/publication-{reader,toc,search,thumbnails,deep-link}.ts` |
| Theme token binding | `viewer/src/viewer-theme.ts` |
| React lifecycle and fencing | `react/src/use-imposia-{document,publication}.ts`, `use-page-viewer-binding.ts` |

## Appendix B — Known documentation drift

Recorded at the time of writing so it is not rediscovered repeatedly. None of
these are code defects.

1. **`.omo/evidence/` does not exist in the repository.** `docs/verification.md`
   and ADR 0006 cite roughly a dozen captured artifacts under that path (green
   logs, `epub-export-proof.epub`, `browser-core-canonical-print.pdf`, manual QA
   records). The executable suites all exist; the recorded artifacts do not, so
   the artifact-backed half of the verification story is not reproducible from a
   fresh clone.
2. **Resolved (ASA-445):** `SECURITY.md`'s supported-versions table listed
   "Latest `0.1.x` release" and now reads `0.5.x`. The `0.4.2`
   security-backport question was decided on ASA-443 (2026-08-21): **no
   backport** — both advisories' vulnerable paths measured unreachable in the
   published `0.4.1` browser artifact; evidence in the 0.5.0 migration note's
   security-patch section.
3. **Resolved (ASA-445):** `docs/roadmap.md` was reset for the post-`0.5.0`
   world, and `docs/open-source-readiness.md` now states which release its
   launch boundary was proven by and that those gates must be re-run on the
   `0.5.0` commit.
4. **Resolved (ASA-445):** ADR 0011's required follow-up is now recorded as
   delivered in 0.1.3.
5. **Resolved (ASA-445):** ADR 0010's status no longer scopes itself to the
   `0.1.x` browser contract.
6. **Resolved (ASA-432):** the vestigial `test:integration` script (targeting a
   nonexistent `tests/integration/` directory) has been removed; `pnpm test`
   covers all of `tests/**`.
7. **Resolved (ASA-432):** the unused `pixelmatch` and `pngjs` devDependencies
   (and their `@types`) have been removed; the visual snapshot comparison they
   dated back to was replaced by structural geometry assertions.
8. **Resolved (ASA-432):** the unreferenced `tests/fixtures/{parity,pdf}`
   legacy corpus from the removed Node-renderer parity gate has been deleted.
   The live fixture mechanism is `tests/e2e/conformance-performance-fixtures.ts`.
9. **Resolved (ASA-445):** `RELEASING.md`'s manual `pnpm publish` path is
   removed; the OIDC `Release` workflow is documented as the only publish
   path, and the per-package `pack --dry-run` inspection it superseded is kept
   as pre-release inspection.
10. **Still open (ASA-448):** `pnpm build` regenerates the committed minified
    demo bundles, so the release gate's `git diff --exit-code` couples to that
    churn and any unrelated Core change rewrites a few hundred lines of
    generated `.js`.
