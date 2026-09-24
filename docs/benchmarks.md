# Browser benchmarks

This page is for maintainers who reproduce or review Imposia's performance
figures. It covers two harnesses. Both run in Playwright Chromium; Firefox and
WebKit are not measured. The results are observations on one machine, not
product contracts.

| Command | Measures | Output |
| --- | --- | --- |
| `pnpm benchmark` | Imposia alone: mount, update, first frame, Publication, print call, partial frames | `benchmarks/latest.json`; `--baseline` also writes `benchmarks/baseline.json` |
| `pnpm benchmark:compare` | Imposia, Paged.js, and Vivliostyle on the same input (ASA-433) | `benchmarks/comparison.json` and a Markdown table on stdout |

Run `pnpm build` first. Both harnesses load the built
`packages/core/dist/index.js` through `scripts/serve-viewer.mjs`, take warmup
runs and then seven measured runs, and report the median.

## Imposia harness

`scripts/benchmark.ts` measures Imposia alone. Besides the everyday scenarios
(a 99-page article, a 50-page report, a 100-entry Publication, print, and
partial frames during rapid updates), it covers long documents:

| Scenario | Input | What is measured |
| --- | --- | --- |
| `mount-1000` | 3,655 sections (997 pages) | Mount until `controller.ready` |
| `mount-1000-blocking` | The same document | The longest gap between two `MessageChannel` pings during the mount, a lower bound on the longest main-thread task |
| `mount-1000-heap` | The same document | `performance.memory.usedJSHeapSize` after GC while mounted, minus the reading before the mount (Chromium runs with `--enable-precise-memory-info --js-flags=--expose-gc`) |
| `mount-1800` | 6,579 sections (1,795 pages) | Mount until `controller.ready` |
| `statement-table` | One table, 5,000 rows, a repeated `thead` (216 pages) | Mount until `controller.ready` |

`--only <id,id>` runs a subset, and `--compare <bundle>` runs another build of
`packages/core/dist/index.js` alternately with the current one.

1,800 pages is close to the ceiling for this input. The article is about
2.8 KB of HTML per page, and `limits.maxInputBytes` cannot be raised above
5 MiB, so a document of this density stops at about 1,850 pages. A caller can
lower the limits but not raise them.

### Recorded results

Captured 2026-09-24 on an Apple M4 with Chromium 149.0.7827.55, median of 7
runs, `--compare` against `main` at `38675c5`:

| Scenario | Pages | `38675c5` | `f33ded4` |
| --- | ---: | ---: | ---: |
| Mount a 99-page article | 99 | 122.3 ms | 80.3 ms |
| Update one word in that article | 99 | 119.1 ms | 76.6 ms |
| Mount a Publication of 100 entries | 100 | 91.6 ms | 81 ms |
| Update one word in a 50-page report | 50 | 56.3 ms | 40.3 ms |
| Mount a 200-page document | 200 | 289.7 ms | 165.8 ms |
| Mount a 1,000-page document | 997 | 3827.1 ms | 941.4 ms |
| Longest main-thread block in that mount | 997 | 331 ms | 123.9 ms |
| JS heap retained by that document | 997 | 8.3 MB | 8.5 MB |
| Mount a 1,800-page document | 1795 | 13995.5 ms | 1978.3 ms |
| Mount a 5,000-row statement table | 216 | 1042.6 ms | 981 ms |

Before `f33ded4`, time per page grew with document length because every
placement relaid out the whole unplaced source. The longest main-thread block
is still far above the 8 ms yield budget, so some step between yields does not
scale with the budget; that is the next thing to profile.

## Comparison harness

`scripts/benchmark-compare.ts` pins these versions and loads them from
jsDelivr:

| Library | Version | File loaded |
| --- | --- | --- |
| Paged.js | `0.4.3` | `https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/dist/paged.min.js` (jsDelivr's minified copy of the published `dist/paged.js` browser build) |
| Vivliostyle (`@vivliostyle/core`) | `2.45.2` | `https://cdn.jsdelivr.net/npm/@vivliostyle/core@2.45.2/+esm` (jsDelivr's ES module wrapper of the published `lib/vivliostyle.js`) |

The results file records each file's SHA-256, so a later run can confirm it
measured the same bytes. The script fetches each file once and serves it to
every browser context from memory; network time is not measured. If Node's own
`fetch` cannot reach the CDN, it falls back to `curl`.

Neither library is a package dependency. Vivliostyle is AGPL-3.0, which the
dependency license allowlist rejects, and the benchmark does not need either
package installed.

### Clean-room method

The harness follows the [clean-room policy](clean-room.md). Paged.js and
Vivliostyle are black boxes:

- The script calls only documented public entry points and observes only
  public outcomes: promise resolution, documented events, the page count a
  library reports or the page elements it leaves in the DOM, and wall time.
- Their source, bundles, tests, and fixtures are not opened or read. Bundles are
  measured by byte length after gzip and by SHA-256 only.
- The input is written here: the same section generator as
  `scripts/benchmark.ts` (a heading, a paragraph, a two-item list, and a
  paragraph per section), with this CSS:

  ```css
  @page { size: A4; margin: 18mm; }
  body { margin: 0; font-family: serif; font-size: 16px; line-height: 1.5; }
  ```

### Scenarios

| Scenario | Input | What is timed |
| --- | --- | --- |
| `paginate-200` | 600 sections (200 Imposia pages) | From the library's render call until its completion signal, with all pages laid out |
| `edit-50` | 149 sections (50 Imposia pages) | After a first render, one word changes; only the re-render is timed |
| `bundle` | none | Gzip (level 9) size of each library's browser JavaScript |

Each library is driven as follows:

| Library | Render call | Completion signal | Page count | Re-render in `edit-50` |
| --- | --- | --- | --- | --- |
| Imposia | `mountPageDocument(host, { html })`, CSS in a `<style>` | `controller.ready` resolves | `PageDocument.pageCount` | `controller.update({ html })` |
| Paged.js | `new PagedModule.Previewer().preview(content, [cssUrl], host)` | The returned promise resolves | `flow.total` | A new `preview()` into the cleared host |
| Vivliostyle | `new CoreViewer({ viewportElement }).loadDocument({ url }, {}, { renderAllPages: true })` | `readystatechange` with `ReadyState.COMPLETE` | `[data-vivliostyle-page-container]` elements | A second `loadDocument()` on the same viewer |

Paged.js and Vivliostyle document no incremental update API, so rendering again
from scratch is their documented way to show changed content.

Every sample runs in a new browser context, and the library order rotates on
each run so machine drift spreads over all three. A library that throws, times
out after 120 seconds, or produces a page count more than twice or less than
half of Imposia's is recorded with an `error` instead of a number.

### Fairness caveats

- Imposia paginates inside its own iframe. Paged.js and Vivliostyle render into
  a `<div>` in the host document.
- Paged.js receives the CSS as a stylesheet URL. Vivliostyle loads a same-origin
  HTML document with the CSS in a `<style>`; its time includes fetching that
  document from the local server.
- The Imposia bundle figure is the tree-shaken `Core · PageDocument` route from
  `pnpm bundle:size` (see [bundle-size.md](bundle-size.md)). The benchmark
  itself loads the full `packages/core/dist/index.js`, whose gzip size is
  recorded under `libraries` in the results.
- Default user-agent styles differ between libraries. The results file states
  whether the page counts matched in that capture.

### Recorded results

`benchmarks/comparison.json`, captured 2026-09-24 on an Apple M4 with Chromium
149.0.7827.55 at commit `f33ded4`:

| Scenario | Imposia | Paged.js 0.4.3 | Vivliostyle 2.45.2 |
| --- | ---: | ---: | ---: |
| `paginate-200` | 130.5 ms (200 pages) | 846.4 ms (200 pages) | 2140.1 ms (200 pages) |
| `edit-50` | 29.9 ms (50 pages) | 216.6 ms (50 pages) | 215.6 ms (50 pages) |
| `bundle` | 58.5 KiB | 94.2 KiB | 215.2 KiB |

The 2026-09-23 capture at `44594de` recorded Imposia at 249 ms and 45.9 ms.
The drop comes from `f33ded4`, which stopped relaying out the unplaced source
on every placement (see the Imposia harness results below).

To update the pinned versions, look up the current releases with
`curl -s https://registry.npmjs.org/pagedjs/latest` and
`curl -s https://registry.npmjs.org/@vivliostyle/core/latest`, change
`PAGEDJS_VERSION` and `VIVLIOSTYLE_VERSION` in the script, rerun it, and update
this page.
