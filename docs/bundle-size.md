# Browser bundle size

This report is for maintainers reviewing the JavaScript cost of Imposia's
consumer entry paths. It measures the current source on Node.js 22.12 or newer
with the repository-pinned `esbuild` version. It does not measure runtime
performance, CSS, source maps, the PDF.js worker, or React itself.

## Run the report

From the repository root, install the lockfile dependencies and run:

```bash
pnpm bundle:size
```

The command builds six minified browser ESM scenarios in memory, compresses each
output with gzip level 9, prints the report, and exits nonzero when a route
exceeds its gzip budget. A successful run ends with:

```text
All 6 consumer routes are within their gzip budgets.
```

## Current baseline

Recorded on 2026-07-23 from `origin/main@be4c0bcd` plus the shared Viewer
interface refactor in this change:

| Consumer route | Minified | Gzip | Gzip budget | Headroom |
| --- | ---: | ---: | ---: | ---: |
| Core · PageDocument | 355.0 KiB | 103.6 KiB | 110.0 KiB | 6.4 KiB |
| Core · Publication | 370.2 KiB | 108.0 KiB | 115.0 KiB | 7.0 KiB |
| Viewer · PageDocument | 89.8 KiB | 28.0 KiB | 32.0 KiB | 4.0 KiB |
| Viewer · PDF | 399.6 KiB | 117.3 KiB | 125.0 KiB | 7.7 KiB |
| Client · PageDocument | 386.5 KiB | 112.5 KiB | 120.0 KiB | 7.5 KiB |
| React · PageViewer | 392.2 KiB | 114.2 KiB | 122.0 KiB | 7.8 KiB |

These are source-level consumer scenarios rather than package tarball sizes:

- `Core · PageDocument` exports `mountPageDocument`.
- `Core · Publication` exports `mountPublication`.
- `Viewer · PageDocument` exports `mountPageViewer` without Core pagination.
- `Viewer · PDF` exports `mountViewer` and includes the PDF.js browser module.
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
variation. Keep React peers external, keep PDF.js included only in the PDF
scenario, and do not remove a real dependency from a scenario to make its number
smaller.

## EPUB decision

EPUB remains part of `@imposia/core`. A diagnostic build replaced the two EPUB
export functions with empty stubs while retaining the surrounding Core API. The
measured implementation contribution was 17,547 minified bytes and 5,528 gzip
bytes. The source implementation is large, but the compressed consumer cost is
about five percent of the `Core · PageDocument` route.

Moving EPUB into an optional package would require a new trusted interface to
Core's retained semantic snapshot and resolver-owned asset bytes. It would also
change `PageDocument.exportEpub()`, Publication export finalization, and the
React imperative handles. That boundary cost is not justified by the current
5.4 KiB gzip saving. [ADR 0010](architecture/0010-core-epub-bundle-boundary.md)
records the decision and the conditions for revisiting it.

## Verification notes

- **Verified:** `node --import tsx scripts/bundle-size.ts` produced the baseline
  table and exited `0` on 2026-07-23.
- **Verified:** an `esbuild` metafile attributed 15,271 minified output bytes to
  `epub-export.ts` and 2,360 bytes to `epub-zip.ts`; the stub diagnostic measured
  the combined compressed difference.
- **Inferred:** a separate EPUB package would increase lifecycle and security
  interface complexity because the required semantic snapshot and retained
  assets are currently private Core state.
- **Not measured:** network transfer with HTTP content encoding, application
  code splitting, browser parse time, CSS, and the PDF.js worker.
