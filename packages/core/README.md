# @imposia/core

`@imposia/core` is the browser ESM API for creating a sanitized, paginated page document in an isolated iframe.

## Install

```bash
pnpm add @imposia/core
```

## Use

```ts
import { mountPageDocument } from "@imposia/core";

const controller = mountPageDocument(
  document.querySelector("#preview")!,
  { html: "<article><h1>Hello</h1><p>Browser page DOM</p></article>" },
);
const pageDocument = await controller.ready;

console.log(pageDocument.pageCount, pageDocument.pages, pageDocument.warnings);
```

Core owns the canonical iframe and its lifecycle. It accepts an optional asset resolver; discovered HTML and CSS resources are admitted only through that resolver and are inserted as Core-owned blob URLs. Call `controller.destroy()` when the host is no longer needed.

Ordered extensions can transform string input, filter resolver requests, and add page decorations without receiving DOM or network access:

```ts
import { mountPageDocument, type PageExtension } from "@imposia/core";

const runningHead: PageExtension = {
  name: "example/running-head",
  decoratePage: ({ blank }) =>
    blank ? undefined : { headerHtml: "Chapter · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, { extensions: [runningHead] });
```

Extension order is fixed for the controller lifetime. All extension output passes through the same sanitizer, resolver policy, warning, abort, rollback, and cleanup boundaries as ordinary input.

Pagination is currently verified against Chromium. The public result includes canonical page metadata, warnings, asset isolation, and deterministic cleanup.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
