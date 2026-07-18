# Imposia product contracts

Imposia turns one HTML/CSS document into a deterministic PDF and renders that exact PDF in an accessible browser Viewer. Core owns trusted loading, compatibility normalization, warnings, resource readiness, browser reuse, and PDF metadata. Viewer owns interaction only. CLI owns process I/O and exit codes.

## Input and security

- Exactly one of inline `html`, local `file`, or remote `url` is accepted.
- `maxInputBytes` defaults to 5 MiB and bounds inline HTML, local files, and remote URL bodies. Local files are size-checked before reading and validated again after decoding. Remote bodies are decoded as a bounded stream, aborting as soon as the limit is crossed; the URL-input timeout covers both response headers and body consumption.
- Local files and file subresources can be constrained by `allowFileRoot`; lexical containment is checked first, then existing paths are compared by canonical `realpath` so symlinks cannot escape the root.
- Remote URL input and HTTP(S) subresources require `allowRemoteResources: true`.
- Script-capable elements, refresh-navigation metadata, inline event handlers, `javascript:` URLs, and HTML data URLs are removed before Chromium sees the document. Browser routing supplies a second resource boundary and rejects every follow-up navigation request.
- Font/resource readiness and navigation have explicit deadlines. Print media is active before document loading, and a request tracker plus font readiness and forced layout ensure print-only resources settle before `onResourcesReady`.
- The renderer is reusable until `close()` and rejects work afterward. It keeps at most one successfully reset local-only page; failed, timed-out, overflow, and remote-enabled pages are discarded so policy or origin state is not carried into another render.

## Paged-media compatibility

- Modern `break-before`/`break-after`: `auto | avoid | page | left | right`.
- Modern `break-inside`: `auto | avoid`.
- Legacy `page-break-before`/`page-break-after`: `auto | avoid | always | left | right`, with `always` normalized to `page`.
- Legacy `page-break-inside`: `auto | avoid`.
- A modern declaration wins over its matching legacy declaration. For `break-before` and `break-after`, Imposia preserves `left`/`right` boundaries and inserts exactly one blank sheet only when the requested parity requires it. Multiple boundaries are resolved cumulatively in document order.
- Unsupported values are ignored with deterministic, cross-feature first-source ordering and deduplication by warning code plus relevant identity.

## Page decorations

`<template data-page-header>` and `<template data-page-footer>` are extracted before rendering. API `headerTemplate` or `footerTemplate` overrides only the matching embedded decoration. Exact tokens `{{pageNumber}}` and `{{totalPages}}` map to Chromium counters; unknown tokens remain literal and emit a warning. Body, embedded decoration, and API decoration markup all pass through the same script/resource sanitizer. Core supplies a 20 mm horizontal safety inset to avoid clipped sheet-edge decorations.

## Result and lifecycle

The result contains PDF bytes, page count, per-page point dimensions, first-page size, ordered warnings, and total/browser startup/resource wait/print preparation/PDF generation timings. PDF generation includes page-side marker work, Chromium print pagination, and serialization because Chromium exposes no reliable phase boundary between those operations. Hooks fire in this order: start, warnings, resources ready, paginated, PDF ready. `close()` transitions the renderer through explicit active/closing/closed states, waits for external in-flight work, terminates callback-owned work, kills and awaits its owned browser server, and is idempotent.

## Viewer

The Viewer loads the exported PDF through PDF.js and supports continuous/single modes, bounded page navigation, 50%–250% zoom, buttons, arrow/PageUp/PageDown and `+`/`-` keyboard controls, focus visibility, loading/error announcements, and narrow-screen containment. It does not rerun HTML layout.

## Known limitations

- CSS support is Chromium 143 print support, not the complete CSS Paged Media specification. Margin boxes, named strings, footnotes, cross-references, and custom line breaking are not implemented by Imposia.
- Decorations use Chromium's restricted header/footer context; page styles and web fonts are not inherited automatically.
- The Viewer is canvas-first. Search, selectable text layers, annotations, forms, and editing are outside v1.
- Output may differ from other browser engines. The exported PDF is authoritative; Viewer browsers display that shared artifact.
