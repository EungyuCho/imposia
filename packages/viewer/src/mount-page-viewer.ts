import type { PageDocument } from "@imposia/core";
import type {
  PageViewerController,
  PageViewerOptions,
  PageViewerState,
  ViewerMode,
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
  iframe: HTMLIFrameElement;
  pageIndicator: HTMLOutputElement;
  zoomIndicator: HTMLOutputElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  continuous: HTMLButtonElement;
  single: HTMLButtonElement;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

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
  root.setAttribute("aria-label", "Imposia document viewer");

  const rail = document.createElement("header");
  rail.className = "imposia-rail";
  const identity = document.createElement("div");
  identity.className = "imposia-identity";
  identity.innerHTML =
    '<span class="imposia-mark">IM</span><span class="imposia-wordmark">Imposia</span>';
  const toolbar = document.createElement("div");
  toolbar.className = "imposia-toolbar";
  toolbar.setAttribute("role", "toolbar");
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
  );
  rail.append(identity, toolbar);

  iframe.classList.add("imposia-canonical-frame");
  iframe.title = "Imposia document";
  root.insertBefore(rail, iframe);
  return {
    root,
    stage: root,
    rail,
    iframe,
    pageIndicator,
    zoomIndicator,
    previous,
    next,
    zoomOut,
    zoomIn,
    continuous,
    single,
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
  const sandboxTokens = [...iframe.sandbox];
  if (
    sandboxTokens.length !== 2 ||
    !sandboxTokens.includes("allow-same-origin") ||
    !sandboxTokens.includes("allow-modals")
  ) {
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
  const scrollingElement = frameDocument.scrollingElement ?? frameDocument.documentElement;
  const width = Math.max(
    scrollingElement.scrollWidth,
    frameDocument.documentElement.scrollWidth,
    1,
  );
  const height = Math.max(
    scrollingElement.scrollHeight,
    frameDocument.documentElement.scrollHeight,
    1,
  );
  const pageTops = pages.map((page) => page.offsetTop);
  const pageHeights = pages.map((page) => page.offsetHeight);
  return { width, height, pageTops, pageHeights };
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function mountPageViewer(
  container: HTMLElement,
  pageDocument: PageDocument,
  options: PageViewerOptions = {},
): PageViewerController {
  validatePageDocument(pageDocument);
  if (pageDocument.iframe.parentElement !== container) {
    throw new Error("mountPageViewer container must be the canonical iframe's current parent.");
  }
  const rootAttributes = new Map(
    ["class", "tabindex", "data-status", "data-mode", "aria-label"].map((name) => [
      name,
      container.getAttribute(name),
    ]),
  );
  const iframeAttributes = new Map(
    ["class", "title", "style"].map((name) => [name, pageDocument.iframe.getAttribute(name)]),
  );
  const elements = createInterface(container, pageDocument.iframe);

  let destroyed = false;
  let currentDocument = pageDocument;
  let geometry = measureFrame(elements.iframe, pageDocument.pageCount);
  const mutableState: PageViewerState = {
    page: 1,
    pageCount: pageDocument.pageCount,
    zoom: Math.round(clamp(options.zoom ?? 1, MIN_ZOOM, MAX_ZOOM) * 10) / 10,
    mode: options.mode ?? "continuous",
    status: "ready",
    generation: pageDocument.generation,
  };

  function fitScale(): number {
    const availableWidth = elements.stage.clientWidth;
    if (availableWidth <= 0) return 1;
    return Math.min(1, Math.max(0.01, availableWidth / (geometry.width * mutableState.zoom)));
  }

  function presentationScale(): number {
    return mutableState.zoom * fitScale();
  }

  function syncInterface(): void {
    if (destroyed) return;
    const scale = presentationScale();
    const pageIndex = mutableState.page - 1;
    const top = geometry.pageTops[pageIndex] ?? 0;
    const pageHeight = geometry.pageHeights[pageIndex] ?? geometry.height;
    const visibleHeight = mutableState.mode === "single" ? pageHeight : geometry.height;
    elements.root.dataset.mode = mutableState.mode;
    elements.pageIndicator.textContent = `${mutableState.page} / ${mutableState.pageCount}`;
    elements.zoomIndicator.textContent = `${Math.round(mutableState.zoom * 100)}%`;
    elements.previous.disabled = mutableState.page <= 1;
    elements.next.disabled = mutableState.page >= mutableState.pageCount;
    elements.zoomOut.disabled = mutableState.zoom <= MIN_ZOOM;
    elements.zoomIn.disabled = mutableState.zoom >= MAX_ZOOM;
    elements.continuous.setAttribute("aria-pressed", String(mutableState.mode === "continuous"));
    elements.single.setAttribute("aria-pressed", String(mutableState.mode === "single"));
    elements.iframe.style.width = `${geometry.width}px`;
    elements.iframe.style.height = `${geometry.height}px`;
    elements.iframe.style.marginInlineEnd = `${geometry.width * (scale - 1)}px`;
    elements.iframe.style.marginBottom = `${visibleHeight * scale - geometry.height}px`;
    elements.iframe.style.clipPath =
      mutableState.mode === "single"
        ? `inset(${top}px 0 ${Math.max(0, geometry.height - top - pageHeight)}px)`
        : "none";
    elements.iframe.style.transform = `translateY(${-top * scale}px) scale(${scale})`;
    if (mutableState.mode === "single") {
      elements.stage.scrollTop = 0;
      elements.stage.scrollLeft = 0;
    }
  }

  function goToPage(page: number): void {
    if (destroyed || !Number.isFinite(page)) return;
    mutableState.page = clamp(Math.round(page), 1, mutableState.pageCount);
    syncInterface();
  }

  function setZoom(zoom: number): void {
    if (destroyed || !Number.isFinite(zoom)) return;
    const next = Math.round(clamp(zoom, MIN_ZOOM, MAX_ZOOM) * 10) / 10;
    if (next === mutableState.zoom) return;
    mutableState.zoom = next;
    syncInterface();
  }

  function setMode(mode: ViewerMode): void {
    if (destroyed || mode === mutableState.mode) return;
    mutableState.mode = mode;
    syncInterface();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      goToPage(mutableState.page + 1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goToPage(mutableState.page - 1);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoom(mutableState.zoom + 0.1);
    } else if (event.key === "-") {
      event.preventDefault();
      setZoom(mutableState.zoom - 0.1);
    }
  }

  const controls: Array<[HTMLButtonElement, () => void]> = [
    [elements.previous, () => goToPage(mutableState.page - 1)],
    [elements.next, () => goToPage(mutableState.page + 1)],
    [elements.zoomOut, () => setZoom(mutableState.zoom - 0.1)],
    [elements.zoomIn, () => setZoom(mutableState.zoom + 0.1)],
    [elements.continuous, () => setMode("continuous")],
    [elements.single, () => setMode("single")],
  ];
  for (const [control, action] of controls) {
    control.addEventListener("click", () => {
      control.focus();
      action();
    });
  }
  elements.root.addEventListener("keydown", onKeydown);
  elements.iframe.contentWindow?.addEventListener("keydown", onKeydown);
  const resizeObserver = new ResizeObserver(() => syncInterface());
  resizeObserver.observe(elements.stage);
  syncInterface();

  return {
    goToPage,
    nextPage() {
      goToPage(mutableState.page + 1);
    },
    previousPage() {
      goToPage(mutableState.page - 1);
    },
    setZoom,
    setMode,
    refresh(nextDocument) {
      if (destroyed) throw new Error("Page viewer has been destroyed.");
      validatePageDocument(nextDocument);
      if (nextDocument.iframe !== elements.iframe) {
        throw new Error("Cannot refresh a page viewer with a different canonical iframe.");
      }
      if (nextDocument.generation <= currentDocument.generation) {
        throw new Error("Page viewer refresh requires a newer PageDocument generation.");
      }
      currentDocument = nextDocument;
      mutableState.pageCount = nextDocument.pageCount;
      mutableState.page = clamp(mutableState.page, 1, mutableState.pageCount);
      mutableState.generation = nextDocument.generation;
      geometry = measureFrame(elements.iframe, nextDocument.pageCount);
      syncInterface();
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
      resizeObserver.disconnect();
      elements.root.removeEventListener("keydown", onKeydown);
      elements.iframe.contentWindow?.removeEventListener("keydown", onKeydown);
      elements.rail.remove();
      for (const [name, value] of rootAttributes) restoreAttribute(elements.root, name, value);
      for (const [name, value] of iframeAttributes) restoreAttribute(elements.iframe, name, value);
    },
    get state() {
      return { ...mutableState };
    },
  };
}
