# @imposia/react

`@imposia/react` is the primary React adapter for the browser page-document and
Viewer APIs. It requires React and React DOM 18 or newer and does not create a
second controller, iframe, layout pass, or asset-fetch path.

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
} from "@imposia/react";
import { useRef } from "react";
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
        onReady={(pageDocument) => console.log(pageDocument.pageCount)}
        onError={(error) => console.error(error)}
      />
      <button type="button" onClick={() => void handle.current?.print()}>
        Print
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
`ImposiaDocumentHandle` is the same public handle type when using
`ImposiaDocument`.
`print()` invokes the canonical iframe's native `Window.print()` so the browser
can offer Save as PDF. `exportEpub()` returns a reflowable `application/epub+zip`
Blob from semantic source, not a fixed-layout EPUB or PDF bytes.

## Theme CSS

Load a consumer theme after `@imposia/react/styles.css` and override the public
`--imposia-viewer-*` properties on `.imposia-viewer`. This makes themes
independently packageable and instance-scoped without adding a React or Core
lifecycle. See the [Viewer theme-module contract](../../packages/viewer/README.md#theme-modules).

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

The package also re-exports the public `@imposia/client` APIs and types, including
`PageExtension`, `EpubMetadata`, `EpubExportOptions`, and `EpubExportLimits`.
Extensions run in declaration order and remain inside Core's sanitizer, resolver,
warning, abort, rollback, and cleanup boundaries.

Page geometry, supported `@page` selectors and margin boxes, constrained
fragmentation, experimental footnotes/page floats, resolver-only assets, and the
Chromium-reference pagination boundary are defined in the
[compatibility matrix](../../docs/compatibility.md).

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
