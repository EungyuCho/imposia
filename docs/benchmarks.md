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

`benchmarks/comparison.json`, captured 2026-09-23 on an Apple M4 with Chromium
149.0.7827.55 at commit `44594de`:

| Scenario | Imposia | Paged.js 0.4.3 | Vivliostyle 2.45.2 |
| --- | ---: | ---: | ---: |
| `paginate-200` | 249 ms (200 pages) | 850.7 ms (200 pages) | 2554.1 ms (200 pages) |
| `edit-50` | 45.9 ms (50 pages) | 216.7 ms (50 pages) | 253.7 ms (50 pages) |
| `bundle` | 56.8 KiB | 94.2 KiB | 215.2 KiB |

To update the pinned versions, look up the current releases with
`curl -s https://registry.npmjs.org/pagedjs/latest` and
`curl -s https://registry.npmjs.org/@vivliostyle/core/latest`, change
`PAGEDJS_VERSION` and `VIVLIOSTYLE_VERSION` in the script, rerun it, and update
this page.
