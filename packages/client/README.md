# @imposia/client

`@imposia/client` is the browser ESM convenience entrypoint for the Core page-document and Viewer APIs.

## Install

```bash
pnpm add @imposia/client
```

## Use

```ts
import { mountPageDocument, mountPageViewer } from "@imposia/client";
import "@imposia/client/styles.css";

const host = document.querySelector<HTMLElement>("#preview")!;
const controller = mountPageDocument(host, { html: "<article><h1>Hello</h1></article>" });
const pageDocument = await controller.ready;
const viewer = mountPageViewer(host, pageDocument);

viewer.setMode("single");
```

The entrypoint re-exports the Core page-document API and types together with the Viewer APIs and types. `mountPageViewer()` presents Core's existing canonical iframe; it does not clone pages or run a second layout pass.

The Core extension contract is available from the same entrypoint:

```ts
import type { PageExtension } from "@imposia/client";

const runningHead: PageExtension = {
  name: "example/running-head",
  decoratePage: ({ blank }) =>
    blank ? undefined : { headerHtml: "Chapter · {{pageNumber}} / {{totalPages}}" },
};
```

Pass extensions through `mountPageDocument(..., { extensions: [runningHead] })`. They run in declaration order and remain inside Core's sanitizer, resolver, warning, abort, and cleanup boundaries.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
