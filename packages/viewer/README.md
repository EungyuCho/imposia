# @imposia/viewer

`@imposia/viewer` is a browser ESM viewer for PDF documents and for Core's
canonical page document. It presents an existing document; it is not a renderer
or a PDF-byte exporter.

## Install

```bash
pnpm add @imposia/viewer
```

## View a PDF

```ts
import { mountViewer } from "@imposia/viewer";
import "@imposia/viewer/styles.css";

const viewer = mountViewer(document.querySelector<HTMLElement>("#viewer")!, "/book.pdf", {
  workerSrc: "/pdf.worker.min.mjs",
});

viewer.setZoom(1.2);
viewer.setMode("single");
```

`mountViewer()` uses PDF.js and supports continuous and single-page modes in
Chromium, Firefox, and WebKit.

## Theme modules

The Viewer shell is themed through the public `--imposia-viewer-*` custom
properties declared by `@imposia/viewer/styles.css`. A theme is an ordinary CSS
module loaded after the package stylesheet, so it can be published or composed
like a plugin without adding a second runtime lifecycle:

```css
/* viewer-theme.css */
.imposia-viewer {
  --imposia-viewer-color-ink: #171522;
  --imposia-viewer-color-ink-soft: #28233b;
  --imposia-viewer-color-paper: #fff8e8;
  --imposia-viewer-color-accent: #8b6cff;
  --imposia-viewer-font-serif: "Iowan Old Style", Georgia, serif;
  --imposia-viewer-control-size: 40px;
}
```

```ts
import "@imposia/viewer/styles.css";
import "./viewer-theme.css";
```

For instance-specific or user-selectable themes, pass the same custom properties
through the typed `theme` option and replace them at runtime with `setTheme()`:

```ts
import { mountPageViewer, type ViewerTheme } from "@imposia/viewer";

const dusk = {
  "--imposia-viewer-color-ink": "#171522",
  "--imposia-viewer-color-paper": "#fff8e8",
  "--imposia-viewer-color-accent": "#8b6cff",
  "--imposia-viewer-control-size": "40px",
} satisfies ViewerTheme;

const viewer = mountPageViewer(host, pageDocument, { theme: dusk });
viewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
viewer.setTheme(); // Restore the host's pre-viewer token values.
```

Runtime theme entries must be string-valued `--imposia-viewer-*` properties.
Each Viewer records and restores the host values it replaces, and a rejected
theme leaves the currently applied theme intact.

Scope the overrides to a parent selector when different viewer instances need
different themes. The tokens cover the shell palette, spacing, typography,
controls, borders, and shadows. They do not cross Core's iframe isolation or
change the authored document CSS; pass document styles through Core's `css`
input instead.

## Present a Core page document

```ts
import { mountPageViewer } from "@imposia/viewer";

const pageViewer = mountPageViewer(host, pageDocument, {
  mode: "spread",
  spread: { cover: true },
});
pageViewer.setMode("single");
pageViewer.setMode("spread");
await pageViewer.print();
```

`mountPageViewer()` retains Core's exact canonical iframe. Its `host` must be the
iframe's current parent, and it is currently a Chromium-reference presentation
surface. `print()` invokes that iframe's native `Window.print()`; the browser may
offer Save as PDF, but this package does not produce PDF bytes. For reflowable
EPUB export, call `pageDocument.exportEpub()` through Core, Client, or React.

The page Viewer supports `continuous`, `single`, and `spread` modes. Set
`spread.cover` to keep page 1 alone before the 2–3, 4–5, and later pairs. A
spread requested in a container narrower than 720 px presents the current page
as a readable single page; `state.mode` remains `spread` and
`state.effectiveMode` reports `single` until the container widens. Mode changes,
cover pairing, and the responsive fallback reuse the existing page elements and
global page numbers. They do not paginate again, replace the canonical iframe,
or change native print order.
Next, Previous, Arrow, and Page keys move by one visible spread while spread
presentation is active; `goToPage()` still targets an exact global page. The
control group remains ordinarily tabbable, and a live status announces the
requested view and any responsive single-page fallback.

### Headless presentation

Set `controls: false` when the host application owns the header and controls:

```ts
const pageViewer = mountPageViewer(host, pageDocument, {
  controls: false,
  mode: "single",
});

const unsubscribe = pageViewer.subscribe((state) => {
  pageOutput.value = `${state.page} / ${state.pageCount}`;
  zoomOutput.value = `${Math.round(state.zoom * 100)}%`;
});

previousButton.addEventListener("click", () => pageViewer.previousPage());
nextButton.addEventListener("click", () => pageViewer.nextPage());
spreadButton.addEventListener("click", () => pageViewer.setMode("spread"));
zoomInButton.addEventListener("click", () =>
  pageViewer.setZoom(pageViewer.state.zoom + 0.1),
);
```

`subscribe()` immediately receives the current immutable state snapshot and
then receives page, page-count, zoom, mode, effective-mode, or generation
changes. Its return value removes the listener. Headless presentation retains
the canonical iframe and all presentation behavior but adds no brand rail or
built-in controls.

Viewer CSS applies only inside `.imposia-viewer`. It does not set styles on
`body`, `:root`, or unrelated elements. The host owns the Viewer's dimensions,
background, and surrounding scroll container; the Viewer fills the host's
height instead of claiming the viewport.

## Inspect the current generation

Enable the Inspector only in authoring or preview surfaces that need to explain
Core warnings:

```ts
const viewer = mountPageViewer(host, pageDocument, { inspector: true });

viewer.inspector?.open();
const firstWarning = viewer.inspector?.state.warnings[0];
if (firstWarning !== undefined) viewer.inspector?.select(firstWarning);
```

`validatePageViewerOptions(pageDocument, options)` checks the PageDocument,
theme, and optional Reader ownership without changing Viewer state. Adapters use
it before a structural option change so invalid input cannot tear down a working
Viewer.

The Inspector lists the warning code, message, documented recovery when Core
provides one, committed generation, and the available entry and global page.
Selecting a located warning calls the existing page Viewer navigation path and
adds a temporary screen-only outline to the affected authored fragment or page.
In continuous mode that path also scrolls the selected page into view. A
Publication warning with only an entry location navigates to that entry's first
committed page; a global warning without a page or entry remains informational.
The outline does not change geometry and is suppressed by print media. The panel
remains outside the canonical iframe, and EPUB export continues to use Core's
semantic source.

`refresh()` replaces the list with warnings from the newer committed generation
and clears the previous selection and outline. `destroy()` removes the panel,
listeners, timer, and presentation style. Zoom, mode, spread-cover, and resize
synchronization clear an active outline before presentation geometry changes. A
warning retained from an older generation is rejected by `select()`. After the
Viewer is destroyed, retained Inspector `open()`, `close()`, `toggle()`, and
`select()` calls throw `Viewer inspector has been destroyed.`, while `state`
reports a closed, empty Inspector. When Inspector is omitted or false, Viewer
adds no Inspector controls, panel, or highlight overlay and keeps the same page,
geometry, canonical print target, and EPUB result as `inspector: false`.

## Read a Publication

Pass the Core Publication controller to add a table of contents and deep links
without adding another iframe or layout pass:

```ts
import { mountPageViewer, serializePublicationDeepLink } from "@imposia/viewer";

const publication = await publicationController.ready;
const viewer = mountPageViewer(host, publication, {
  reader: {
    controller: publicationController,
    initialDeepLink: location.hash.slice(1),
    onDeepLinkChange: (value) =>
      history.replaceState(
        null,
        "",
        value === undefined ? `${location.pathname}${location.search}` : `#${value}`,
      ),
  },
});

const chapter = publication.outline[1]?.destination;
if (chapter !== undefined) {
  viewer.reader?.navigate(chapter);
  console.log(serializePublicationDeepLink(chapter));
}

const matches = viewer.reader?.search("chapter text") ?? [];
if (matches[0] !== undefined) viewer.reader?.selectSearchResult(matches[0]);

const thumbnails = viewer.reader?.state.thumbnails ?? [];
if (thumbnails[4] !== undefined) viewer.reader?.selectThumbnail(thumbnails[4]);
```

The Reader renders `PublicationDocument.outline` directly. It never reparses
authored content. Entry and heading nesting are preserved, and keyboard users
can open Contents, move with Arrow keys, jump with Home or End, close with
Escape, and return to the canonical document after selection.

Deep links store a stable destination ID. `restorePublicationDeepLink()` and
`viewer.reader.restoreDeepLink()` resolve that ID through the current
`PublicationController`, so a saved link can survive a newer generation. A
destination object from an older generation remains stale and is rejected by
Core; resolve it again or restore its deep link before moving.
If an update removes the selected destination, `onDeepLinkChange(undefined)`
signals that the saved URL state should be cleared.

The Reader's Search control queries only the current committed Publication's
sanitized visible text. Results contain entry metadata, a global page, a
plain-text context excerpt, and a current-generation destination. Use
`search()`, `previousSearchResult()`, `nextSearchResult()`, and
`selectSearchResult()` for custom controls; all result movement follows the same
Reader navigation path and canonical iframe as the table of contents. When the
PageViewer receives a newer committed document, it rebuilds the current query
against that snapshot and removes stale result objects. `openSearch()`,
`closeSearch()`, and `toggleSearch()` control the built-in accessible panel.

The Reader's Page thumbnails control creates one immutable model for every
committed global page. Each model contains the commit `generation`, page number,
sheet geometry, and at most six abstract text-line marks derived from retained
`PageMetadata`; it does not clone authored DOM, rasterize pages, or paginate
again. Use `openThumbnails()`, `closeThumbnails()`, `toggleThumbnails()`, and
`selectThumbnail()` for custom controls. A newer commit replaces the entire
model list and rejects retained older models. Selection targets the exact global
page, clears an existing deep link, closes the Reader panels, and focuses the
canonical iframe.

Contents, Search, Page thumbnails, and Diagnostics are mutually exclusive. An
opening panel closes the other three whether it is opened from the toolbar or a
public controller.

After `PageViewer.destroy()`, Reader state is cleared, every panel is closed,
and every Reader action throws `Publication reader has been destroyed.`

See the [compatibility matrix](../../docs/compatibility.md) for browser support,
constrained fragmentation, and the explicit fixed-layout/complete-parity limits.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
