# Browser bundle size

This report is for maintainers reviewing the JavaScript cost of Imposia's
consumer entry paths. It measures the current source on Node.js 22.12 or newer
with the repository-pinned `esbuild` version for bundling and the
repository-pinned `oxc-minify` version for the minification post-pass — the
same two-stage pipeline that produces the published Core browser artifact. It
does not measure runtime performance, CSS, source maps, or React itself.

## Run the report

From the repository root, install the lockfile dependencies and run:

```bash
pnpm bundle:size
```

The command builds five minified browser ESM scenarios in memory, compresses each
output with gzip level 9, prints the budget report, and exits nonzero when a
route exceeds its gzip budget. It then prints a reproducible EPUB diagnostic
that compares a complete Core export against the same export with the EPUB
module replaced by API-compatible throwing stubs. A successful budget section
ends with:

```text
All 6 consumer routes are within their gzip budgets.
```

## Current baseline

Recorded on 2026-09-23 on the 0.6.0 development line (Apple M1 Max, Node.js 22),
after the PDF.js viewer removal and the postcss parser-subpath import:

| Consumer route | Minified | Gzip | Gzip budget | Headroom |
| --- | ---: | ---: | ---: | ---: |
| Core · PageDocument | 188.0 KiB | 56.7 KiB | 60.0 KiB | 3.3 KiB |
| Core · Publication | 203.3 KiB | 60.9 KiB | 64.0 KiB | 3.1 KiB |
| Viewer · PageDocument | 39.0 KiB | 11.6 KiB | 13.0 KiB | 1.4 KiB |
| Client · PageDocument | 220.0 KiB | 65.3 KiB | 69.0 KiB | 3.7 KiB |
| React · PageViewer | 226.7 KiB | 67.2 KiB | 71.0 KiB | 3.8 KiB |

Two changes produced this baseline:

- **postcss parser subpaths.** Core called only `postcss.parse` and
  `postcss.atRule` but imported the package entry, which carries the
  processor, LazyResult, and source map generator. Importing
  `postcss/lib/parse` and `postcss/lib/at-rule` took Core · PageDocument from
  62.0 KiB to 56.5 KiB gzip. Viewer · PageDocument fell from 28.9 KiB to
  11.6 KiB, because the Core helpers it imports had been pulling in the whole
  package entry. The budgets were lowered to restore roughly 5% headroom.
- **PDF.js viewer removal.** Removing `mountViewer` deleted the `Viewer · PDF`
  route (433.8 KiB minified, 120.1 KiB gzip, dominated by PDF.js). The other
  routes measured the same bytes before and after, because tree shaking
  already kept PDF.js out of them. Outside these routes, a Viewer, Client, or
  React install no longer adds `pdfjs-dist` (37 MB unpacked) or its optional
  native `@napi-rs/canvas` binary (25 MB on darwin-arm64), and
  `@imposia/viewer/styles.css`, which this report does not measure, dropped
  from 3.9 KiB to 3.0 KiB gzip.

The ASA-424/425/426 escape hatches share their code with runtime fallbacks, so
removing them reclaims almost nothing; the 0.5.0 expectation below that their
removal would tighten the budgets does not hold.

### Document-layout additions and budget decision (2026-09-24)

The sixteen margin boxes, margin-box styles, content-sized margin-box widths,
`:nth()`, the added page-size keywords, per-entry Publication page numbering,
the pagination performance changes, raisable limits (ADR 0015),
column-spanning grid items, and table row splitting (ADR 0014) were measured
against the commit before them on the same machine:

| Consumer route | Before (gzip) | After (gzip) | Old budget | New budget | Headroom |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core · PageDocument | 56.9 KiB | 59.4 KiB | 60.0 KiB | 62.0 KiB | 2.6 KiB |
| Core · Publication | 61.1 KiB | 63.7 KiB | 64.0 KiB | 67.0 KiB | 3.3 KiB |
| Viewer · PageDocument | 11.6 KiB | 11.8 KiB | 13.0 KiB | 13.0 KiB | 1.2 KiB |
| Client · PageDocument | 65.5 KiB | 68.0 KiB | 69.0 KiB | 71.0 KiB | 3.0 KiB |
| React · PageViewer | 67.4 KiB | 69.8 KiB | 71.0 KiB | 73.0 KiB | 3.2 KiB |

Decision: raise the four Core-bearing budgets to restore roughly 5%
headroom. The 2.5 KiB of growth buys document features that removed silent
content loss (row splitting, content-sized footers) or unsupported layouts
(spanning grid items), and a pagination path that stays linear to 10,000
pages. The Viewer route did not grow past its budget, so it keeps 13 KiB.

### 0.5.0 baseline (2026-08-20)

Recorded at the 0.5.0 release commit, after the browser-native parsing change
(ADR 0013, `d8e2638`), the oxc-minify post-pass (`5d73b43`), and the pagination
performance batch (ASA-424, ASA-425, ASA-426):

| Consumer route | Minified | Gzip | Gzip budget | Headroom |
| --- | ---: | ---: | ---: | ---: |
| Core · PageDocument | 201.0 KiB | 60.0 KiB | 63.0 KiB | 3.0 KiB |
| Core · Publication | 216.1 KiB | 64.1 KiB | 67.0 KiB | 2.9 KiB |
| Viewer · PageDocument | 95.3 KiB | 28.3 KiB | 30.0 KiB | 1.7 KiB |
| Viewer · PDF | 433.8 KiB | 120.1 KiB | 125.0 KiB | 4.9 KiB |
| Client · PageDocument | 232.6 KiB | 68.5 KiB | 72.0 KiB | 3.5 KiB |
| React · PageViewer | 239.0 KiB | 70.3 KiB | 74.0 KiB | 3.7 KiB |

Compared with the 2026-07-23 baseline, the Core · PageDocument route dropped
from 103.6 KiB to 56.8 KiB gzip: removing parse5 and its `entities` dependency
accounts for roughly 47 KiB, and the oxc-minify post-pass for the remainder.

The performance batch then moved Core · PageDocument back up from 56.8 KiB to
60.0 KiB, and the four Core-bearing budgets were raised to restore roughly 5%
headroom. The responsible source is the three escape hatches: ASA-424, ASA-425,
and ASA-426 each keep the implementation they replace, selectable at runtime
through `experimental.forceSequentialPlacement`, `experimental.forceLegacyLineEnds`,
and `experimental.forceFullConstraintCapture`. Code splitting cannot preserve
the previous limit, because the two paths are selected per element inside one
hot pagination loop — a dynamic import boundary would have to be crossed per
node. Tree shaking cannot drop either path either, since the choice is a
runtime option rather than a build-time constant. This increase is therefore
expected to be temporary: the hatches are scheduled for removal one release
after they land, and these budgets should be tightened again at that point.
Even at 60.0 KiB the route remains 43.6 KiB below its pre-ASA-404 size.

These are source-level consumer scenarios rather than package tarball sizes:

- `Core · PageDocument` exports `mountPageDocument`.
- `Core · Publication` exports `mountPublication`.
- `Viewer · PageDocument` exports `mountPageViewer` without Core pagination.
- `Client · PageDocument` exports Core pagination and the page Viewer together.
- `React · PageViewer` exports `ImposiaPageViewer`; React and React DOM remain
  external peer dependencies.

The script bundles workspace dependencies through source aliases so that the
report detects changes before package distribution files exist. Minified bytes
are the sum of all emitted JavaScript files. Gzip bytes are the sum of each
output compressed independently.

## Budget policy

Treat a budget failure as a review prompt, not a number to raise automatically.
The pull request that increases a budget must identify the responsible source,
state the user-visible benefit, and record why code splitting, tree shaking, or
a smaller dependency cannot preserve the previous limit.

Decrease a budget when a durable reduction leaves enough headroom for toolchain
variation. Keep React peers external, and do not remove a real dependency from a
scenario to make its number smaller.

## EPUB decision

EPUB remains part of `@imposia/core`. The report's diagnostic build replaces the
two EPUB export functions with throwing stubs while retaining their names and
async contract. The current report measures a 17.0 KiB minified, 5.0 KiB gzip,
and 4.2 KiB Brotli difference. The source implementation is large, but the
compressed consumer cost is about nine percent of the re-based
`Core · PageDocument` route.

Moving EPUB into an optional package would require a new trusted interface to
Core's retained semantic snapshot and resolver-owned asset bytes. It would also
change `PageDocument.exportEpub()`, Publication export finalization, and the
React imperative handles. That boundary cost is not justified by the current
5.0 KiB gzip saving. [ADR 0010](architecture/0010-core-epub-bundle-boundary.md)
records the decision and the conditions for revisiting it.

ADR 0010 revisit-trigger status after the 2026-08-20 re-base: none of the
three triggers is met. (1) The EPUB implementation measures 5.0 KiB gzip,
under the 10 KiB trigger. (2) The `Core · PageDocument` route is within its
re-based budget — note the re-base makes this trigger strictly tighter, and
EPUB is now the largest removable contributor of the smaller route, so a
future overage should evaluate this trigger against the 60 KiB budget. (3) No
second exporter needs the trusted semantic projection interface.

## Verification notes

- **Verified:** `node --import tsx scripts/bundle-size.ts` produced the baseline
  table and exited `0` on 2026-08-20.
- **Verified:** the same command's EPUB diagnostic measured the minified, gzip,
  and Brotli difference between the complete Core export and its EPUB-stubbed
  equivalent.
- **Inferred:** a separate EPUB package would increase lifecycle and security
  interface complexity because the required semantic snapshot and retained
  assets are currently private Core state.
- **Not measured:** network transfer with HTTP content encoding, application
  code splitting, browser parse time, and CSS.
