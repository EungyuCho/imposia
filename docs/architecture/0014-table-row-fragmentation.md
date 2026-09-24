# ADR 0014: fragment table rows taller than a page

Status: accepted

## Context

Semantic tables fragment only between complete row clusters. A row cluster
that does not fit on a fresh table fragment stays atomic: Core emits a located
`UNSUPPORTED_LAYOUT` and `PAGE_OVERFLOW`, and the part of the row below the
page edge is clipped by the page's `overflow: hidden`. The committed document,
the Viewer, and native print all lose that content.

Reports, statements, contracts, and audit logs hit this with ordinary input: a
description, notes, or terms cell whose text runs longer than a page. The
warning makes the loss visible, but the only recovery today is for the author
to restructure the table. The roadmap ranks work that removes content loss
first. Here the loss is declared (the row is outside the supported subset),
but it is the most likely way for a report to lose text in Imposia.

Browsers split table rows when printing: Chromium's LayoutNG table
fragmentation breaks inside rows, and CSS Fragmentation allows a break inside
a row when `break-inside` is `auto`. Imposia cannot delegate to that, because
page membership must come from Core's own fragmenter (ADR 0011).

## Decision

Core splits a table row across pages when, and only when, the row cannot fit
on a fresh table fragment. A row that fits on a fresh fragment keeps today's
behavior: it moves to the next fragment whole.

### Scope

A row is splittable when all of the following hold:

- its cluster is a single row (no `rowspan` greater than 1 starts in or
  reaches into it);
- it is in a `tbody` of a table that already passes `safeTableStructure`;
- it does not fit on a fresh table fragment, measured after the repeated
  `thead`, `tfoot`, and `colgroup`.

Anything else keeps the current atomic behavior and warning.

### Algorithm

The row is split cell by cell against the same page:

1. Measure each cell's width while the full row sits on the fresh fragment,
   and pin it on the cell (`box-sizing: border-box; width: <px>`). Then empty
   every cell, keeping its attributes, so the row box and column positions
   exist.
2. For each cell in source order, return its content and fragment it with the
   existing block fragmenter, using the cell as the cursor container and the
   page as the overflow root. The content that fits stays; the rest is
   carried into a continuation shell of that cell. Because each cell is
   fragmented alone against the remaining page height, and row height is the
   tallest cell, the row fits when every cell fits.
3. Create a continuation row on the next table fragment: a
   `#cloneFragment` of the `tr` and of every cell, with the carried content in
   each cell shell. Cells with nothing left stay as empty shells, so columns
   and borders line up.
4. If the continuation row still does not fit, repeat from step 2 on the next
   fragment.

Pinning the widths is required, not cosmetic. Under automatic table layout
the content placed in one cell changes every column's width, so a cell filled
later would squeeze the cells already placed on the page, and they would
overflow. The pinned widths are the ones the unsplit row has, which is what
browser print shows.

Cell content goes through the fragmenter that already handles block flow,
text lines, widows and orphans, and the supported table, flex, grid, and
multicol subsets. Content the fragmenter keeps atomic (an image, a `nowrap`
line, an unsupported layout) stays atomic inside its cell, with the warnings
it produces today.

### Interaction with existing rules

- `break-inside: avoid` on the row or a cell does not stop the split: the
  row has already been moved to a fresh fragment, so avoidance is relaxed
  with `AVOID_RELAXED`, as for other impossible avoidance.
- Forced breaks inside a cell keep their current treatment: a table with an
  internal forced break is outside `safeTableStructure` and stays atomic.
- `vertical-align: middle` and `bottom` apply to each part separately, as in
  browser print.
- Continuation tables already repeat `thead`, `tfoot`, and `colgroup`. The
  fragments of a split row share its pinned widths; other continuation
  fragments can still differ in column width under automatic table layout,
  and `createTableColgroupExtension()` remains the opt-in that freezes them.
- `finalizePage` receives each continuation table in `tableFragments` as
  today. A split row adds no new extension field.

## Alternatives considered

- **Split rows at every page end, as browser print does.** This fills pages
  more tightly, but it changes the page structure of every existing table
  whose rows fit today, which the parity oracles and every adopter's output
  depend on. It can be a later opt-in once this ADR's path is proven.
- **Scale or shrink the row to fit.** This is an approximation of the
  authored layout and conflicts with the rule that unsupported input warns
  instead of being approximated.
- **Leave the row atomic and improve the warning only.** The warning already
  names the row. It does not bring the text back.

## Consequences

- Rows taller than a page stop losing content, and the located
  `UNSUPPORTED_LAYOUT` for them goes away. `PAGE_OVERFLOW` remains only for
  content the cell fragmenter keeps atomic.
- The continuity ledger must hold across split cells: every source token
  appears exactly once and in source order within its cell. Order across
  cells of one row follows the cell order on each page, which is the reading
  order print already has.
- Tables whose rows all fit are unaffected, so existing parity fixtures do
  not change.
- Cost: one extra fragmentation pass per cell of a split row. Rows that fit
  pay nothing.
- A split row's cells carry an inline `width` and `box-sizing` in the
  committed document.
- Bundle: about 0.5 KiB gzip on the Core routes. The budgets were raised with
  a recorded decision in `docs/bundle-size.md`.

## Verification

Implemented in `tests/e2e/browser-core-table-row-fragmentation.spec.ts`, and
the earlier atomic long-cell test in
`browser-core-complex-table-fragmentation.spec.ts` now asserts the split.

- A conformance fixture: a statement table whose notes cell holds several
  pages of paragraphs next to short date and amount cells, with a continuity
  ledger per cell, run in Chromium, Firefox, and WebKit.
- A fixture where two cells of the same row both overflow, with different
  lengths, so one cell ends before the other.
- Negative fixtures: a `rowspan` cluster taller than a page still emits
  `UNSUPPORTED_LAYOUT`, and a row that fits on a fresh fragment still moves
  whole.
- The existing table, parity, and cooperative-pagination equivalence suites
  pass unchanged.
