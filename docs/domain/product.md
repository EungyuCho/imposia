# Product contract

Imposia is a React-first, browser-only HTML/CSS pagination and publishing
library. Its primary contract is pagination integrity: within the declared
compatibility boundary, a committed generation preserves the fixture's visible
authored content exactly once and in source order, while page metadata,
navigation, diagnostics, Viewer presentation, and native print address the same
global page sequence.

In a client-side rendering (CSR) integration, the host application produces and
updates complete HTML, light-DOM, or Publication source values. Core paginates
those values. It does not execute authored scripts, capture an arbitrary running
application DOM, or take ownership of application state.

The browser packages are ESM libraries: there is no Node runtime, command-line
renderer, or server-side publishing API. Pagination integrity does not mean
complete CSS support, fixed physical page numbers across edits, exact
cross-browser page parity, or a guarantee that arbitrary input cannot overflow.
The authoritative support and recovery boundaries are in the
[compatibility matrix](../compatibility.md), and the accepted product decision is
[ADR 0011](../architecture/0011-html-csr-pagination-integrity.md).

Competitive development remains client-only. Publication composition, Reader
navigation, diagnostics, performance, and publishing CSS must strengthen the
browser surface without moving rendering or export authority to a server or CLI.

## Integration layers

- `@imposia/core` is the framework-neutral source of truth. `mountPageDocument()`
  sanitizes the source, resolves admitted assets, paginates a temporary
  noncanonical staging iframe, then atomically commits the result into one
  persistent canonical iframe. It returns immutable page metadata, warnings,
  timings, and the current generation.
- `@imposia/client` re-exports Core and the Viewer APIs for applications that want
  one browser-only dependency.
- `@imposia/react` is the primary application adapter. `ImposiaPageViewer` and
  `ImposiaDocument` mount the same Core controller and iframe through React
  effects. Its imperative handle exposes the current `PageDocument`, Viewer
  spread controls, `print()`, and `exportEpub()`. `useImposiaDocument()` exposes
  the host ref, lifecycle state, current document, and controller for custom
  React presentation.
- `@imposia/viewer` presents a canonical Core page document or an independent
  PDF.js document. The page Viewer retains Core's iframe and never clones pages or
  reruns layout. Its optional built-in control rail can be omitted for headless
  presentation while the same controller exposes page navigation, continuous,
  single, and spread modes, zoom, immutable state snapshots, and state
  subscriptions. Viewer CSS is scoped to the Viewer root; the host application
  retains ownership of document body styles, scrolling, background, and
  dimensions. Presentation modes keep one global page identity. An optional cover
  stands alone, and a narrow container temporarily presents the current spread as
  one page without changing the requested mode or current page. Its opt-in
  Inspector projects only the current committed warnings into a Viewer-owned
  panel. Warning selection follows the existing global-page navigation path,
  resolves entry-only findings to the committed entry start, and applies a
  temporary, non-layout, screen-only highlight from Core's trusted numeric source
  bounds. No source marker or DOM node crosses the public boundary. Generation
  replacement, presentation synchronization, timer expiry, and destroy clear
  Inspector state and presentation artifacts.

`mountPublication()` composes ordered entries into one committed
`PublicationDocument`. Its immutable outline is the sole authority for EPUB
navigation and Viewer's Reader table of contents. Reader destinations move
through the owning `PublicationController`; saved deep links contain a stable
destination ID and resolve it against the current generation. The React
Publication component wires the same controller into Viewer before delivering a
ready callback, and its imperative navigation never falls back to a second path.
Publication search builds a client-only index from sanitized visible text in the
current committed pages. Results expose immutable entry metadata, a global page,
a plain-text excerpt, and a controller-and-generation-scoped destination. Reader result
movement uses the same owned `PublicationController` destination path as the
table of contents; snapshot replacement rebuilds the index and removes stale
results. Thumbnail navigation projects immutable geometry and a bounded abstract
text-line count from each committed `PageMetadata`. It never clones authored DOM,
rasterizes pages, or paginates again. Selection targets the exact global page;
generation replacement discards old models and destroy clears the panel and its
listeners. Destroy clears Reader state and rejects later Reader actions. No
adapter exposes raw markup, reparses authored input, or creates another
presentation iframe.

Inspector, table-of-contents, Search, and Page thumbnail panels are mutually
exclusive. Inspector controls stay outside the canonical iframe. Its temporary
highlight is suppressed in print media, and semantic EPUB projection never
consumes Viewer UI or highlight state.

## Browser publishing contract

Core owns normalized page geometry (`PageGeometry` and `PageMargins`), authored
`@page` selectors and supported margin boxes, recursive flow fragmentation,
constrained table/flex/grid/multi-column handling, local target references,
named strings, and typed recovery warnings. Host `page` options override authored
page rules; authored rules override the A4/20 mm defaults when no host override is
present. Structural pagination is a Chromium-reference behavior; the
cross-browser contract is API, isolation, lifecycle, print invocation, and
resource cleanup.

For Stable behavior and documented Constrained subsets, public conformance
fixtures must preserve their visible source markers or ranges exactly once and
in order across the committed page sequence. Page membership must be monotonic,
and navigation, warnings, page metadata, Viewer presentation, and native print
must refer to that same generation. These fixture-scoped observations do not
authorize an unqualified claim about arbitrary HTML/CSS.

The public React publishing lab demonstrates those host page options with A4
portrait as its initial sheet, common A/ISO B/Letter size presets, and explicit
portrait/landscape controls.

The public document is structural: page count, dimensions, page-side and named
context, blank markers, ordered body text, decorations, warnings, timings, and the
canonical iframe. Extension transforms, asset policies, and decorations stay
inside Core's sanitizer, resolver, abort, rollback, warning, and cleanup
boundaries. A page decorator receives immutable `number`, `totalPages`, `side`,
and `blank` values for the accepted generation, allowing conditional furniture
such as a final-page-only footer without DOM access.

Publication extensions receive one sanitized copied entry string at a time
through `transformEntry`, together with frozen publication and entry metadata.
Core owns composition markers and re-sanitizes every returned string. Extension
diagnostics receive only Core-supplied generation, entry, or page provenance.
Registered cleanup runs when extension work finishes or is cancelled; no
extension receives the canonical DOM, staging DOM, resolver, Blob URL, or raw
committed source.

Source updates are prepared in a temporary, noncanonical staging iframe. The
previous committed generation remains visible in the persistent canonical iframe
while the candidate resolves and paginates, and one atomic commit makes the
successful candidate current. Failure, abort, or supersession leaves the previous
commit untouched and removes the staging iframe. The staging frame is never a
presentation or print authority.

Pagination is cooperatively time-sliced on the browser main thread. The default
8 ms budget yields through the best available task scheduler while retaining the
same browser measurement algorithm. Superseding work first aborts and cleans its
predecessor, so only one staging generation composes at a time. Fonts and images
settle after the candidate source and styles are mounted and before measurement.
Progress reports pass-local provisional page allocation; only the later atomic
commit becomes observable through `controller.current`. The complete decision is
[ADR 0012](../architecture/0012-cooperative-pagination.md).

## Assets and export

The host `assetResolver` is the only admitted resource boundary. Core discovers
HTML and CSS assets, asks the resolver for bytes, inserts only Core-owned Blob
URLs into the isolated frame, and revokes them on replacement, failure, or
destroy. Resolver output, input markup, CSS, and extension output are treated as
untrusted and remain subject to limits and warnings.

`PageDocument.exportEpub({ metadata, signal?, limits? })` returns a browser
`Blob` with MIME type `application/epub+zip`. The export is reflowable EPUB 3.3
content projected from the latest committed semantic source; it does not rerun
extensions or resolvers. Required metadata is `title`, `language`, and
`identifier`; optional `modified`, `maxEntries`, `maxBytes`, and `AbortSignal`
are bounded. Only retained resolver assets can be included. Page wrappers, margin
furniture, generated page counters, Blob URLs, and page-only experimental content
are intentionally omitted.

Printing remains native browser printing: Core, the React handle, and the page
Viewer clone the accepted canonical pages into a transient isolated top-document
print host before calling the top window's `Window.print()`. The browser may
provide Save as PDF, but Imposia does not expose PDF bytes and does not claim
fixed-layout EPUB output or complete CSS parity. The authoritative support matrix is
[`docs/compatibility.md`](../compatibility.md).

The isolated print host protects page content and generation styles, but CSS `@page`
rules remain document-level. Applications should avoid competing unnamed top-level
print-page rules while an Imposia print flow is active.
