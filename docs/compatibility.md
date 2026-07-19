# Compatibility and publishing support

Imposia is a browser-only, React-first HTML/CSS publishing library. `@imposia/core`
can be used directly from browser ESM; `@imposia/client` combines Core and Viewer;
`@imposia/react` is the primary application adapter. There is no Node runtime or
CLI publishing surface.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Stable | Public, tested behavior in the declared browser contract. Changes are expected to preserve the documented shape and lifecycle. |
| Experimental | Opt-in or draft-heavy behavior. It has explicit limits and can produce a typed fallback warning. |
| Constrained | A stable, intentionally smaller subset. Inputs outside the subset remain atomic or warn; this is not full CSS parity. |
| Unsupported | Outside the product contract. Imposia does not promise an equivalent result or byte artifact. |

## Browser publishing matrix

| Capability | Status | Contract and boundaries |
| --- | --- | --- |
| Browser ESM package surface (`@imposia/core`, `@imposia/client`, `@imposia/react`, `@imposia/viewer`) | Stable | Browser DOM, `iframe`, `Blob`, and `Window.print()` APIs only. Core is usable without React; Client is the framework-neutral convenience entrypoint. |
| React adapter lifecycle and imperative handle | Stable | `ImposiaPageViewer` and `ImposiaDocument` retain one Core controller and one canonical iframe. The handle exposes `current`, `print()`, and `exportEpub()`. `useImposiaDocument()` exposes the host ref, state, current document, and controller for custom presentation. |
| Canonical page DOM, isolation, resolver boundary, abort, rollback, and cleanup | Stable | Core owns one sanitized iframe. Its sandbox admits same-origin measurement and native-print modals only; scripts remain disabled by both sandbox and CSP. Authored resources never fetch directly; discovered HTML/CSS assets pass through the host `assetResolver`, become Core-owned Blob URLs, and are revoked on replacement, failure, or destroy. |
| Page presets and custom geometry | Stable | `A4`, `Letter`, portrait/landscape, two absolute dimensions, and one/four-side absolute margins are normalized into `PageGeometry` in CSS pixels at 96 px/in. Host `page` options override authored defaults. |
| Authored `@page` rules and selectors | Stable | Default, `:first`, `:left`, `:right`, `:blank`, and named-page selectors are supported. Supported declarations include `size` and margins; unsupported declarations produce `PAGE_RULE_UNSUPPORTED` rather than a silent approximation. |
| Page margin boxes | Stable | Six boxes are supported: `@top-left`, `@top-center`, `@top-right`, `@bottom-left`, `@bottom-center`, and `@bottom-right`. Supported content is sanitized and projected into the canonical page DOM. |
| Breaks, page parity, `break-inside: avoid`, widows, and orphans | Stable | Nested `break-before`/`break-after`, legacy page-break aliases, page-side constraints, rendered-line breakpoint selection, and deterministic relaxation warnings are covered by the Chromium reference paginator. |
| Tables | Constrained | Row-boundary fragments preserve semantic row groups, repeated `thead`, `caption` on the first fragment, and `colgroup`. An oversized row remains atomic and warns; complex table layout is not full CSS parity. |
| Flex and grid | Constrained | Column/no-wrap flex and one-column, non-spanning grid may fragment between static direct children. Other directions, wrapping, tracks, spanning, ordering, or dynamic layout remain atomic with `UNSUPPORTED_LAYOUT`. |
| Multi-column layout | Constrained | The bounded path requires `column-fill: auto`, supported absolute geometry, normal block descendants, and no nesting, spanning, table, flex/grid, or page-float context. Unsupported cases stay atomic and warn. |
| Local target references and named strings | Constrained | Same-document `#id` links, target page/text markers, and source-order named strings can populate supported margin boxes. Missing or duplicate IDs warn deterministically; arbitrary cross-document lookup is not provided. |
| Footnotes and page floats | Experimental | Enable with `experimental.footnotes` or `experimental.pageFloats`. Footnotes are ordered, page-local, bottom-placed, and size/defer limited; page floats are top/bottom only. Disabled, oversized, unsupported, or over-deferred content falls back with `FOOTNOTE_DEFERRED` or `PAGE_FLOAT_FALLBACK`. |
| Browser EPUB export | Stable | `PageDocument.exportEpub()` returns a reflowable EPUB 3.3 `Blob` from the retained semantic source. It emits a deterministic store-mode archive, requires title/language/identifier metadata, admits only retained resolver assets, and enforces entry/byte limits plus abort and destroyed-document checks. Page wrappers, margin furniture, generated counters, Blob URLs, and page-only experimental artifacts are excluded. |
| Native print / Save as PDF | Stable | `PageDocumentController.print()`, the React handle, and the page Viewer invoke the current canonical iframe's `Window.print()`. The browser print dialog can offer Save as PDF. No PDF-byte export API is provided. |
| Fixed-layout EPUB, PDF byte export, Node/CLI rendering, and full CSS parity | Unsupported | Use native browser print for a PDF artifact and the reflowable EPUB Blob for semantic content. A server renderer, command-line renderer, fixed-layout EPUB, or complete implementation of every CSS fragmentation context is outside this browser contract. |

## Browser split

Chromium is the structural pagination reference. Firefox and WebKit are exercised
for the public API, iframe/CSP isolation, resolver boundaries, lifecycle and
cleanup, print invocation, and EPUB archive behavior. Their pagination metrics or
line-breaking details may differ; exact cross-browser page-count or pixel parity is
not promised.

Warnings are part of the public diagnostic surface. A supported subset can still
emit a recovery warning when a hard constraint cannot fit; unsupported authored
syntax is not silently presented as equivalent output. See
[`docs/verification.md`](verification.md) for the test and artifact mapping and
[`docs/architecture/0006-browser-publishing-contract.md`](architecture/0006-browser-publishing-contract.md)
for the auditable decision record.
