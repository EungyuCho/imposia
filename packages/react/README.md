# @imposia/react

`@imposia/react` is the primary React adapter for the browser page-document and
Viewer APIs. It requires React and React DOM 18 or newer and does not create a
second controller, iframe, layout pass, or asset-fetch path.

Prop-driven HTML/CSR updates are staged atomically. The component keeps the
previous committed pages visible until a complete winning generation is ready.

## Install

```bash
pnpm add @imposia/react react react-dom
```

## Component and imperative handle

```tsx
import {
  ImposiaPageViewer,
  type EpubExportOptions,
  type ImposiaPageViewerHandle,
  type PageViewerState,
} from "@imposia/react";
import { useRef, useState } from "react";
import "@imposia/react/styles.css";

export function BookPreview() {
  const handle = useRef<ImposiaPageViewerHandle>(null);
  const epubOptions: EpubExportOptions = {
    metadata: { title: "Hello", language: "en", identifier: "urn:example:hello" },
  };
  return (
    <>
      <ImposiaPageViewer
        ref={handle}
        source={{ html: "<article><h1>Hello</h1></article>" }}
        viewerOptions={{ mode: "spread", spread: { cover: true }, inspector: true }}
        onReady={(pageDocument) => console.log(pageDocument.pageCount)}
        onError={(error) => console.error(error)}
      />
      <button type="button" onClick={() => void handle.current?.print()}>
        Print
      </button>
      <button type="button" onClick={() => handle.current?.setMode("spread")}>
        Spread
      </button>
      <button type="button" onClick={() => handle.current?.openInspector()}>
        Diagnostics
      </button>
      <button
        type="button"
        onClick={() => void handle.current?.exportEpub(epubOptions)}
      >
        Export EPUB
      </button>
    </>
  );
}
```

The handle always delegates to the current Core generation. `current` becomes
`undefined` after unmount; `print()` and `exportEpub()` reject after disposal.
`setMode()` switches between continuous, single, and spread presentation, while
`setSpreadCover()` changes whether page 1 stands alone. Both actions target the
mounted page Viewer and retain its canonical iframe and Core generation.
`ImposiaDocumentHandle` is the same public handle type when using
`ImposiaDocument`.
`print()` invokes the top window's native `Window.print()` on a transient,
isolated snapshot of the committed canonical pages so the browser can offer Save
as PDF without iframe blank-sheet failures. `exportEpub()` returns a reflowable
`application/epub+zip` Blob from semantic source, not a fixed-layout EPUB or PDF bytes.

For a host-designed header, disable the built-in controls and drive the Viewer
through its handle:

```tsx
export function HeadlessPreview({ html }: { html: string }) {
  const handle = useRef<ImposiaPageViewerHandle>(null);
  const [viewerState, setViewerState] = useState<PageViewerState>();

  return (
    <section>
      <header>
        <button type="button" onClick={() => handle.current?.previousPage()}>
          Previous
        </button>
        <output>{viewerState?.page ?? 0} / {viewerState?.pageCount ?? 0}</output>
        <button type="button" onClick={() => handle.current?.nextPage()}>
          Next
        </button>
        <button type="button" onClick={() => handle.current?.setMode("spread")}>
          Spread
        </button>
        <button
          type="button"
          onClick={() => handle.current?.setZoom((handle.current.viewerState?.zoom ?? 1) + 0.1)}
        >
          Zoom in
        </button>
      </header>
      <ImposiaPageViewer
        ref={handle}
        source={{ html }}
        viewerOptions={{ controls: false }}
        onViewerStateChange={setViewerState}
        style={{ height: 640 }}
      />
    </section>
  );
}
```

`viewerState`, `goToPage()`, `nextPage()`, `previousPage()`, and `setZoom()`
complement the existing mode and spread-cover methods. Viewer CSS is scoped to
the Viewer host and descendants; it does not change `body`, `:root`, or
unrelated elements. The host application owns the preview height, background,
and surrounding scroll behavior.
Because `controls: false` omits the built-in mode-status `aria-live` region,
hosts that need equivalent screen-reader mode announcements must provide their
own live region and update it from `onViewerStateChange`.

Set `viewerOptions.inspector` to `true` to mount the diagnostics panel. The
handle exposes `openInspector()`, `closeInspector()`, `toggleInspector()`, and
`selectWarning()`. Pass a warning from `handle.current.current.warnings`; a
warning from a replaced generation is rejected. The same methods are available
on `ImposiaPublicationViewerHandle`. Changing the `inspector` option remounts
only the Viewer presentation controls and preserves the current page, requested
mode, Core generation, and canonical iframe. Replacement options are validated
before teardown; an invalid combined Inspector/theme or Reader change reports
through `onError` while the prior Viewer remains usable.

## Ordered Publication component

`ImposiaPublicationViewer` mounts the Core Publication controller and presents
its canonical iframe through Viewer. Its handle exposes the current committed
Publication, shared-outline navigation, print, and ordered EPUB export:

```tsx
import {
  ImposiaPublicationViewer,
  type ImposiaPublicationViewerHandle,
  type PublicationSnapshot,
} from "@imposia/react";
import { useRef } from "react";

const snapshot: PublicationSnapshot = {
  metadata: { title: "Field Notes", language: "en" },
  entries: [
    { id: "cover", title: "Cover", html: "<h1>Field Notes</h1>" },
    { id: "chapter", title: "Chapter", html: "<h1>First chapter</h1>" },
  ],
};

export function PublicationPreview() {
  const handle = useRef<ImposiaPublicationViewerHandle>(null);
  return (
    <>
      <ImposiaPublicationViewer
        ref={handle}
        snapshot={snapshot}
        viewerOptions={{ mode: "spread", spread: { cover: true }, inspector: true }}
        readerOptions={{
          initialDeepLink: location.hash.slice(1),
          onDeepLinkChange: (value) =>
            history.replaceState(
              null,
              "",
              value === undefined ? `${location.pathname}${location.search}` : `#${value}`,
            ),
        }}
        onReady={(publication) => console.log(publication.outline)}
      />
      <button
        type="button"
        onClick={() => {
          const destination = handle.current?.current?.outline[1]?.destination;
          if (destination !== undefined) handle.current?.navigate(destination);
        }}
      >
        Open chapter
      </button>
      <button
        type="button"
        onClick={() => {
          const result = handle.current?.search("first chapter")[0];
          if (result !== undefined) handle.current?.selectSearchResult(result);
        }}
      >
        Find chapter text
      </button>
    </>
  );
}
```

For custom presentation, `useImposiaPublication({ snapshot })` returns
`hostRef`, `state`, and the current Core `controller`. Snapshot reference changes
call `controller.update()` and keep the previous committed Publication visible
while the next one stages. Use `snapshotRevision` to intentionally reprocess an
otherwise identical snapshot. `publicationOptions` are fixed for one controller
lifetime; increment `publicationOptionsRevision` to replace the controller when
resolver, limit, page, or progress configuration changes.

The Publication component automatically connects Viewer's Reader to its owned
Core controller. The handle can call `openTableOfContents()`,
`closeTableOfContents()`, `toggleTableOfContents()`, and `restoreDeepLink()`.
Its `navigate()` method follows the same Reader path as a table-of-contents
selection, keeping the Viewer page and deep-link callback in sync.
The same handle exposes `openSearch()`, `closeSearch()`, `toggleSearch()`,
`search()`, `previousSearchResult()`, `nextSearchResult()`, and
`selectSearchResult()`. Search results always belong to the current controller
and committed snapshot, and navigate through the owned Reader controller. A
controller replacement rejects results retained from the previous controller.
For page previews, the handle exposes `openThumbnails()`, `closeThumbnails()`,
`toggleThumbnails()`, `getThumbnails()`, and `selectThumbnail()`. The returned
immutable models describe the current committed pages only. Selection moves the
existing Viewer to the exact global page without another iframe, raster pass, or
pagination pass.

Strict Mode cleanup and overlapping snapshot replacements are latest-only: stale
ready/error callbacks do not publish stale `current` or outline state, and a
replacement does not add another canonical iframe. Unmount destroys the
controller and releases both canonical and staging resources.

## Theme CSS

Load a consumer theme after `@imposia/react/styles.css` and override the public
`--imposia-viewer-*` properties on `.imposia-viewer`. This makes themes
independently packageable and instance-scoped without adding a React or Core
lifecycle. See the [Viewer theme-module contract](../../packages/viewer/README.md#theme-modules).

For a runtime theme, pass custom-property tokens through `viewerOptions`:

```tsx
<ImposiaPageViewer
  source={{ html }}
  viewerOptions={{
    theme: { "--imposia-viewer-color-accent": "#8b6cff" },
  }}
/>
```

Treat the theme object as immutable. A new object identity updates the mounted
Viewer without remounting Core or the canonical iframe.

## Hook for custom React presentation

```tsx
import { useImposiaDocument } from "@imposia/react";

export function CustomPreview({ html }: { html: string }) {
  const { hostRef, state, controller } = useImposiaDocument({ source: { html } });
  return (
    <section>
      <div ref={hostRef} data-status={state.status} />
      <button type="button" disabled={state.status !== "ready"} onClick={() => void controller?.print()}>
        Print
      </button>
      {state.document === undefined ? null : <output>{state.document.pageCount} pages</output>}
    </section>
  );
}
```

`useImposiaDocument()` returns the host ref, `idle`/`loading`/`ready`/`error`
state, the current `PageDocument` when available, and the Core controller. Source
updates reuse the same canonical iframe; failed updates retain the previous
committed generation, and unmount destroys the controller and releases resources.
Pass `sourceRevision` when extension state must reprocess otherwise identical
HTML without remounting the controller or adding revision markers to the document.
`documentOptions` are fixed for a controller lifetime. When a new resolver,
extension set, limit, or page configuration must take effect, increment
`documentOptionsRevision`; React replaces the controller and canonical iframe
with one configured from the new options. This explicit revision avoids
accidental remounts when a parent recreates an equivalent options object.

The package also re-exports the public `@imposia/client` APIs and types, including
`PageExtension`, `EpubMetadata`, `EpubExportOptions`, and `EpubExportLimits`.
Extensions run in declaration order and remain inside Core's sanitizer, resolver,
warning, abort, rollback, and cleanup boundaries.

Page geometry, supported `@page` selectors and margin boxes, constrained
fragmentation, experimental footnotes/page floats, resolver-only assets, and the
Chromium-reference pagination boundary are defined in the
[compatibility matrix](../../docs/compatibility.md).

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
