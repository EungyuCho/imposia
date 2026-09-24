# Migrating from 0.5.0 to 0.6.0 (unreleased)

`0.6.0` is a minor release with four breaking changes: printing preserves
backgrounds by default (ASA-459), hoisted print `@font-face` families are
namespaced away from the host document (ASA-462), the React hooks gained an
`aborted` document status (ASA-461), and the PDF.js viewer `mountViewer` was
removed from `@imposia/viewer`.
Most applications upgrade without a code change. This note exists so the
exceptions are findable without reading commit history.

> Release checklist: when `0.6.0` ships, rename this file to `0.6.0.md`,
> update the migrations line in [`routing.md`](../routing.md), and replace the
> link in the `0.6.0` CHANGELOG section.

```bash
pnpm add @imposia/core@0.6.0 @imposia/viewer@0.6.0 @imposia/client@0.6.0 @imposia/react@0.6.0
```

All four packages move together. Mixing a `0.6.0` package with a `0.5.0` one is
not a supported combination.

## What can change for your application

### 1. Printed output includes backgrounds by default

The print shadow root now sets `print-color-adjust: exact` (with the WebKit
prefix), so backgrounds survive printing regardless of the print dialog's
"Background graphics" checkbox. Every consumer's printed output changes: a
shaded table header that previously printed white now prints shaded, and ink
usage can increase.

The rule deliberately carries no `!important` and sits in the first stylesheet
of the shadow root, so the generation's own styles win. If you want the old
ink-saving behavior, declare it in your content:

```css
@media print {
  :root { print-color-adjust: economy; -webkit-print-color-adjust: economy; }
}
```

### 2. Hoisted print font families are renamed

`@font-face` is ignored inside a shadow tree, so the faces of a composed
document are hoisted into the top document when printing. Until now they
landed in the same namespace as the host application's own `@font-face`
declarations, and font matching does not care which stylesheet a face came
from — a weight or unicode range the composed document never loaded could be
satisfied by a host face, so the printed sheet used a real heavy cut where the
preview synthesised bold.

Every hoisted face is now renamed to `imposia-print-<n>--<family>` (`<n>` is a
per-print counter), and the style rules and inline styles inside the print
shadow are rewritten to match, case-insensitively. Consequences:

- The printed sheet falls back exactly where the composed document fell back.
  If your print output previously *depended* on a host-declared face filling
  in for the composed document, that gap now prints in the fallback face —
  declare the face in the composed document instead.
- Tooling that inspects the transient print stylesheet
  (`[data-imposia-print-style]`) or the print shadow by family name must
  expect the `imposia-print-` prefix.
- The rewrite is CSSOM-based. It does not reach `font` shorthands,
  `adoptedStyleSheets`, or families carried through `var()`; content relying
  on those keeps the authored family name and will not match the renamed face.
  Use the `font-family` longhand for content that must print in a hoisted
  face.

Families the hoisted faces do not declare — generic keywords, system fonts —
are untouched.

### 3. `ImposiaDocumentStatus` and `ImposiaPublicationStatus` gained `"aborted"`

When a live generation is aborted — typically because the `AbortSignal` you
passed in `documentOptions.signal` / `publicationOptions.signal` fired —
`useImposiaDocument` and `useImposiaPublication` now transition to a terminal
`aborted` state. Previously they stayed in `loading` forever: the reject
handler returned without a transition and the mount effect never re-runs on
its own.

- **Exhaustive `switch` statements** over the status unions stop compiling
  until they handle `"aborted"`. Treat it as a terminal state: nothing is in
  flight, nothing new was committed.
- **Loading overlays gated on `status === "loading"`** need a decision for
  `aborted`; checks written as `status !== "loading"` already behave
  correctly.
- A previously committed document or publication stays available on
  `state.document` / `state.publication`, exactly as it does for `loading`
  and `error`.
- A superseded or unmounted run still says nothing — the transition happens
  only when the aborted run is the live owner of the state.

### 4. `mountViewer` and the PDF.js dependency were removed

`@imposia/viewer` no longer ships the independent PDF viewer or depends on
`pdfjs-dist`. Imposia does not produce PDF bytes, so this viewer had no input
from the rest of the toolkit. Removed from `@imposia/viewer`,
`@imposia/client`, and `@imposia/react`:

- `mountViewer` and its `workerSrc` option.
- The types `ViewerController`, `ViewerMode`, `ViewerOptions`,
  `ViewerSource`, and `ViewerState`. `PageViewerMode` is now declared
  directly as `"continuous" | "single" | "spread"`.
- The stylesheet rules that only the PDF viewer used: `.imposia-stage`,
  `.imposia-pages`, `.imposia-page`, `.imposia-canvas`, `.imposia-page-tag`,
  `.imposia-state`, `.imposia-spinner`, and `.imposia-error`.

If you displayed PDF files with `mountViewer`, use
[PDF.js](https://mozilla.github.io/pdf.js/) directly, or the browser's
built-in viewer through `<iframe src="file.pdf">`. `mountPageViewer` and every
page-document Viewer contract are unchanged.

## Behavioral changes that are not breaking

These ship in the same release and can change what you observe without
requiring a code change (CHANGELOG has the full entries):

- **Legacy font MIME spellings are accepted** (ASA-457). Fonts served as
  `application/x-font-woff` and eleven other pre-RFC 8081 spellings now load
  instead of being silently blocked. The reported `mimeType` and the blob's
  type carry the canonical `font/*` spelling.
- **`RESOURCE_BLOCKED` is reported per resource** (ASA-458, ASA-465). Up to
  20 warnings per generation, each naming the kind (`property`), a
  Core-authored reason (`recovery`), and the resource via `sourceIdentity`.
  The authored URL and a resolver's own `reason` text never appear in
  warnings — diagnostics stay safe to publish. If you count or deduplicate
  warnings by code, expect more than one.
- **`@font-face` `src` lists collapse to their plain woff2 candidate**
  (ASA-460). `AssetResolver` implementations receive fewer font requests, and
  the engine-level fallback from a failing woff2 to a later candidate no
  longer exists for collapsed lists. Candidates carrying `tech()` are never
  chosen; lists without a plain woff2 entry are requested as authored.
- **A table row taller than a page is split across pages** (ADR 0014).
  Such a row used to stay atomic with `UNSUPPORTED_LAYOUT` and
  `PAGE_OVERFLOW`, and the part below the page edge was clipped. It now
  continues cell by cell on the following pages, so the page count of those
  documents grows and the two warnings disappear. The split row's cells carry
  an inline `box-sizing` and `width` that pin the column widths. Rows that fit
  on a fresh page, and `rowspan` clusters, behave as before.
- **Grids with column-spanning items fragment** instead of staying atomic.
  `grid-column: span N` and `grid-column: 1 / -1` no longer produce
  `UNSUPPORTED_LAYOUT`; the grid breaks between complete rows.
- **Top and bottom margin boxes size to their content.** A long footer next
  to a short page number takes the width it needs and wraps instead of being
  clipped at a third of the page. Margin-box declarations other than
  `content` (font, color, alignment, border, padding, background color) now
  apply instead of being dropped with `PAGE_RULE_UNSUPPORTED`.
- **Page DOM details.** A page carries a `[data-imposia-margin-box]` element
  only for boxes whose content is not empty, and every page carries a
  `data-imposia-sheet` attribute naming its print sheet. Both are private page
  DOM; code that queried the six always-present margin-box elements from a
  `finalizePage` extension or a host stylesheet sees fewer elements.
- **Limits can be raised** (ADR 0015). `maxInputBytes`, `maxNodes`,
  `maxPages`, and `resourceDeadlineMs` accept values above their defaults, up
  to 32 MiB, 1,000,000, 50,000, and 300,000. Defaults are unchanged. Code that
  relied on an above-default value throwing now gets a mount instead.
- **The `0.5.0` escape hatches are gone** (ASA-444).
  `experimental.forceSequentialPlacement`, `experimental.forceLegacyLineEnds`,
  and `experimental.forceFullConstraintCapture` are no longer part of
  `ExperimentalPageFeatures`. TypeScript callers that still set one stop
  compiling; JavaScript callers are ignored and get the fast path, which the
  equivalence oracles showed produces the same output. As announced in
  [`api-policy.md`](../api-policy.md), this is the scheduled removal, not a
  breaking change.
- **Fewer `UNSUPPORTED_LAYOUT` warnings.** An unsupported layout (row Flex,
  unsupported Grid placement, an unsafe table or multicol) that fits the page
  no longer warns; it warns when it overflows the page, spills out of its own
  box, or ignores a forced break inside it. If you surfaced every
  `UNSUPPORTED_LAYOUT` to authors, most of those warnings disappear, and the
  ones left point at content that is actually clipped or a break that did not
  happen.
- **New opt-ins.** `PublicationOptions.pageNumbering: "entry"` numbers each
  entry on its own; `@page :nth(An+B)`, all sixteen margin boxes, and the
  `A3`, `A5`, `B4`, `B5`, `Legal`, and `Ledger` page sizes are accepted.
  Nothing changes until a document or option uses them.

## What does not change

- Asset security posture. MIME canonicalisation does not weaken validation:
  container magic bytes are still verified, fonts still have to load through
  `FontFace`, and no alias can promote a non-font type into the font
  allowlist.
- Determinism. The print family counter names only the transient stylesheet
  in the top document; it never reaches pages or warnings.
- Every committed-document, page Viewer, and EPUB contract. The breaking
  changes above are confined to asset resolution, print output, the React
  status unions, and the removed PDF viewer; the layout changes only add
  supported input or restore content that was clipped.
