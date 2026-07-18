# Imposia product contracts

## Status in the current implementation

The stable PDF renderer has moved to `@imposia/node`: it exports the Node/Playwright `createRenderer()` and its PDF render types, and `@imposia/cli` invokes that package to write a PDF. `@imposia/viewer` still exports the PDF.js `mountViewer()` surface. `@imposia/core` now exports browser-only `mountPageDocument()` and has a one-page canonical-iframe vertical slice in the current implementation. It is not yet the full browser-first product.

The `createRenderer()` move from `@imposia/core` to `@imposia/node` is an intentional pre-1.0 breaking workspace API change. Consumers of earlier snapshots must update their imports to `@imposia/node`.

## Target browser-first product

The target product turns supplied HTML or cloned light DOM plus optional explicit ordered CSS text (empty by default) into one library-owned paginated page DOM. Browser-only Core owns that DOM in an isolated iframe. Viewer wraps and displays the same iframe without cloning its pages or rerunning layout, and browser print invokes that frame. `@imposia/node` will host the exported browser paginator in Chromium and print that already-paginated frame to PDF. Target preview/export equality is page count, dimensions, ordered text, ordinary header/content/footer decorations, and blank-page positions - never byte or pixel identity.

The target source API and lifecycle are defined by ADR 0004: string HTML or a deep clone of light DOM; optional ordered CSS text; optional base URL and abort signals; immutable caller source; `ready`, `current`, `update(source, { signal? })`, `print()`, and async idempotent `destroy()`. The newest update wins and superseded work rejects `AbortError`. Source event listeners, shadow trees, and custom-element runtime state are not copied. Embedded page header/footer templates remain supported; matching API templates override them, page-number tokens resolve into ordinary page DOM, and blank pages decorate by default.

Every ready target generation is observable without inspecting PDF output: `PageDocument` provides its generation number, page count, immutable per-page metadata (physical number, side, blank state, CSS-pixel dimensions, and ordered body text), deterministic warnings with stable code/message/source identity, and total/resource/pagination timings. Browser-Core page dimensions are CSS pixels, not PDF points. `current` is undefined before the first ready page document and after destruction. Required warning codes include `PAGE_OVERFLOW`, `RESOURCE_BLOCKED`, `RESOURCE_TIMEOUT`, and `UNSUPPORTED_LAYOUT`; warning order is deterministic.

Target Core has no direct browser network or file-loading ability. It accepts only inline source and resources admitted or explicitly blocked by an asset resolver that receives URL, kind, optional base URL, and abort signal; it enforces total-byte, resolver-depth, and deadline bounds. It sanitizes structure, gives its frame restrictive CSP with inline style text plus only Core-created blob/data image/font/media assets and `sandbox="allow-same-origin"`, and revokes every resource it creates. The target defaults to A4 pages with 20 mm margins, supports a single simple unnamed `@page` fallback only after API page settings, and documents atomic-layout, source/node/page/deadline/progress bounds in ADR 0004. The current Core vertical slice is intentionally narrower: it produces one page and does not yet provide full fragmentation, Viewer iframe adoption, or a shared Node paginator.

## Stable PDF-first contract (`@imposia/node`)

The following sections describe the current implementation, retained during migration.

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

## Migration and rollback

The current Core/Viewer/CLI entrypoints are not aliases for the target API. `@imposia/node` currently contains the legacy PDF renderer and has not yet been changed to invoke the browser paginator; Core currently has only the one-page vertical slice; and Viewer still renders PDFs rather than the canonical iframe. Migration can ship only behind a Chromium-reference gate that proves canonical structural equality and confirms sandbox, CSP, resolver, and resource-revocation behavior. If that gate fails, the stable `@imposia/node` PDF renderer and PDF.js Viewer remain the release path; the target is not silently substituted.
