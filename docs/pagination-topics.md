# Pagination topic coverage

This suite independently exercises 110 pagination and publishing topics plus
29 focused boundary variants and 44 combination scenarios, for 183 separately
reported static scenarios. Two additional same-controller update tests cover
five generations each, with forced convergence both enabled and disabled. Its
fixtures, text, CSS, and assertions are authored here; there are no imported
tests, reference images, fonts, packages, or remote runtime dependencies.
Public scenario descriptions were used only to identify topics under the
[inventory boundary](clean-room.md). This is a topic-coverage expansion, not
a copy of another engine's complete test suite, a line/branch coverage report,
or a claim of identical rendering.

## Run

Build the current Core, then run the structural reference browser:

```sh
node --import tsx scripts/build-core-browser.ts
pnpm exec playwright test tests/e2e/browser-core-pagination-topics.spec.ts --project=chromium
```

The suite is also discovered by `pnpm test:e2e`. Firefox and WebKit skip these
structural scenarios under the existing Chromium-reference policy; passing
here does not establish cross-engine equivalence.

All assertions run normally. There is no expected-failure registry or strict-mode
switch; a semantic regression fails the ordinary gate.

Use `--grep 'split-ordered-list:'` (or another topic ID) for one scenario.
`PORT=4193` can select a free local test-server port. Every test attaches a
`pagination-observation` JSON with page membership, geometry, diagnostics,
selected element attributes/styles, and resolver requests.

## What is checked

- Source tokens appear exactly once and in source order across committed page
  flows. Table headers and note furniture use separate assertions because they
  intentionally repeat or leave the body flow.
- Fixtures use small pixel-sized sheets and fixed line metrics. Checks cover
  expected page membership, parity blanks, geometry, table structure, source
  whitespace, counters, generated content, styles, and diagnostics.
- Every scenario checks browser errors and successful Core completion. All
  except explicit overflow/avoidance recovery scenarios also reject
  new vertical overflow. Missing pages/flows are harness errors, not empty
  successful observations.
- Controllers are destroyed in `finally`; each test has a fresh Playwright
  page. Asset tests use an in-memory resolver. Print-media checks explicitly
  emulate print instead of assuming print rules apply to screen layout.

The 37 layout topics cover breaks, nested propagation, fractional dimensions,
lists/preformatted text, row spans, table continuations, whitespace, bounded
overflow recovery, hyphenation, and fixed positioning. The 73 publishing
topics cover page geometry/selectors/names, counters, margin boxes, local
references, running strings, notes, sanitization, assets, styles, media,
extensions, and document completion. The 29 additional scenarios check compound
string syntax, target-text modes, tight note placement, note styling/counters,
oversized-note recovery, nonwrapping preformatted text, and inline image URL forms.

## Support-boundary adaptations

These scenarios test Imposia's declared contract rather than treating another
engine's page counts or screenshots as an oracle:

| Topic | Oracle and limit |
| --- | --- |
| `recto` / `verso` break values | Explicit unsupported-layout warning and retained normal-flow content; this does **not** count as recto/verso support. `left` / `right` exercise actual parity. |
| Bleed, printer marks, page padding, page counter reset/increment, roman page counters, page-group `:nth()` | Typed page-rule rejection and retained content/geometry where applicable. |
| Legacy single-colon target pseudo syntax | Unsupported-layout warning and absence of a fabricated generated reference. Double-colon references check actual target pages/text. |
| Fixed positioning | Page-area furniture repeats with unique IDs, captured styles, and blank-page decoration policy. Hidden descendants and elements with a local fixed containing block remain in their source context. |
| Custom counters and paragraph numbering | Nested CSS scope/reset/increment preservation on one sheet; explicit semantic paragraph numbers across sheets. No pixel oracle for resolved CSS counter glyphs across fragmentation. |
| Footnotes | Opt-in ordered calls/markers, authored integer resets, and scoped call/marker typography. Bounded sibling call-block/note groups honor line/block keeping. Long or otherwise unsatisfied policies use `FOOTNOTE_DEFERRED` and preserve the original note; this is not full line-policy support. Pseudo `content`/counter declarations and page counter resets are explicitly rejected. Deferred notes retain their source-order number allocation, so visible calls can have gaps. |
| Running strings | Supported first/start/last and separate attribute bindings. Combined bindings and `first-except` have separate typed-rejection tests; rejection is not support. |
| Math and assets | Static semantic/pre-rendered content and resolver policy. No downloaded math runtime or authored script execution. |
| Print | Print media selection, not PDF-byte generation, printed PDF screenshots or a native print-dialog test. |

## Repaired failures

The first strict run reproduced 13 assertion failures in ten groups. These
failures now pass their original assertions as ordinary tests; no assertion was
replaced with the previous incorrect result.

| Group | Fix |
| --- | --- |
| PT-01 | Adjacent avoidance measures keep groups before placement, respects forced/name boundaries, and keeps headings with the initial lines of an overlong paragraph. Impossible groups diagnose relaxation. |
| PT-02 | Last-child forced breaks propagate out through ancestor boundaries. |
| PT-03 | Actually fragmented native ordered lists preserve starts, reversal and explicit item values. Unfragmented lists keep browser numbering; fragmented custom-counter lists retain authored rules and diagnose possible numbering restarts. |
| PT-04 | Zero margins are accepted, while zero page dimensions remain invalid. |
| PT-05 / PT-06 | Captured effective page names survive ancestor fragmentation and trigger nested transitions. |
| PT-07 | Fixed furniture repeats in a page-area layer with captured styles and unique IDs; hidden/local-containing-block cases are excluded. |
| PT-08 | Bounded note-policy groups keep calls and notes together; unsatisfied policies diagnose normal-flow recovery. |
| PT-09 | Call and marker styles resolve against the originating note with non-inheriting property projections. Unsupported pseudo content warns. |
| PT-10 | Authored integer footnote resets affect both call and marker numbers. |

The fixed page-area coordinate system follows [CSS Positioned Layout](https://www.w3.org/TR/css-position-3/#fixed-pos).
The local PT-01–PT-10 records remain under `.scratch/pagination-topic-coverage/issues/`.

## Verification receipt

On 2026-09-27, Core was rebuilt from the working checkout. The original 123
topics passed with expected-failure suppression disabled; additional review
fixtures exercise native list semantics, reversed values, forced/oversized/long
avoidance, scoped note styles and recovery, and fixed positioning boundaries.
Final verification:

- Rebuilt Core plus all `browser-core*.spec.ts` in Chromium: **318 passed**, including 183 static topic scenarios and two multi-generation update cases. Zero skipped, expected failures, unexpected failures or flaky results.
- `pnpm test`: **96 passed** across 18 files.
- Package `tsc -b` and strict standalone typechecking of the topic runner: passed.
- Biome and `pnpm bundle:size`: passed. Four route budgets explicitly increased by 1–1.5 KiB for the measured correctness changes; see [bundle size](bundle-size.md#pagination-combination-correctness-2026-09-27).
- Claude performed read-only independent reviews; fixtures protect native-float cancellation, whole-property string assignment, and positioned-ink pagination. Firefox/WebKit lifecycle smoke checks: 10 passed, 28 structural cases skipped under the established reference policy.

A negative control removed a forced page break from one fixture; the boundary
assertion failed as intended and the fixture was restored. This validates the
oracle independently of the implementation. These checks establish the stated
bounded behaviors, not complete CSS parity or a full cross-browser release gate.

## Topic inventory

Each entry below is one separately reported Playwright scenario. The IDs make
selection and failure tracking independent of file layout.

| Topic ID | Scenario | Status |
| --- | --- | --- |
| `break-before-page` | break-before:page chooses the next sheet and inserts only the required blank | Pass |
| `break-before-left` | break-before:left chooses the next sheet and inserts only the required blank | Pass |
| `break-before-right` | break-before:right chooses the next sheet and inserts only the required blank | Pass |
| `break-before-avoid` | break-before:avoid keeps a short heading with its following paragraph | Pass — repaired |
| `break-after-page` | break-after:page chooses the next sheet and inserts only the required blank | Pass |
| `break-after-left` | break-after:left chooses the next sheet and inserts only the required blank | Pass |
| `break-after-right` | break-after:right chooses the next sheet and inserts only the required blank | Pass |
| `break-after-recto` | break-after:recto warns and falls back to normal flow | Pass |
| `break-after-verso` | break-after:verso warns and falls back to normal flow | Pass |
| `break-after-avoid` | break-after:avoid keeps a short heading with its following paragraph | Pass — repaired |
| `break-inside-block` | a fitting avoid block moves intact from a partly occupied page | Pass |
| `break-inside-cell` | a fitting table cell with avoidance keeps its row on one fresh sheet | Pass |
| `break-legacy-and-modern` | modern forced breaks override conflicting legacy page-break declarations | Pass |
| `break-nested-before` | a forced break on a nested first child crosses its wrapper | Pass |
| `break-nested-after` | a forced break on a nested last child crosses its wrapper | Pass — repaired |
| `break-container-boundary` | a first-child forced break separates header and main containers | Pass |
| `break-no-empty-intermediate-sheet` | adjacent after/before breaks share one boundary without an extra empty sheet | Pass |
| `break-fractional-height` | fractional block heights fill the last available row without losing the following row | Pass |
| `break-root-siblings` | top-level text and elements survive forced boundaries in source order | Pass |
| `break-rowspan-avoid` | a bounded two-row span moves as a cluster when the current sheet is nearly full | Pass |
| `split-ordered-list` | an ordered list continues its authored numbering after a page split | Pass — repaired |
| `split-numbered-paragraphs` | authored paragraph numbers remain once and in order through nested block splitting | Pass |
| `split-preformatted-lines` | preformatted lines preserve tabs, indentation and newlines across sheets | Pass |
| `split-oversized-rowspan` | an oversized multi-row span stays atomic and reports its lost fit | Pass |
| `split-oversized-avoid-table` | an overlong avoid table relaxes avoidance and preserves every row | Pass |
| `split-connected-rowspans` | overlapping bounded row spans keep all connected rows on one sheet | Pass |
| `split-last-line-alignment` | paragraph continuations retain authored last-line alignment and complete text | Pass |
| `table-wrapped-columns` | narrow table columns wrap long cell text without horizontal clipping after a split | Pass |
| `table-stable-column-widths` | the column-width preset preserves asymmetric table geometry on continued fragments | Pass |
| `table-nested-cells` | a fitting nested table remains inside its outer cell after the outer row moves | Pass |
| `table-empty-and-spanning-cells` | continued rows retain empty cells and authored column spans | Pass |
| `table-multiple-row-groups` | multiple table bodies survive reconstruction with one repeated header per fragment | Pass |
| `whitespace-hard-line-breaks` | explicit line breaks preserve every line at the bottom and top of adjacent sheets | Pass |
| `whitespace-between-forced-blocks` | formatting whitespace and comments do not allocate extra sheets | Pass |
| `progress-oversized-atomic-box` | an oversized atomic box terminates with overflow diagnostics and keeps its successor | Pass |
| `hyphenation-language-context` | language-tagged automatic hyphenation survives paragraph splitting without changing text | Pass |
| `fixed-page-furniture` | fixed page furniture appears on every committed sheet | Pass — repaired |
| `sheet-bleed` | bleed outside the supported page contract warns without changing sheet geometry | Pass |
| `sheet-custom-bleed` | bleed outside the supported page contract warns without changing sheet geometry | Pass |
| `sheet-printer-marks` | marks outside the supported page contract warns without changing sheet geometry | Pass |
| `page-size-landscape` | authored sheet dimensions match the selected page size | Pass |
| `page-size-absolute` | authored sheet dimensions match the selected page size | Pass |
| `page-size-keyword` | authored sheet dimensions match the selected page size | Pass |
| `page-zero-margin` | zero page margins put authored content at the sheet origin | Pass — repaired |
| `page-padding-recovery` | unsupported page padding produces a typed warning | Pass |
| `page-rule-cascade` | later page rules override margins while retaining earlier size | Pass |
| `selector-blank` | blank page selectors decorate only parity-inserted sheets | Pass |
| `selector-first` | first-page decoration does not leak to later pages | Pass |
| `selector-nth` | An+B page selectors match alternating global page numbers | Pass |
| `selector-spread` | left and right selectors follow global sheet parity | Pass |
| `selector-group-first-recovery` | unsupported nth-of-page-group selectors are diagnosed | Pass |
| `selector-named-spread` | named left/right page rules combine with global parity | Pass — repaired |
| `named-transition` | named page transitions preserve source order and select only the required sheets | Pass |
| `named-unnamed-siblings` | named page transitions preserve source order and select only the required sheets | Pass |
| `named-shared-master` | named page transitions preserve source order and select only the required sheets | Pass |
| `named-long-section` | named page transitions preserve source order and select only the required sheets | Pass — repaired |
| `named-nested-first-child` | named page transitions preserve source order and select only the required sheets | Pass — repaired |
| `named-contiguous-paragraphs` | named page transitions preserve source order and select only the required sheets | Pass |
| `named-fold-after` | named page transitions preserve source order and select only the required sheets | Pass |
| `named-fold-before` | named page transitions preserve source order and select only the required sheets | Pass |
| `named-hidden-transition` | named page transitions preserve source order and select only the required sheets | Pass |
| `named-auto-inheritance` | named page transitions preserve source order and select only the required sheets | Pass |
| `named-returning-group` | named page transitions preserve source order and select only the required sheets | Pass |
| `counter-current-page` | margin page counters describe the committed global page sequence | Pass |
| `counter-total-pages` | margin page counters describe the committed global page sequence | Pass |
| `counter-page-reset-recovery` | unsupported authored page-counter reset warns and retains global numbering | Pass |
| `counter-scoped-reset-recovery` | unsupported authored page-counter reset warns and retains global numbering | Pass |
| `counter-nested-scope` | nested custom-counter scopes and increments survive ordinary layout | Pass |
| `margin-style` | margin-box styling is applied to the generated box | Pass |
| `margin-horizontal-alignment` | margin-box styling is applied to the generated box | Pass |
| `margin-vertical-alignment` | margin-box styling is applied to the generated box | Pass |
| `margin-box-dimensions` | opposed margin labels fit within their sheet and do not overlap | Pass |
| `target-page-increment-negative` | unsupported page-counter increments warn while references use global pages | Pass |
| `target-page-increment-positive` | unsupported page-counter increments warn while references use global pages | Pass |
| `target-page-increment-zero` | unsupported page-counter increments warn while references use global pages | Pass |
| `target-legacy-pseudo` | unsupported legacy target pseudo syntax warns instead of creating a reference | Pass |
| `target-page-reference` | local references resolve to the target's committed page | Pass |
| `target-title-reference` | target-text resolves authored heading content without dropping its inline text | Pass |
| `running-strings` | first, start, last and attribute strings follow page-local source changes | Pass |
| `notes-basic` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-display-block` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-policy-auto` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-counter-sequence` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-counter-custom-reset` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-counter-page-reset` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-final-page` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-padding` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-anchor-placement` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-same-line` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `notes-body-styles` | opt-in notes preserve bodies and ordered call/marker pairs within page bounds | Pass |
| `default-document` | a minimal document produces one complete visible page | Pass |
| `filter-authored-script` | authored scripts are removed without execution or loss of surrounding content | Pass |
| `filter-hidden-break` | display:none content cannot introduce a forced page break | Pass |
| `selector-adjacent-sibling` | authored structural selectors retain their intended sibling matches | Pass |
| `selector-nth-of-type` | authored structural selectors retain their intended sibling matches | Pass |
| `generated-content-none` | content:none wins the pseudo-element cascade | Pass |
| `extension-page-decoration` | a supported extension decorates every completed page | Pass |
| `asset-data-url-policy` | data-URL pseudo images cannot bypass the asset resolver | Pass |
| `stylesheet-import-order` | resolved stylesheet imports participate in the authored cascade in order | Pass |
| `running-header-not-duplicated` | repeated header templates appear once per sheet and never enter the body | Pass |
| `counter-roman-recovery` | unsupported page counter formats produce a warning instead of claiming roman output | Pass |
| `complete-final-content` | pagination reaches a uniquely marked final paragraph after many fragments | Pass |
| `empty-document` | an empty source produces a usable empty page without runaway allocation | Pass |
| `wrapper-height-continuity` | a minimum-height wrapper does not prevent its overflowing children from continuing | Pass |
| `math-semantic-markup` | static mathematical content survives sanitization and pagination without script execution | Pass |
| `math-pre-rendered-markup` | static mathematical content survives sanitization and pagination without script execution | Pass |
| `media-nonvisual-ignored` | media-qualified authored styles follow the browser publishing contract | Pass |
| `media-print-styling` | media-qualified authored styles follow the browser publishing contract | Pass |
| `media-screen-styling` | media-qualified authored styles follow the browser publishing contract | Pass |
| `stylesheet-source-order` | scattered style elements retain source-order cascade after content splitting | Pass |
| `strings-combined-binding-recovery` | unsupported combined string bindings warn rather than publish invented values | Pass |
| `strings-first-except-recovery` | unsupported first-except string selection is diagnosed | Pass |
| `target-text-first-letter-recovery` | unsupported target-text first-letter mode warns without creating misleading text | Pass |
| `target-text-before-recovery` | unsupported target-text before mode warns without creating misleading text | Pass |
| `target-text-after-recovery` | unsupported target-text after mode warns without creating misleading text | Pass |
| `notes-policy-line-boundary` | line note policy keeps the call with its note when the first sheet has no room | Pass — repaired |
| `notes-policy-block-boundary` | block note policy keeps the call with its note when the first sheet has no room | Pass — repaired |
| `notes-oversized-recovery` | an oversized note falls back to source flow without losing or repeating its text | Pass |
| `notes-custom-callout-style` | authored footnote-call styling reaches generated callouts | Pass — repaired |
| `notes-custom-counter-start` | an authored footnote counter reset changes both call and note numbers | Pass — repaired |
| `split-nonwrapping-pre` | a pre block with short lines preserves its exact nonwrapping text through pagination | Pass |
| `asset-data-url-unescaped` | alternate inline image URL forms obey the same resolver boundary | Pass |
| `asset-data-url-base64` | alternate inline image URL forms obey the same resolver boundary | Pass |
| `split-reversed-list-values` | Reversed list values and continuation starts | Pass |
| `break-avoid-forced-priority` | Forced breaks override adjacent avoidance | Pass |
| `notes-scoped-pseudo-styles` | Call and marker styles match originating note selectors | Pass |
| `notes-inline-policy-boundary` | Inline block policy keeps bounded note groups | Pass |
| `fixed-nested-furniture` | Nested furniture styles, offsets and unique IDs | Pass |
| `break-oversized-adjacent-avoid` | Impossible avoidance diagnoses relaxation | Pass |
| `break-avoid-long-paragraph` | Headings stay with initial long-paragraph lines | Pass |
| `list-native-unfragmented-counters` | Unfragmented lists retain native semantics | Pass |
| `fixed-containing-block-and-hidden` | Hidden and locally contained fixed elements remain local | Pass |
| `notes-pseudo-style-no-inheritance` | Non-note pseudo styles do not leak to descendants | Pass |
| `notes-pseudo-content-recovery` | Unsupported pseudo content is diagnosed | Pass |
| `notes-long-line-policy-recovery` | Unsatisfied line policy preserves note text with warning | Pass |
| `fixed-parity-blank-decoration` | Blank-page decoration setting governs fixed furniture | Pass |
| `break-avoid-normal-line-height` | Measured normal line height keeps the heading with its first paragraph fragment | Pass |
| `break-avoid-long-wrapper-no-warning` | A long wrapper does not create false avoidance diagnostics | Pass |
| `split-custom-list-counter-recovery` | Custom list counters retain authored rules and diagnose fragmentation restarts | Pass |

## Combination coverage

The combination suite uses only high-level public Vivliostyle inventory topics;
all fixture text, CSS and expected results are authored for Imposia. It does not
measure upstream line coverage or imply rendering parity.

| Area | Checks |
| --- | --- |
| Tables and notes | Fragmented rowspan/colspan tables, repeated headers, single call/body/marker association; full-height row overlap preserves notes in source flow with `FOOTNOTE_DEFERRED`. |
| Fragment edges | Horizontal `clone` and `slice` block padding/border edges, child containment, forced-break top margin. Full background-image slice continuity is not asserted. |
| Positioned content | Absolute decorations before/after a forced boundary occur once in the correct containing fragment; relative offsets retain flow membership. Visual overflow from relative/absolute positioning does not introduce a new page; those two cases intentionally allow painted overflow. |
| Updates | One controller shrinks below ten pages, grows above ten, removes a reference target, then restores the original input. Tokens, target text/page numbers, named strings, margin counters, generation warnings, DOM pages and metadata agree after each generation. |
| Ruby | Tight fit and overflow boundaries plus repeated page breaks preserve each base and annotation together and in order. |
| Floats and columns | Clear follows ordinary left/right floats; bounded multicol notes are placed without body overlap; full columns defer notes; unsupported multicol floats retain content with a warning; multiple page floats and notes occupy separate areas. |
| CSS | Normal/important layer precedence, nesting, variables and rem/lh/rlh geometry survive fragmentation. Top-level publishing declarations honor specificity, importance, selector lists and inline precedence. A winning publishing float neutralizes losing native floats; one winning string-set declaration replaces the whole property and `none` cancels assignment. Conditional publishing declarations produce an explicit unsupported diagnostic. |

Run the added cases with:

```sh
pnpm exec playwright test tests/e2e/browser-core-pagination-topics.spec.ts --project=chromium --grep combo-
pnpm exec playwright test tests/e2e/browser-core-publishing-update-integrity.spec.ts --project=chromium
```

The optional overlap oracle checks actual body text rectangles against the note
and page-float regions, rather than relying on generated placement attributes. A separate painted table-border case requires deferral even when text rectangles do not overlap.
Bounded placement cases require no unsupported-layout warning; recovery cases
assert their named diagnostic and retained content.

The positioned-overflow fix also has a persistent `mount-1000-positioned`
benchmark scenario. In an alternating same-browser comparison with only the
old overflow predicate restored in the comparison bundle, both rendered 1,045
pages. Seven measured runs after two warmups gave medians of 1,961.2 ms before
and 1,952.5 ms after (Apple M4, Chromium 149). This addresses the relative-superscript
hot-path concern for that workload; it is not a general speedup claim.
