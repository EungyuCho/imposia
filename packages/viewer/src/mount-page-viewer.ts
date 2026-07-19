import { hasPageDocumentFrameSandbox, type PageDocument } from "@imposia/core";
import { mountPublicationReader, validatePublicationReaderDocument } from "./publication-reader.js";
import { createViewerInspector } from "./viewer-inspector.js";
import { bindViewerTheme, validateViewerTheme } from "./viewer-theme.js";
import type {
  PageViewerController,
  PageViewerMode,
  PageViewerOptions,
  PageViewerState,
} from "./viewer-types.js";

interface FrameGeometry {
  width: number;
  height: number;
  pageTops: readonly number[];
  pageHeights: readonly number[];
}

interface PageViewerElements {
  root: HTMLElement;
  stage: HTMLElement;
  rail: HTMLElement;
  toolbar: HTMLElement;
  iframe: HTMLIFrameElement;
  pageIndicator: HTMLOutputElement;
  zoomIndicator: HTMLOutputElement;
  modeStatus: HTMLOutputElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  continuous: HTMLButtonElement;
  single: HTMLButtonElement;
  spread: HTMLButtonElement;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const MIN_SPREAD_WIDTH = 720;
const FRAME_PRESENTATION_ATTRIBUTE = "data-imposia-viewer-presentation";
const FRAME_COVER_ATTRIBUTE = "data-imposia-viewer-cover";
const AUXILIARY_PANEL_SELECTOR =
  ".imposia-toc-panel, .imposia-search-panel, .imposia-thumbnail-panel, .imposia-inspector-panel";
const FRAME_PRESENTATION_STYLE = `@media screen {
  html[${FRAME_PRESENTATION_ATTRIBUTE}="spread"] body[data-imposia-pages] {
    display: grid !important;
    grid-template-columns: max-content max-content !important;
    grid-auto-flow: row !important;
    align-items: start !important;
  }
  html[${FRAME_PRESENTATION_ATTRIBUTE}="spread"][${FRAME_COVER_ATTRIBUTE}="true"] body[data-imposia-pages]::before {
    content: "" !important;
    display: block !important;
    visibility: hidden !important;
    grid-column: 1 !important;
    grid-row: 1 !important;
    width: var(--imposia-viewer-cover-width) !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
  }
  html[${FRAME_PRESENTATION_ATTRIBUTE}="spread"][${FRAME_COVER_ATTRIBUTE}="true"] body[data-imposia-pages] > [data-imposia-page]:first-child {
    grid-column: 2 !important;
    grid-row: 1 !important;
  }
}`;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function button(label: string, text: string, className = "imposia-control"): HTMLButtonElement {
  const node = document.createElement("button");
  node.className = className;
  node.type = "button";
  node.textContent = text;
  node.setAttribute("aria-label", label);
  return node;
}

function createInterface(container: HTMLElement, iframe: HTMLIFrameElement): PageViewerElements {
  const root = container;
  root.classList.add("imposia-viewer", "imposia-page-viewer");
  root.tabIndex = 0;
  root.dataset.status = "ready";
  root.dataset.mode = "continuous";
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Imposia document viewer");

  const rail = document.createElement("header");
  rail.className = "imposia-rail";
  const identity = document.createElement("div");
  identity.className = "imposia-identity";
  identity.innerHTML =
    '<span class="imposia-mark">IM</span><span class="imposia-wordmark">Imposia</span>';
  const toolbar = document.createElement("div");
  toolbar.className = "imposia-toolbar";
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", "Document controls");

  const previous = button("Previous page", "←");
  const pageIndicator = document.createElement("output");
  pageIndicator.className = "imposia-readout";
  pageIndicator.dataset.testid = "page-indicator";
  pageIndicator.setAttribute("aria-live", "polite");
  const next = button("Next page", "→");
  const zoomOut = button("Zoom out", "−");
  const zoomIndicator = document.createElement("output");
  zoomIndicator.className = "imposia-readout imposia-zoom";
  zoomIndicator.dataset.testid = "zoom-indicator";
  const zoomIn = button("Zoom in", "+");
  const continuous = button("Continuous pages", "CONT", "imposia-control imposia-mode");
  const single = button("Single page", "SINGLE", "imposia-control imposia-mode");
  const spread = button("Spread pages", "SPREAD", "imposia-control imposia-mode");
  const modeStatus = document.createElement("output");
  modeStatus.className = "imposia-visually-hidden";
  modeStatus.setAttribute("role", "status");
  modeStatus.setAttribute("aria-live", "polite");
  modeStatus.setAttribute("aria-atomic", "true");
  const divider = () => {
    const node = document.createElement("span");
    node.className = "imposia-divider";
    return node;
  };
  toolbar.append(
    previous,
    pageIndicator,
    next,
    divider(),
    zoomOut,
    zoomIndicator,
    zoomIn,
    divider(),
    continuous,
    single,
    spread,
    modeStatus,
  );
  rail.append(identity, toolbar);

  iframe.classList.add("imposia-canonical-frame");
  iframe.title = "Imposia document";
  root.insertBefore(rail, iframe);
  return {
    root,
    stage: root,
    rail,
    toolbar,
    iframe,
    pageIndicator,
    zoomIndicator,
    modeStatus,
    previous,
    next,
    zoomOut,
    zoomIn,
    continuous,
    single,
    spread,
  };
}

function invalidPageDocument(message: string): never {
  throw new Error(`Invalid PageDocument: ${message}`);
}

function validatePageDocument(pageDocument: PageDocument): void {
  const { iframe } = pageDocument;
  if (!(iframe instanceof HTMLIFrameElement)) invalidPageDocument("iframe is missing.");
  if (iframe.getAttribute("data-imposia-frame") !== "page-document") {
    invalidPageDocument("iframe is not a canonical page-document frame.");
  }
  if (!hasPageDocumentFrameSandbox(iframe)) {
    invalidPageDocument("iframe sandbox must allow same-origin and modals only.");
  }
  const frameDocument = iframe.contentDocument;
  if (frameDocument === null) invalidPageDocument("iframe content document is unavailable.");
  if (pageDocument.pageCount < 1 || pageDocument.pages.length !== pageDocument.pageCount) {
    invalidPageDocument("page metadata does not match pageCount.");
  }
  if (frameDocument.querySelectorAll("[data-imposia-page]").length !== pageDocument.pageCount) {
    invalidPageDocument("canonical page markers do not match pageCount.");
  }
}

function measureFrame(iframe: HTMLIFrameElement, pageCount: number): FrameGeometry {
  const frameDocument = iframe.contentDocument;
  if (frameDocument === null) invalidPageDocument("iframe content document is unavailable.");
  const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
  if (pages.length !== pageCount)
    invalidPageDocument("canonical page markers do not match pageCount.");
  const bodyStyle = getComputedStyle(frameDocument.body);
  const paddingRight = Number.parseFloat(bodyStyle.paddingRight) || 0;
  const paddingBottom = Number.parseFloat(bodyStyle.paddingBottom) || 0;
  const pageTops = pages.map((page) => page.offsetTop);
  const pageHeights = pages.map((page) => page.offsetHeight);
  const width = Math.max(
    ...pages.map((page) => page.offsetLeft + page.offsetWidth + paddingRight),
    1,
  );
  const height = Math.max(
    ...pages.map((page) => page.offsetTop + page.offsetHeight + paddingBottom),
    1,
  );
  return { width, height, pageTops, pageHeights };
}

function spreadPages(page: number, pageCount: number, cover: boolean): readonly [number, number] {
  if (cover && page === 1) return [1, 1];
  const start = cover ? 2 + Math.floor((page - 2) / 2) * 2 : 1 + Math.floor((page - 1) / 2) * 2;
  return [start, Math.min(start + 1, pageCount)];
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function validatePageViewerOptions(
  pageDocument: PageDocument,
  options: PageViewerOptions = {},
): void {
  validateViewerTheme(options.theme);
  validatePageDocument(pageDocument);
  if (options.reader !== undefined) {
    validatePublicationReaderDocument(pageDocument, options.reader);
  }
}

export function mountPageViewer(
  container: HTMLElement,
  pageDocument: PageDocument,
  options: PageViewerOptions = {},
): PageViewerController {
  validatePageViewerOptions(pageDocument, options);
  if (pageDocument.iframe.parentElement !== container) {
    throw new Error("mountPageViewer container must be the canonical iframe's current parent.");
  }
  const rootAttributes = new Map(
    [
      "class",
      "tabindex",
      "data-status",
      "data-mode",
      "data-effective-mode",
      "role",
      "aria-label",
    ].map((name) => [name, container.getAttribute(name)]),
  );
  const iframeAttributes = new Map(
    ["class", "title", "style"].map((name) => [name, pageDocument.iframe.getAttribute(name)]),
  );
  const elements = createInterface(container, pageDocument.iframe);
  const theme = bindViewerTheme(elements.root, options.theme);

  let destroyed = false;
  let currentDocument = pageDocument;
  let geometry = measureFrame(elements.iframe, pageDocument.pageCount);
  let spreadCover = options.spread?.cover ?? false;
  const mutableState: PageViewerState = {
    page: 1,
    pageCount: pageDocument.pageCount,
    zoom: Math.round(clamp(options.zoom ?? 1, MIN_ZOOM, MAX_ZOOM) * 10) / 10,
    mode: options.mode ?? "continuous",
    effectiveMode: options.mode ?? "continuous",
    status: "ready",
    generation: pageDocument.generation,
  };
  let announcedMode = "";
  let inspectorPresentationKey = "";

  const frameDocument = elements.iframe.contentDocument;
  if (frameDocument === null) invalidPageDocument("iframe content document is unavailable.");
  const frameRootAttributes = new Map(
    [FRAME_PRESENTATION_ATTRIBUTE, FRAME_COVER_ATTRIBUTE].map((name) => [
      name,
      frameDocument.documentElement.getAttribute(name),
    ]),
  );
  const originalCoverWidth = frameDocument.body.style.getPropertyValue(
    "--imposia-viewer-cover-width",
  );

  function applyFramePresentation(mode: PageViewerMode): void {
    const document = elements.iframe.contentDocument;
    if (document === null) invalidPageDocument("iframe content document is unavailable.");
    let style = document.head.querySelector<HTMLStyleElement>("style[data-imposia-viewer-style]");
    if (style === null) {
      style = document.createElement("style");
      style.dataset.imposiaViewerStyle = "";
      style.textContent = FRAME_PRESENTATION_STYLE;
      document.head.append(style);
    }
    const firstPage = document.querySelector<HTMLElement>("[data-imposia-page]");
    document.body.style.setProperty(
      "--imposia-viewer-cover-width",
      `${firstPage?.offsetWidth ?? 0}px`,
    );
    document.documentElement.setAttribute(FRAME_PRESENTATION_ATTRIBUTE, mode);
    document.documentElement.setAttribute(FRAME_COVER_ATTRIBUTE, String(spreadCover));
  }

  function fitScale(): number {
    const availableWidth = elements.stage.clientWidth;
    if (availableWidth <= 0) return 1;
    return Math.min(1, Math.max(0.01, availableWidth / (geometry.width * mutableState.zoom)));
  }

  function presentationScale(): number {
    return mutableState.zoom * fitScale();
  }

  function syncInterface(revealModeControl = false): void {
    if (destroyed) return;
    mutableState.effectiveMode =
      mutableState.mode === "spread" && elements.stage.clientWidth < MIN_SPREAD_WIDTH
        ? "single"
        : mutableState.mode;
    applyFramePresentation(mutableState.effectiveMode);
    geometry = measureFrame(elements.iframe, mutableState.pageCount);
    const scale = presentationScale();
    const range =
      mutableState.effectiveMode === "spread"
        ? spreadPages(mutableState.page, mutableState.pageCount, spreadCover)
        : ([mutableState.page, mutableState.page] as const);
    const visibleIndexes = Array.from(
      { length: range[1] - range[0] + 1 },
      (_, index) => range[0] - 1 + index,
    );
    const top = Math.min(...visibleIndexes.map((index) => geometry.pageTops[index] ?? 0));
    const bottom = Math.max(
      ...visibleIndexes.map(
        (index) => (geometry.pageTops[index] ?? 0) + (geometry.pageHeights[index] ?? 0),
      ),
    );
    const visibleHeight =
      mutableState.effectiveMode === "continuous" ? geometry.height : bottom - top;
    const presentationTop = mutableState.effectiveMode === "continuous" ? 0 : top;
    const previousTarget =
      mutableState.effectiveMode === "spread" ? Math.max(1, range[0] - 1) : mutableState.page - 1;
    const nextTarget =
      mutableState.effectiveMode === "spread" ? range[1] + 1 : mutableState.page + 1;
    elements.root.dataset.mode = mutableState.mode;
    elements.root.dataset.effectiveMode = mutableState.effectiveMode;
    elements.pageIndicator.textContent =
      mutableState.effectiveMode === "spread" && range[0] !== range[1]
        ? `${range[0]}–${range[1]} / ${mutableState.pageCount}`
        : `${mutableState.page} / ${mutableState.pageCount}`;
    elements.zoomIndicator.textContent = `${Math.round(mutableState.zoom * 100)}%`;
    elements.previous.disabled = previousTarget < 1 || range[0] <= 1;
    elements.next.disabled = nextTarget > mutableState.pageCount;
    elements.zoomOut.disabled = mutableState.zoom <= MIN_ZOOM;
    elements.zoomIn.disabled = mutableState.zoom >= MAX_ZOOM;
    elements.continuous.setAttribute("aria-pressed", String(mutableState.mode === "continuous"));
    elements.single.setAttribute("aria-pressed", String(mutableState.mode === "single"));
    elements.spread.setAttribute("aria-pressed", String(mutableState.mode === "spread"));
    elements.spread.setAttribute(
      "aria-label",
      mutableState.mode === "spread" && mutableState.effectiveMode === "single"
        ? "Spread pages (showing single page at this width)"
        : "Spread pages",
    );
    const modeAnnouncement =
      mutableState.mode === "spread" && mutableState.effectiveMode === "single"
        ? "Spread view is unavailable at this width. Showing one page."
        : mutableState.effectiveMode === "spread"
          ? "Spread view."
          : mutableState.effectiveMode === "single"
            ? "Single-page view."
            : "Continuous view.";
    if (modeAnnouncement !== announcedMode) {
      announcedMode = modeAnnouncement;
      elements.modeStatus.textContent = modeAnnouncement;
    }
    elements.iframe.style.width = `${geometry.width}px`;
    elements.iframe.style.height = `${geometry.height}px`;
    elements.iframe.style.marginInlineEnd = `${geometry.width * (scale - 1)}px`;
    elements.iframe.style.marginBottom = `${visibleHeight * scale - geometry.height}px`;
    elements.iframe.style.clipPath =
      mutableState.effectiveMode !== "continuous"
        ? `inset(${top}px 0 ${Math.max(0, geometry.height - bottom)}px)`
        : "none";
    elements.iframe.style.transform = `translateY(${-presentationTop * scale}px) scale(${scale})`;
    if (mutableState.effectiveMode !== "continuous") {
      elements.stage.scrollTop = 0;
      elements.stage.scrollLeft = 0;
    }
    if (revealModeControl) {
      const activeMode =
        mutableState.mode === "spread"
          ? elements.spread
          : mutableState.mode === "single"
            ? elements.single
            : elements.continuous;
      const activeLeft = activeMode.offsetLeft;
      const activeRight = activeLeft + activeMode.offsetWidth;
      if (activeLeft < elements.toolbar.scrollLeft) {
        elements.toolbar.scrollLeft = activeLeft;
      } else if (activeRight > elements.toolbar.scrollLeft + elements.toolbar.clientWidth) {
        elements.toolbar.scrollLeft = activeRight - elements.toolbar.clientWidth;
      }
    }
    reader?.syncPage(mutableState.page);
    const nextInspectorPresentationKey = [
      mutableState.generation,
      mutableState.page,
      mutableState.zoom,
      mutableState.mode,
      mutableState.effectiveMode,
      spreadCover,
      elements.stage.clientWidth,
      elements.stage.clientHeight,
    ].join(":");
    if (nextInspectorPresentationKey !== inspectorPresentationKey) {
      inspectorPresentationKey = nextInspectorPresentationKey;
      inspector?.syncPresentation();
    }
  }

  function adjacentPage(direction: -1 | 1): number {
    if (mutableState.effectiveMode !== "spread") return mutableState.page + direction;
    const range = spreadPages(mutableState.page, mutableState.pageCount, spreadCover);
    return direction === 1 ? range[1] + 1 : range[0] - 1;
  }

  function goToPage(page: number): void {
    if (destroyed || !Number.isFinite(page)) return;
    mutableState.page = clamp(Math.round(page), 1, mutableState.pageCount);
    syncInterface();
    if (mutableState.effectiveMode === "continuous") {
      const rootBounds = elements.root.getBoundingClientRect();
      const iframeBounds = elements.iframe.getBoundingClientRect();
      const scale = elements.iframe.clientHeight <= 0 ? 1 : iframeBounds.height / geometry.height;
      const pageTop = geometry.pageTops[mutableState.page - 1] ?? 0;
      const rootScrollTop = Math.max(
        0,
        iframeBounds.top -
          rootBounds.top +
          elements.root.scrollTop +
          pageTop * scale -
          elements.rail.offsetHeight,
      );
      if (elements.root.scrollHeight > elements.root.clientHeight) {
        elements.root.scrollTop = rootScrollTop;
      } else {
        window.scrollTo({
          top: Math.max(
            0,
            window.scrollY + iframeBounds.top + pageTop * scale - elements.rail.offsetHeight,
          ),
        });
      }
    }
  }

  function setZoom(zoom: number): void {
    if (destroyed || !Number.isFinite(zoom)) return;
    const next = Math.round(clamp(zoom, MIN_ZOOM, MAX_ZOOM) * 10) / 10;
    if (next === mutableState.zoom) return;
    mutableState.zoom = next;
    syncInterface();
  }

  function setMode(mode: PageViewerMode): void {
    if (destroyed || mode === mutableState.mode) return;
    mutableState.mode = mode;
    syncInterface(true);
  }

  function setSpreadCover(cover: boolean): void {
    if (destroyed || cover === spreadCover) return;
    spreadCover = cover;
    syncInterface();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest(AUXILIARY_PANEL_SELECTOR) !== null
    ) {
      return;
    }
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      goToPage(adjacentPage(1));
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goToPage(adjacentPage(-1));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoom(mutableState.zoom + 0.1);
    } else if (event.key === "-") {
      event.preventDefault();
      setZoom(mutableState.zoom - 0.1);
    }
  }

  const controls: Array<[HTMLButtonElement, () => void]> = [
    [elements.previous, () => goToPage(adjacentPage(-1))],
    [elements.next, () => goToPage(adjacentPage(1))],
    [elements.zoomOut, () => setZoom(mutableState.zoom - 0.1)],
    [elements.zoomIn, () => setZoom(mutableState.zoom + 0.1)],
    [elements.continuous, () => setMode("continuous")],
    [elements.single, () => setMode("single")],
    [elements.spread, () => setMode("spread")],
  ];
  let inspector: ReturnType<typeof createViewerInspector> | undefined;
  let reader: ReturnType<typeof mountPublicationReader> | undefined;
  try {
    inspector =
      options.inspector === true
        ? createViewerInspector(
            elements.toolbar,
            elements.root,
            elements.iframe,
            pageDocument,
            goToPage,
          )
        : undefined;
    reader =
      options.reader === undefined
        ? undefined
        : mountPublicationReader(
            elements.root,
            elements.toolbar,
            elements.iframe,
            pageDocument,
            options.reader,
            goToPage,
            inspector,
          );
  } catch (error: unknown) {
    inspector?.destroy();
    theme.destroy();
    elements.rail.remove();
    for (const [name, value] of rootAttributes) restoreAttribute(elements.root, name, value);
    for (const [name, value] of iframeAttributes) restoreAttribute(elements.iframe, name, value);
    throw error;
  }
  for (const [control, action] of controls) {
    control.addEventListener("click", () => {
      control.focus();
      action();
    });
  }
  elements.root.addEventListener("keydown", onKeydown);
  elements.iframe.contentWindow?.addEventListener("keydown", onKeydown);
  let resizeFrame: number | undefined;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== undefined) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined;
      if (destroyed || !elements.iframe.isConnected || elements.iframe.contentDocument === null)
        return;
      syncInterface(true);
    });
  });
  resizeObserver.observe(elements.stage);
  syncInterface(true);

  return {
    goToPage,
    nextPage() {
      goToPage(adjacentPage(1));
    },
    previousPage() {
      goToPage(adjacentPage(-1));
    },
    setZoom,
    setMode,
    setSpreadCover,
    setTheme(nextTheme) {
      if (destroyed) return;
      theme.set(nextTheme);
    },
    refresh(nextDocument) {
      if (destroyed) throw new Error("Page viewer has been destroyed.");
      validatePageDocument(nextDocument);
      if (nextDocument.iframe !== elements.iframe) {
        throw new Error("Cannot refresh a page viewer with a different canonical iframe.");
      }
      if (nextDocument.generation <= currentDocument.generation) {
        throw new Error("Page viewer refresh requires a newer PageDocument generation.");
      }
      if (options.reader !== undefined) {
        validatePublicationReaderDocument(nextDocument, options.reader);
      }
      currentDocument = nextDocument;
      mutableState.pageCount = nextDocument.pageCount;
      mutableState.page = clamp(mutableState.page, 1, mutableState.pageCount);
      mutableState.generation = nextDocument.generation;
      try {
        inspector?.setDocument(nextDocument);
        reader?.refresh(nextDocument);
      } finally {
        syncInterface();
      }
    },
    async print() {
      if (destroyed) throw new Error("Page viewer has been destroyed.");
      const printable = currentDocument.iframe.contentWindow;
      if (printable === null) throw new Error("Canonical page iframe is unavailable for printing.");
      printable.print();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      reader?.destroy();
      inspector?.destroy();
      theme.destroy();
      resizeObserver.disconnect();
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      elements.root.removeEventListener("keydown", onKeydown);
      elements.iframe.contentWindow?.removeEventListener("keydown", onKeydown);
      elements.rail.remove();
      const document = elements.iframe.contentDocument;
      document?.head.querySelector("style[data-imposia-viewer-style]")?.remove();
      if (document !== null && document !== undefined) {
        for (const [name, value] of frameRootAttributes) {
          restoreAttribute(document.documentElement, name, value);
        }
        if (originalCoverWidth === "") {
          document.body.style.removeProperty("--imposia-viewer-cover-width");
        } else {
          document.body.style.setProperty("--imposia-viewer-cover-width", originalCoverWidth);
        }
      }
      for (const [name, value] of rootAttributes) restoreAttribute(elements.root, name, value);
      for (const [name, value] of iframeAttributes) restoreAttribute(elements.iframe, name, value);
    },
    get state() {
      return { ...mutableState };
    },
    reader,
    inspector,
  };
}
