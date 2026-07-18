# Product contract

Imposia is a React-first, browser-only HTML/CSS publishing library. The browser
packages are ESM libraries: there is no Node runtime, command-line renderer, or
server-side publishing API.

## Integration layers

- `@imposia/core` is the framework-neutral source of truth. `mountPageDocument()`
  sanitizes the source, resolves admitted assets, paginates one canonical iframe,
  and returns immutable page metadata, warnings, timings, and the current
  generation.
- `@imposia/client` re-exports Core and the Viewer APIs for applications that want
  one browser-only dependency.
- `@imposia/react` is the primary application adapter. `ImposiaPageViewer` and
  `ImposiaDocument` mount the same Core controller and iframe through React
  effects. Its imperative handle exposes the current `PageDocument`, `print()`,
  and `exportEpub()`. `useImposiaDocument()` exposes the host ref, lifecycle state,
  current document, and controller for custom React presentation.
- `@imposia/viewer` presents a canonical Core page document or an independent
  PDF.js document. The page Viewer retains Core's iframe and never clones pages or
  reruns layout.

## Browser publishing contract

Core owns normalized page geometry (`PageGeometry` and `PageMargins`), authored
`@page` selectors and supported margin boxes, recursive flow fragmentation,
constrained table/flex/grid/multi-column handling, local target references,
named strings, and typed recovery warnings. Host `page` options override authored
page rules; authored rules override the A4/20 mm defaults when no host override is
present. Structural pagination is a Chromium-reference behavior; the
cross-browser contract is API, isolation, lifecycle, print invocation, and
resource cleanup.

The public document is structural: page count, dimensions, page-side and named
context, blank markers, ordered body text, decorations, warnings, timings, and the
canonical iframe. Extension transforms, asset policies, and decorations stay
inside Core's sanitizer, resolver, abort, rollback, warning, and cleanup
boundaries.

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
Viewer call the canonical iframe's `Window.print()`. The browser may provide
Save as PDF, but Imposia does not expose PDF bytes and does not claim fixed-layout
EPUB output or complete CSS parity. The authoritative support matrix is
[`docs/compatibility.md`](../compatibility.md).
