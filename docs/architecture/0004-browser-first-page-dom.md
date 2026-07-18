# ADR 0004: browser-first authoritative page DOM

Status: accepted as the target architecture; not implemented at this commit. Supersedes [ADR 0001](0001-hybrid-renderer.md) for new work.

## Decision

The library owns one paginated, browser-native page DOM. That DOM, inside one isolated iframe, is the authoritative representation for preview and export. It is not a PDF preview, a canvas reconstruction, or a second layout run.

Target `@imposia/core` is browser-only: it accepts sanitized source and optional ordered CSS, paginates into the iframe, and exposes the resulting page DOM. Target `@imposia/viewer` only mounts, frames, scrolls, zooms, and prints that same iframe. It must not clone the pages, parse the source again, or run pagination itself. `print()` calls `contentWindow.print()` on that canonical frame.

An optional target `@imposia/node` package may run Chromium solely as a browser host and request PDF output from the same exported browser paginator. It must not contain another paginator or a PDF-first normalization path. After the canonical frame is ready, it asks Chromium to print that frame and returns PDF bytes.

## Target public contract

The target browser entrypoint is specified as:

```ts
type PageSource =
  | { html: string; baseUrl?: string }
  | { lightDom: Element | DocumentFragment; baseUrl?: string };

type AssetResolution =
  | { status: "resolved"; bytes: Uint8Array; mimeType: string }
  | { status: "blocked"; reason?: string };

type AssetResolver = (request: {
  url: string;
  kind: "font" | "image" | "media" | "stylesheet";
  baseUrl?: string;
  signal: AbortSignal;
}) => Promise<AssetResolution>;

interface PageLimits {
  maxInputBytes?: number;
  maxNodes?: number;
  maxAssetBytes?: number;
  maxAssetDepth?: number;
  resourceDeadlineMs?: number;
  maxPages?: number;
}

interface PageDocumentOptions {
  css?: readonly string[]; // defaults to []; otherwise applied exactly in array order
  assetResolver?: AssetResolver;
  page?: { size?: "A4"; margin?: "20mm" };
  limits?: PageLimits;
  headerTemplate?: string;
  footerTemplate?: string;
  decorateBlankPages?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: { completedPages: number }) => void;
}

interface PageDocument {
  readonly iframe: HTMLIFrameElement;
}

interface PageDocumentController {
  readonly ready: Promise<PageDocument>;
  update(source: PageSource, options?: { signal?: AbortSignal }): Promise<PageDocument>;
  print(): Promise<void>;
  destroy(): Promise<void>;
}

declare function mountPageDocument(
  container: HTMLElement,
  source: PageSource,
  options: PageDocumentOptions,
): PageDocumentController;

declare function mountViewer(
  container: HTMLElement,
  pageDocument: PageDocument,
): ViewerController;
```

`css` defaults to an empty list so plain HTML is valid. When supplied, it is an explicit list of CSS texts and its array order is cascade order. `baseUrl`, when supplied with either source form, is only the base used to identify asset references for the resolver; it does not authorize a browser fetch. An HTML string is parsed into a detached document. A `lightDom` value is deeply cloned before sanitization. In either form, the caller's source is never mutated, event listeners are never copied, shadow trees are excluded, and custom-element runtime state is not copied or upgraded for the source object. The canonical, sanitized clone is the only source the paginator uses.

`ready` settles for the initial canonical page document. `PageDocumentOptions.signal` cancels that initial operation; `update()` accepts its own signal and replaces the current document atomically after the replacement is ready. The most recently started update wins: every earlier unsettled update rejects an `AbortError`, even when it has no caller signal. An aborted caller signal also rejects that operation with `AbortError`. `print()` waits for the current winning document, then invokes that iframe's browser print method; it never produces or prints a reconstructed copy. `destroy()` is asynchronous, idempotent, rejects future work, waits for active teardown, and revokes every resource owned by the controller.

The resolved `PageDocument` exposes the canonical iframe. Target `mountViewer()` may put that iframe inside Viewer chrome and control its presentation, but it must retain that node and may not clone it, clone its page descendants, or invoke pagination.

## Canonical page DOM

The iframe and its page wrappers are public structural contracts, not an implementation detail:

```html
<iframe data-imposia-frame="page-document" sandbox="allow-same-origin"></iframe>
<!-- inside the iframe -->
<html data-imposia-document="v1">
  <body data-imposia-pages>
    <section data-imposia-page data-imposia-page-number="1"
             data-imposia-page-side="right" data-imposia-blank="false">
      <header data-imposia-page-header></header>
      <main data-imposia-page-content>
        <div data-imposia-page-flow></div>
      </main>
      <footer data-imposia-page-footer></footer>
    </section>
  </body>
</html>
```

Every page has `data-imposia-page`; `data-imposia-page-number` is one-based; `data-imposia-page-side` is `right` for recto and `left` for verso; and `data-imposia-blank` is `true` only for an inserted blank page. Header, content, and footer are ordinary DOM nodes in each page, so they are visible, inspectable, selectable, and printed from the same representation. Page 1 is always recto (`right`).

Source `<template data-page-header>` and `<template data-page-footer>` are retained as target inputs, extracted before flow pagination, structurally sanitized, and copied into each ordinary page header or footer. `headerTemplate` and `footerTemplate` independently override only their matching embedded template. After the final page count is known, exact `{{pageNumber}}` and `{{totalPages}}` tokens are resolved into ordinary text in the copied page DOM; unknown tokens remain literal and emit a warning. Blank pages decorate by default (`decorateBlankPages` defaults to `true`): they receive the resolved header/footer for their physical one-based page number while their page flow remains empty. Setting it to `false` leaves blank-page header and footer wrappers empty.

The default page box is A4 with 20 mm margins. An explicit API page field wins. For any page setting not supplied by API, one simple unnamed `@page` rule may supply `size` and/or `margin`; named pages, margin boxes, and conflicting or complex `@page` rules are unsupported rather than silently merged. If neither applies, the A4/20 mm default is used.

The supported fragmentation intent is `page`, `left`, `right`, and `avoid` for the modern `break-*` properties and their legacy `page-break-*` aliases. `left` and `right` may create a blank page so the next content lands on the requested side. Text splitting is grapheme-safe: no page split may divide an extended grapheme cluster.

Initially atomic means not split across pages: tables, flex/grid/multicol containers, transformed elements, positioned content, replaced elements, `canvas`, and shadow content. Tables include their contained table structure; positioned content includes absolute, fixed, and sticky positioning; and shadow content is excluded from a cloned light-DOM source rather than reconstructed. An atomic item either fits in one usable page area or is placed as one overflowing item with a warning. A non-atomic `avoid` group that exceeds a usable page area has `avoid` relaxed exactly once, emits one warning, and then uses normal fragmentation; it is never retried as `avoid`. Every pagination branch must either consume a source unit or advance to a new page. If a newly advanced empty page still cannot consume the next atomic item, the item is recorded as overflow and consumed, so the loop cannot stall. Unsupported paged-media features are reported as warnings.

## Isolation, resources, and limits

The frame has exactly `sandbox="allow-same-origin"`: it does not receive `allow-scripts`, `allow-forms`, `allow-top-navigation`, `allow-popups`, `allow-downloads`, or any navigation escape. It receives a restrictive CSP equivalent to `default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; style-src 'unsafe-inline'; img-src blob: data:; font-src blob: data:; media-src blob: data:`. Core injects supplied and resolved stylesheet text as inline style text and may reference only Core-created `blob:` or `data:` image, font, and media assets. It never emits a caller URL into the frame. Structural sanitization removes executable elements, event-handler attributes, navigation and form surfaces, plugin/embed surfaces, unsafe URL schemes, and unsupported layout controls before content reaches the frame.

Browser Core never fetches network or file URLs directly. All non-inline assets cross the explicit `AssetResolver` boundary supplied by the host, with the source `url`, optional source `baseUrl`, asset kind, and operation signal. A `blocked` result is a successful policy outcome: Core removes that asset reference and emits a deterministic blocked-resource warning without attempting another route. A resolved response is copied into a Core-created blob or data URL; no caller URL is inserted into the frame. Core owns and revokes these resource URLs on replacement, failure, and destruction.

Before `ready` settles, all resolved resources must either become ready or hit the resource deadline. The target defaults are 5 MiB source input, 100,000 cloned DOM nodes, 25 MiB total resolved-asset bytes, resolver-reference depth 8, 10,000 output pages, and a 30-second resource deadline. Asset bytes are counted cumulatively across resolved responses; derived references increment depth; and the deadline covers resolving, resource readiness, and pagination preparation. Hosts may tighten, but not disable, these limits. Pagination emits bounded progress no more than once per completed page and no more than 60 times per second. Hitting an input, node, asset-byte, resolver-depth, page, or deadline limit fails the operation deterministically. An unbreakable item that exceeds its usable page area emits an overflow warning with its page and source identity; the host can elect to treat warnings as failures.

## Equality and export

Browser preview and Node PDF export are equivalent when their canonical page DOM has the same page count, page dimensions, ordered text, decorations, and blank-page positions. PDF bytes, raster pixels, accessibility-tree serialization, font subset ordering, and metadata are explicitly not equality criteria.

The migration is complete only when the browser path produces that canonical DOM, Viewer displays that instance, and `@imposia/node` prints that frame. Until then, the legacy PDF-first path remains the stable release path. The rollback gate is any failure of the structural equality contract, isolation contract, or required resource cleanup in Chromium-reference tests; release traffic stays on the legacy path until the failing target change is corrected or withdrawn.
