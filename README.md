<p align="right">
  <strong>English</strong> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <br/>
  <img src="./docs/images/imposia-logo.png" width="520" alt="Imposia">
  <br/>
</p>

<p align="center">
  <strong>HTML in. Pages out.</strong>
  <br/>
  <sub>The browser-native publishing toolkit for paginated HTML/CSS, React preview, native print, and reflowable EPUB.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-browser%20ESM-4338ca" alt="Browser ESM">
  <img src="https://img.shields.io/badge/React-%3E%3D18-149eca?logo=react&logoColor=white" alt="React 18 or newer">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-6d28d9" alt="Apache-2.0 license"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#why-imposia">Why</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#packages">Packages</a> ·
  <a href="#publishing-contract">Compatibility</a> ·
  <a href="#interactive-demo">Demo</a>
</p>

**Turn HTML and CSS into a paginated, inspectable browser document without
shipping a second rendering runtime.**

Imposia is a React-first, browser-only publishing toolkit. It sanitizes source,
resolves admitted assets, prepares pages in a temporary noncanonical staging
iframe, then commits them into one persistent canonical iframe for preview and
native print. The same committed semantic source
can be exported as a reflowable EPUB 3.3 `Blob`.

Core works without React. There is no Node runtime, command-line renderer,
server export, fixed-layout EPUB, PDF-byte API, or promise of complete CSS
fragmentation parity.

<p align="center">
  <img src="./docs/images/imposia-readme-hero.png" width="100%" alt="A browser document passing through Imposia and becoming paginated pages and an open book">
</p>

---

## Why Imposia?

Browser publishing tends to drift when every surface owns a different document.
The editor measures one tree, preview clones another, and print reconstructs a
third. Small differences become different page counts, broken references, and
hard-to-reproduce output.

Imposia keeps one page document at the center of the workflow:

| Publishing problem | What usually happens | Imposia's contract |
| :--- | :--- | :--- |
| Preview and print diverge | Each surface reruns layout | One canonical iframe survives pagination, presentation, and native print |
| Authored URLs fetch implicitly | Rendering gains an uncontrolled network path | Every admitted HTML/CSS asset crosses the host `assetResolver` boundary |
| Unsupported layout looks "close enough" | Silent approximation hides broken output | Constrained and unsupported cases remain atomic or emit typed warnings |
| React owns a second renderer | Component and framework-neutral behavior drift | React retains the same Core controller and iframe |
| Export needs a server pipeline | Browser-only apps hand content to another runtime | The current semantic source exports a bounded reflowable EPUB `Blob` |

---

## Quick Start

Install the React adapter:

```bash
pnpm add @imposia/react react react-dom
```

Mount a page document, then target the committed document for print or EPUB:

```tsx
import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
} from "@imposia/react";
import { useRef } from "react";
import "@imposia/react/styles.css";

export function BookPreview() {
  const viewer = useRef<ImposiaPageViewerHandle>(null);

  return (
    <>
      <ImposiaPageViewer
        ref={viewer}
        source={{
          html: "<article><h1>Hello</h1><p>Browser-native pages.</p></article>",
        }}
        documentOptions={{ page: { size: "A4", margin: "18mm" } }}
        viewerOptions={{ mode: "spread", spread: { cover: true } }}
      />

      <button type="button" onClick={() => viewer.current?.setMode("single")}>
        Single page
      </button>

      <button type="button" onClick={() => void viewer.current?.print()}>
        Print
      </button>

      <button
        type="button"
        onClick={() =>
          void viewer.current?.exportEpub({
            metadata: {
              title: "Hello",
              language: "en",
              identifier: "urn:example:hello",
            },
          })
        }
      >
        Export EPUB
      </button>
    </>
  );
}
```

The imperative handle always targets the current committed Core generation. It
does not create a second controller, iframe, layout pass, or asset-fetch path.
`documentOptions` configure the controller at mount time. When those options
change (for example, a new extension set or resolver), increment
`documentOptionsRevision` to replace the controller with a newly configured
canonical iframe. `source` updates and `sourceRevision` continue to reuse the
existing iframe.

### Use Core without React

```bash
pnpm add @imposia/core
```

```ts
import { mountPageDocument } from "@imposia/core";

const controller = mountPageDocument(
  document.querySelector<HTMLElement>("#preview")!,
  {
    html: "<article><h1>Hello</h1><p>One canonical page DOM.</p></article>",
  },
  {
    page: { size: "A4", orientation: "portrait", margin: "18mm" },
  },
);

const pageDocument = await controller.ready;

console.log({
  pageCount: pageDocument.pageCount,
  pages: pageDocument.pages,
  warnings: pageDocument.warnings,
  timings: pageDocument.timings,
});
```

---

## How It Works

Imposia separates source processing from presentation while keeping one document
as the source of truth.

```text
 HTML / CSS source
        │
        ├── discover assets ──► host assetResolver ──► Core-owned Blob URLs
        │
        ▼
 sanitize + normalize page media
        │
        ▼
 paginate in one temporary noncanonical staging iframe
        │
        ▼
 atomically commit into the persistent canonical iframe
        │
        ├──► immutable page metadata + warnings + timings
        ├──► continuous / single-page / spread presentation
        └──► native browser print

 latest committed semantic source ──► bounded reflowable EPUB 3.3 Blob
```

| Stage | What happens |
| :--- | :--- |
| **Resolve** | Imposia discovers HTML and CSS resources and asks the host for admitted bytes. Authored URLs never become frame requests. |
| **Sanitize** | Markup, CSS, resolver output, and extension output stay inside Core's CSP, limits, and warning boundaries. |
| **Paginate** | Page geometry, supported `@page` rules, fragmentation, references, and publishing content resolve in a temporary staging iframe. |
| **Present** | Viewer and React surfaces retain the canonical iframe instead of cloning pages or running layout again. |
| **Publish** | Native print targets that iframe; EPUB export projects the latest committed semantic source into a bounded archive. |

The previous committed generation stays visible in the canonical iframe while
its replacement is prepared in a temporary, noncanonical staging iframe.
Successful source revisions swap atomically and remove that staging frame;
failed, aborted, or superseded revisions leave the prior commit untouched.

---

## Packages

Four browser ESM packages expose the same publishing system at different
integration layers:

| Package | Role | Choose it when… |
| :--- | :--- | :--- |
| [`@imposia/react`](./packages/react) | Primary React adapter | Your application uses React 18+ and needs components, hooks, or an imperative page handle |
| [`@imposia/client`](./packages/client) | Unified framework-neutral entrypoint | You want Core and Viewer APIs from one browser-only dependency |
| [`@imposia/core`](./packages/core) | Canonical page-document runtime | You want direct lifecycle, pagination, resolver, extension, print, and EPUB control without React |
| [`@imposia/viewer`](./packages/viewer) | Page and PDF presentation | You need to present the Core iframe or mount an independent PDF.js canvas viewer |

The package split changes integration ergonomics, not document ownership. Core
remains the single source of truth.

---

## Ordered Publications and Reader navigation

Use `ImposiaPublicationViewer` when several semantic sources must share one
reading order, page sequence, outline, and EPUB spine:

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
  const viewer = useRef<ImposiaPublicationViewerHandle>(null);

  return (
    <ImposiaPublicationViewer
      ref={viewer}
      snapshot={snapshot}
      viewerOptions={{ mode: "spread", spread: { cover: true }, inspector: true }}
    />
  );
}
```

The built-in Reader projects the committed outline as a table of contents and
adds semantic search and bounded page thumbnails. The React handle exposes the
same current-controller paths through `navigate()`, `search()`,
`selectSearchResult()`, `getThumbnails()`, and `selectThumbnail()`. Inspector,
Contents, Search, and Page thumbnails are mutually exclusive, keyboard-operable
panels outside the canonical iframe.

Search results and thumbnails belong to one controller and committed
generation. Resolve or query again after replacement; retained stale values are
rejected. Reader UI never reparses authored input, rasterizes a page, adds an
iframe, or runs pagination again.

---

## The Canonical Page Document

`PageDocument` is more than a rendered preview. It is the committed publishing
state for one generation:

- normalized sheet and content geometry;
- immutable page metadata, page sides, named context, and blank markers;
- ordered body text, decorations, warnings, and timings;
- the isolated canonical iframe used for presentation and print;
- a bounded reflowable EPUB export method.

### Page media and publishing CSS

Stable page-media support includes A4, Letter, custom absolute dimensions,
portrait and landscape orientation, host margins, supported authored `@page`
selectors, and six margin boxes:

```css
@page {
  size: A4;
  margin: 18mm;

  @top-left {
    content: string(chapter);
  }

  @bottom-center {
    content: counter(page) " / " counter(pages);
  }
}

h1 {
  string-set: chapter content();
}
```

Unsupported authored declarations produce diagnostics instead of being silently
presented as equivalent browser output.

### Resolver-only assets

The host `assetResolver` is the only admitted resource boundary. Core turns
approved bytes into owned Blob URLs and revokes them on replacement, failure, or
destroy. Input markup cannot cause the isolated frame to fetch authored URLs
directly.

### Ordered extensions

Extensions can transform string input, filter resolver requests, and add page
decorations. They run in declaration order without DOM or network access and
cannot replace the resolver, weaken CSP or limits, or bypass lifecycle rollback.

```ts
import { mountPageDocument, type PageExtension } from "@imposia/core";

const lastPageFooter: PageExtension = {
  name: "example/last-page-footer",
  decoratePage: ({ blank, number, totalPages }) =>
    blank || number !== totalPages
      ? undefined
      : { footerHtml: "The End · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, {
  extensions: [lastPageFooter],
});
```

Publication extensions transform each sanitized copied entry independently,
before Core adds protected composition markers:

```ts
import { mountPublication, type PublicationExtension } from "@imposia/core";

const entryPolicy: PublicationExtension = {
  name: "example/entry-policy",
  transformEntry(input, context) {
    if (input.entry.id === "appendix") {
      context.warn({
        code: "EXTENSION_APPENDIX_POLICY",
        message: "The appendix policy was applied.",
      });
    }
    return { html: `${input.html}<p>${input.publication.title}</p>` };
  },
};

const publication = mountPublication(host, snapshot, {
  extensions: [entryPolicy],
});
```

Both extension forms receive frozen values only. Output is re-limited and
re-sanitized, failures preserve the committed generation, and abort,
supersession, or destroy aborts `context.signal` and runs cleanup registered with
`context.onCleanup()`.

---

## Publishing Contract

Imposia names its boundaries explicitly. A smaller, testable subset is more
useful than an unqualified promise of browser-to-print parity.

| Status | Included behavior |
| :--- | :--- |
| **Stable** | Browser ESM APIs, canonical iframe lifecycle, resolver isolation, page geometry, supported `@page` selectors and margin boxes, breaks, native print, and reflowable EPUB export |
| **Constrained** | Row-boundary tables, column/no-wrap flex, one-column non-spanning grid, bounded multi-column layout, local target references, and named strings |
| **Experimental** | Opt-in page-local footnotes and top/bottom page floats with explicit defer and fallback warnings |
| **Unsupported** | Node or CLI rendering, server export, fixed-layout EPUB, PDF bytes, arbitrary CSS fragmentation, and exact cross-browser page-count parity |

Chromium is the structural pagination reference. Firefox and WebKit exercise the
public API, isolation, resolver boundary, lifecycle, cleanup, native print
invocation, and EPUB archive behavior. Metrics and line breaking may differ.

Read the authoritative [compatibility matrix](./docs/compatibility.md) before
depending on a constrained or experimental publishing feature.

---

## Reflowable EPUB

`PageDocument.exportEpub()` returns an `application/epub+zip` browser `Blob` from
the latest committed semantic source:

```ts
const epub = await pageDocument.exportEpub({
  metadata: {
    title: "The Browser Book",
    language: "en",
    identifier: "urn:example:browser-book",
  },
  limits: {
    maxEntries: 512,
    maxBytes: 16 * 1024 * 1024,
  },
});
```

Export admits retained resolver assets and enforces metadata, entry, byte,
abort, and lifecycle limits. It omits page wrappers, margin furniture, generated
page counters, Blob URLs, and page-only experimental artifacts.

This is semantic reflowable EPUB 3.3, not a fixed-layout snapshot of the page
preview. For PDF, call `print()` and use the browser's Save as PDF surface.

---

## Viewer Themes

Viewer themes are consumer-owned CSS modules or per-instance runtime token maps.
Load the package stylesheet first, then override public variables on an
individual `.imposia-viewer` instance:

```ts
import "@imposia/react/styles.css";
import "./viewer-theme.css";
```

```css
.imposia-viewer {
  --imposia-viewer-color-ink: #171522;
  --imposia-viewer-color-paper: #fff8e8;
  --imposia-viewer-color-accent: #4338ca;
  --imposia-viewer-font-serif: "Iowan Old Style", Georgia, serif;
}
```

For user-selectable themes, pass the same tokens without a global stylesheet:

```ts
const viewer = mountPageViewer(host, pageDocument, {
  theme: {
    "--imposia-viewer-color-ink": "#171522",
    "--imposia-viewer-color-accent": "#8b6cff",
  },
});

viewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
```

Themes change presentation without adding another React or Core lifecycle. See
the [`@imposia/viewer` theme contract](./packages/viewer/README.md#theme-modules)
for the complete public token surface.

---

## Independent PDF Viewer

`@imposia/viewer` also includes a continuous and single-page PDF.js canvas
viewer. This is a separate presentation API, not a PDF export path for Core:

```ts
import { mountViewer } from "@imposia/viewer";
import "@imposia/viewer/styles.css";

const viewer = mountViewer(
  document.querySelector<HTMLElement>("#viewer")!,
  "/book.pdf",
  { workerSrc: "/pdf.worker.min.mjs" },
);

viewer.setMode("single");
viewer.setZoom(1.2);
viewer.nextPage();
```

Use `mountPageViewer()` when presenting a Core page document. It retains the
exact iframe created by that document's controller.

---

## Interactive Demo

The React publishing lab under [`examples/demo`](./examples/demo) demonstrates
live source revisions, normalized page media, margin boxes, ordered extensions,
constrained publishing cases, Viewer controls, native print, and EPUB export.

```bash
corepack pnpm install --frozen-lockfile
pnpm build
node scripts/serve-viewer.mjs
```

Open `http://127.0.0.1:4178/examples/demo/`.

---

## Development and Verification

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm check
```

`pnpm check` runs preflight validation, type checking, lint, unit tests, package
builds, browser E2E suites, production vulnerability auditing, and the
dependency-license audit. The full gate and
captured artifact map live in [`docs/verification.md`](./docs/verification.md).

Product contracts and architecture decisions are routed from
[`docs/routing.md`](./docs/routing.md). The compatibility matrix is the source of
truth when examples and implementation details differ.

## Contributing and releases

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing a change, especially
the clean-room and browser-observability requirements. Maintainers can follow
[RELEASING.md](./RELEASING.md) for the checked package order and the final
registry prerequisites. Versioned public changes are recorded in
[CHANGELOG.md](./CHANGELOG.md). Report vulnerabilities through the private route
described in [SECURITY.md](./SECURITY.md), and follow the project
[Code of Conduct](./CODE_OF_CONDUCT.md) in all community spaces.

---

<p align="center">
  <em>Write for the web. Keep one document all the way to paper.</em>
  <br/><br/>
  <strong>Imposia</strong>
  <br/><br/>
  <a href="./LICENSE"><code>Apache-2.0</code></a>
</p>
