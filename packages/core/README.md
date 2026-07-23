# @imposia/core

`@imposia/core` is the browser ESM API for creating a sanitized, paginated page
document in one isolated canonical iframe. It is the framework-neutral source of
truth and can be used directly without React, Node, or a CLI.

Source updates paginate in a temporary noncanonical iframe. The previous
generation remains visible until a complete replacement commits, so hosts never
need to present a partially paginated CSR state.

## Install

```bash
pnpm add @imposia/core
```

## Mount and inspect a page document

```ts
import { mountPageDocument } from "@imposia/core";

const controller = mountPageDocument(
  document.querySelector<HTMLElement>("#preview")!,
  { html: "<article><h1>Hello</h1><p>Browser page DOM</p></article>" },
  {
    page: { size: "A4", orientation: "portrait", margin: "18mm" },
  },
);
const pageDocument = await controller.ready;

console.log(pageDocument.pageCount, pageDocument.pages, pageDocument.warnings);
```

`PageMetadata` includes normalized sheet/content geometry, page side and name,
blank state, context, and ordered body text. Supported authored `@page` selectors
and six margin boxes, breaks, constrained tables/flex/grid/multi-column layout,
local references, and named strings are described in the [compatibility matrix](../../docs/compatibility.md).
Structural pagination is a Chromium-reference behavior; this package does not
claim complete CSS parity across engines.

## Locate committed warnings

Every committed `PageWarning` includes one frozen `location`:

```ts
interface PageWarningLocation {
  readonly generation: number | undefined;
  readonly entryId: string | undefined;
  readonly page: number | undefined;
}
```

`generation` identifies the `PageDocument` that produced the warning. `page` is
the affected global page when Core can trace the synthetic `sourceIdentity` into
the committed page DOM. A `PublicationDocument` also supplies `entryId` when the
source belongs to a committed entry. An unknown field remains present with the
value `undefined`, so consumers do not need separate warning shapes.

Read `controller.current.warnings` after an update to inspect only the current
generation. Older committed documents remain immutable, but their warnings do
not carry into the replacement. Warning locations contain only generation,
entry identifier, and page metadata. They do not contain authored DOM nodes,
raw markup, scripts, asset URLs, resolver results, or temporary source-order
markers.

`pageWarningTargetBounds(pageDocument, warning)` returns a frozen viewport-space
rectangle for a current warning whose trusted source fragment survived into the
canonical page. It returns `undefined` for stale, global, or unresolvable
warnings and never exposes the retained element or adds a marker to canonical
DOM. Viewer uses these read-only bounds for its external Inspector outline.

The constrained table path fragments semantic tables only between complete row
clusters. Continuations repeat `thead`, `tfoot`, and `colgroup`, while `caption`
stays on the first fragment. Positive bounded `rowspan` cells keep their
connected rows together, and `colspan` stays within its row. An oversized row
cluster or oversized caption/header/footer remains atomic and reports a located
`UNSUPPORTED_LAYOUT` together with `PAGE_OVERFLOW`. Open-ended or cross-group
spans, generated table items, internal forced breaks, non-table display, and
table-subtree styling that depends on authored ID selectors remain atomic with
`UNSUPPORTED_LAYOUT`.

The constrained Flex path fragments column/no-wrap containers between in-flow
`static` or `relative` children whose integer `order` values do not change DOM
order. Supported nested column Flex cards use the same boundary. Forced page
breaks and fitting `break-inside: avoid` cards are preserved; impossible
avoidance produces `AVOID_RELAXED`. Wrapping, reverse directions, authored
reordering, and generated `::before`/`::after` Flex items remain atomic with
`UNSUPPORTED_LAYOUT`.

The constrained Grid path supports block Grid containers with explicit unnamed
columns, row auto-flow, and source-ordered `static` items that use only automatic
placement. Pagination keeps each complete auto-placement row together, applies
the resolved column and source-row track sizes to every continuation, applies
item page breaks at the row boundary, and preserves fitting `break-inside: avoid`
items. Spanning, explicit placement, reordered items, dense/column flow,
template areas, named/subgrid/masonry tracks, generated Grid items, and nested
forced breaks remain atomic with `UNSUPPORTED_LAYOUT`.

The constrained multi-column path requires horizontal left-to-right writing,
zero outer margins, a positive absolute `height` from an active authored rule,
`column-fill: auto`, an integer `column-count` or positive absolute
`column-width`, and an absolute `column-gap`. It fragments overflow columns
across pages in source order. Static block children can use
`break-inside: avoid`, and fitting direct
`column-span: all` children create full-width boundaries between column lines.
Nested or oversized spanners, nested multicol, balanced fill, generated items,
list-item roots and list markers, positioned/floating/transformed boxes, nested
table/Flex/Grid, internal forced page breaks or page names, direct text,
relative or auto height, container/scope rule dependencies, fragment-sensitive
structural selectors, and authored ID-selector-dependent styling remain atomic
with a located `UNSUPPORTED_LAYOUT`. A fixed multicol height taller than the
usable page also reports `PAGE_OVERFLOW`.

Core preserves the browser's language-tagged, horizontal CJK `line-break` and
`word-break` behavior and fragments plain-text paragraphs only at observed
rendered-line boundaries. Positive integer `widows` and `orphans` constrain
those page breaks. When an engine does not expose the properties, Core can
enforce direct or inherited inline integer declarations and reports
`WIDOW_ORPHAN_FALLBACK`; impossible combinations recover once with
`WIDOW_ORPHAN_RELAXED`. Browser-native `hyphens: auto` remains available for a
plain-text element with a valid inherited or local content language, including
the source document's `<html lang>`. Without one, Core uses `hyphens: manual`
and reports `HYPHENATION_FALLBACK`, because dictionary-backed hyphen placement
is not a cross-engine promise. An ordinary horizontal wrapping text block with
an overlong direct text run recovers with `overflow-wrap: anywhere` and a
located `UNBREAKABLE_CONTENT`. Authored `white-space: nowrap` remains unchanged
and reports the same located warning plus `PAGE_OVERFLOW` when it exceeds the
inline page area. Overflowing vertical text remains atomic and reports
`UNSUPPORTED_FRAGMENTATION_CONTEXT` plus `PAGE_OVERFLOW`.

Local `target-counter()` and `target-text()` support is intentionally bounded to
top-level `::before`/`::after` rules. It follows authored `content` importance,
specificity, and source order. Keep marker styling in the same rule as the target
function; conditional/layered target content and competing conditional
pseudo-content recover with a typed warning instead of being flattened.

## Mount an ordered Publication

Use `mountPublication()` when one committed page sequence must contain multiple
HTML or light-DOM sources. Core keeps the entry order, metadata, and inclusive
global page ranges in one immutable committed result.

```ts
import { mountPublication, type PublicationSnapshot } from "@imposia/core";

const host = document.querySelector<HTMLElement>("#preview");
if (host === null) throw new Error("Missing #preview host.");

const snapshot: PublicationSnapshot = {
  metadata: { title: "Field Notes", language: "en" },
  entries: [
    {
      id: "preface",
      title: "Preface",
      html: "<h1>Preface</h1><p>Opening note.</p>",
      baseUrl: "https://assets.example.test/preface/",
    },
    {
      id: "chapter-1",
      title: "First chapter",
      html: "<h1>First chapter</h1><p>Chapter text.</p>",
      baseUrl: "https://assets.example.test/chapter-1/",
    },
  ],
};

const controller = mountPublication(host, snapshot);
const publication = await controller.ready;

console.log(publication.pageCount);
console.log(publication.entries[0]?.pageRange); // { start: 1, end: 1 }

const firstHeading = publication.outline[0]?.children[0];
if (firstHeading !== undefined) {
  const currentDestination = controller.resolveDestination(firstHeading.destination.id);
  if (currentDestination !== undefined) controller.navigate(currentDestination);
}

const matches = controller.search("chapter text");
if (matches[0] !== undefined) controller.navigate(matches[0].destination);
```

The public signature is:

```ts
mountPublication(
  container: HTMLElement,
  snapshot: PublicationSnapshot,
  options?: PublicationOptions,
): PublicationController;
```

`snapshot.metadata.title` and every entry's `id` and `title` must be nonblank.
Metadata can also include string `language` and `identifier` values. Entries form
a non-empty ordered array and provide exactly one `html` or `lightDom` source.
Entry identifiers must be unique and cannot contain whitespace or control
characters. `PublicationOptions` accepts the same page, resolver, limit,
decoration, experimental page-feature, progress, abort, and capability-bounded
extension settings as `PageDocumentOptions`. A Publication extension transforms
one sanitized copied entry string through `transformEntry`; it never receives the composed
source or Core's entry markers. The unrestricted PageDocument `transform`
callback is rejected for a Publication. Invalid initial input throws before
staging, and an invalid update rejects without replacing the committed
Publication.

Each committed entry exposes an inclusive `pageRange` in the Publication's one
global page sequence. Adjacent entries can share a page, so their ranges can
overlap. A per-entry `baseUrl` resolves that entry's relative HTML and CSS asset
references before the shared `assetResolver` receives them. Core never fetches
an entry or authored asset URL directly.

Each committed Publication also exposes one immutable `outline`. Its entry roots
come from explicit entry `id` and `title` metadata; sanitized visible `h1`–`h6`
elements extend each root in authored order and heading hierarchy. Each item has
`kind`, `title`, `level`, `children`, and a `destination` containing a stable
`id`, the owning `entryId`, its committed global `page`, and the commit
`generation`. Missing, duplicate, and unsafe authored heading identifiers are
normalized into deterministic destination ids. Hidden headings and authored
script or style content do not enter the outline.

`controller.search(query)` searches the current committed generation's sanitized,
visible semantic text. It returns one immutable result per matching entry and
global page. Each result contains the committed entry metadata, global `page`, a
plain-text context `excerpt`, and a controller-and-generation-scoped
`destination`. Empty and
whitespace-only queries return no results. Hidden, inert, `aria-hidden`,
`script`, `style`, and `template` content does not enter the index, and results
never contain DOM nodes or authored markup.

`controller.resolveDestination(id)` resolves current outline and search
destinations. `controller.navigate(destination)` moves the canonical iframe
through the same public path for both. Outline destination ids remain
deterministic when the same entry and heading identifiers survive an update;
search destination ids belong to one controller and committed generation.
Callers must search or resolve again after a commit or controller replacement.
Passing a destination from an earlier generation or controller throws
`STALE_PUBLICATION_DESTINATION`, and removed destinations no longer resolve.

`controller.update(nextSnapshot, { signal? })` replaces the whole snapshot.
Core copies the input before staging and commits metadata, ordered entries, page
ranges, and page content together. Invalid, aborted, failed, or superseded work
keeps the previous committed Publication. `controller.print()` uses the same
canonical iframe, and `controller.destroy()` aborts pending work and removes the
canonical and staging frames.

## Resolver-only assets and ordered extensions

Core accepts an optional `assetResolver`. Every discovered HTML or CSS resource
must pass through that resolver before Core creates a Blob URL inside the frame.
Authored URLs do not fetch directly; Core-owned URLs are revoked on replacement,
failure, and destroy. Input, resolver output, and extension output remain subject
to sanitization, limits, abort, rollback, warnings, and cleanup.

Ordered extensions can transform sanitized copied string input, filter resolver requests,
and add page decorations without receiving DOM or network access. This example
adds furniture from immutable page metadata:

```ts
import { mountPageDocument, type PageExtension } from "@imposia/core";

const lastPageFooter: PageExtension = {
  name: "example/last-page-footer",
  decoratePage: ({ blank, number, totalPages }) =>
    blank || number !== totalPages
      ? undefined
      : { footerHtml: "The End · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, { extensions: [lastPageFooter] });
```

Extension order is fixed for the controller lifetime. Extensions cannot replace
the resolver, access the canonical DOM, weaken limits/CSP, or change lifecycle
atomicity.

A Publication uses `transformEntry` so Core can preserve its private composition
markers. The callback receives sanitized copied input plus frozen publication and
entry metadata, and Core re-sanitizes and re-limits the returned strings:

```ts
import { mountPublication, type PublicationExtension } from "@imposia/core";

const activeEntries = new Set<string>();
const chapterPolicy: PublicationExtension = {
  name: "example/chapter-policy",
  transformEntry(input, context) {
    activeEntries.add(input.entry.id);
    context.onCleanup(() => activeEntries.delete(input.entry.id));
    if (input.entry.id === "appendix") {
      context.warn({
        code: "EXTENSION_APPENDIX_POLICY",
        message: "The appendix policy was applied.",
      });
    }
    return { html: `${input.html}<p>Reviewed for ${input.publication.title}</p>` };
  },
};

const publication = mountPublication(host, snapshot, {
  extensions: [chapterPolicy],
});
```

`transformEntry` runs serially by entry and extension order. Core removes
executable markup and normalizes CSS before the callback. Its input contains only
sanitized strings plus immutable `publication` and `entry` metadata. `context.signal`
is aborted for caller abort, supersession, and destroy. `context.onCleanup()`
runs registered synchronous cleanup after the generation finishes or fails.
Extension callbacks cannot receive a `Document`, `Element`, iframe, resolver,
Blob URL, raw committed content, or mutable warning collection. A thrown callback
rejects with `ImposiaError.code === "EXTENSION_FAILED"`; the previous committed
generation remains current. `context.warn()` produces a frozen namespaced
warning, and Core supplies its generation plus entry or page location when the
callback scope identifies one.

## Reflowable EPUB export

`PageDocument.exportEpub()` returns a browser `Blob` with MIME type
`application/epub+zip` from the latest committed semantic source:

```ts
const epub = await pageDocument.exportEpub({
  metadata: {
    title: "Hello",
    language: "en",
    identifier: "urn:example:hello",
    modified: "2026-07-19T00:00:00Z",
  },
  limits: { maxEntries: 512, maxBytes: 16 * 1024 * 1024 },
});

const downloadUrl = URL.createObjectURL(epub);
const link = document.createElement("a");
link.href = downloadUrl;
link.download = "hello.epub";
link.click();
setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
```

`title`, `language`, and `identifier` are required; `modified`, `signal`,
`maxEntries`, and `maxBytes` are optional and bounded. Export does not rerun
extensions or resolvers. The archive is reflowable EPUB 3.3, uses retained
resolver bytes only, and omits page wrappers, margin furniture, generated page
counters, Blob URLs, and page-only experimental artifacts. It is not a
fixed-layout EPUB or PDF-byte exporter.

For a `PublicationDocument`, the same method writes one XHTML spine document per
committed entry. Spine order matches `publication.entries`, and EPUB navigation
is derived from the same immutable `publication.outline` and destination ids
used by `resolveDestination()`:

```ts
const epub = await publication.exportEpub({
  metadata: {
    title: publication.metadata.title,
    language: publication.metadata.language ?? "en",
    identifier: publication.metadata.identifier ?? "urn:example:field-notes",
  },
});
```

Entry XHTML contains its own sanitized semantic content, not the composed page
DOM. Export reads only the committed source snapshot and assets already retained
through `assetResolver`; it never fetches an entry's `baseUrl` or an authored
asset URL.

When an update is in flight, both `exportEpub()` and `controller.print()` wait
for the same latest successful committed generation. A failed update keeps the
previous committed document available; `destroy()` aborts pending publishing
work and waits for it to settle before it resolves.

Core prepares each update in a temporary, noncanonical staging iframe. The
committed pages stay visible in the persistent canonical iframe until staging
succeeds, then one atomic commit replaces them and removes the staging iframe.
This provides double-buffered updates without introducing a second presentation
or print authority.

Printing remains native browser printing:

```ts
await controller.print(); // invokes the current canonical iframe's Window.print()
```

The canonical iframe sandbox permits modals only so this native print dialog can
open; authored scripts remain disabled by the sandbox and CSP. The browser can
offer Save as PDF from the print dialog; Core does not return PDF bytes. Call
`controller.destroy()` when the host is no longer needed.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
