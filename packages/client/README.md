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

The entrypoint re-exports the public APIs and types from `@imposia/core` and `@imposia/viewer`. `mountPageViewer()` presents Core's existing canonical iframe; it does not clone pages or run a second layout pass.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
