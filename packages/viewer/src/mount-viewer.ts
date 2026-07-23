import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import { createPdfViewerInterface, element } from "./viewer-interface.js";
import { loadingSource } from "./viewer-source.js";
import { bindViewerTheme, validateViewerTheme } from "./viewer-theme.js";
import type {
  ViewerController,
  ViewerMode,
  ViewerOptions,
  ViewerSource,
  ViewerState,
} from "./viewer-types.js";

export type {
  ViewerController,
  ViewerMode,
  ViewerOptions,
  ViewerSource,
  ViewerState,
} from "./viewer-types.js";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function mountViewer(
  container: HTMLElement,
  source: ViewerSource,
  options: ViewerOptions = {},
): ViewerController {
  validateViewerTheme(options.theme);
  if (options.workerSrc !== undefined) GlobalWorkerOptions.workerSrc = options.workerSrc;
  const elements = createPdfViewerInterface(container);
  const theme = bindViewerTheme(elements.root, options.theme);
  let documentProxy: PDFDocumentProxy | undefined;
  let loadingTask: PDFDocumentLoadingTask | undefined;
  let destroyed = false;
  let renderVersion = 0;
  const activeRenderTasks = new Set<RenderTask>();
  const mutableState: ViewerState = {
    page: 1,
    pageCount: 0,
    zoom: clamp(options.zoom ?? 1, 0.5, 2.5),
    mode: options.mode ?? "continuous",
    status: "loading",
  };

  function syncInterface(): void {
    elements.root.dataset.status = mutableState.status;
    elements.root.dataset.mode = mutableState.mode;
    elements.pageIndicator.textContent = `${mutableState.page} / ${mutableState.pageCount}`;
    elements.zoomIndicator.textContent = `${Math.round(mutableState.zoom * 100)}%`;
    const inactive = mutableState.status !== "ready";
    elements.previous.disabled = inactive || mutableState.page <= 1;
    elements.next.disabled = inactive || mutableState.page >= mutableState.pageCount;
    elements.zoomOut.disabled = inactive || mutableState.zoom <= 0.5;
    elements.zoomIn.disabled = inactive || mutableState.zoom >= 2.5;
    elements.continuous.disabled = inactive;
    elements.single.disabled = inactive;
    elements.continuous.setAttribute("aria-pressed", String(mutableState.mode === "continuous"));
    elements.single.setAttribute("aria-pressed", String(mutableState.mode === "single"));
  }

  function setError(error: unknown): void {
    if (destroyed) return;
    const detail = error instanceof Error ? error.message : String(error);
    mutableState.status = "error";
    mutableState.error = detail;
    elements.stateLabel.setAttribute("role", "alert");
    elements.stateLabel.className = "imposia-state imposia-error";
    elements.stateLabel.innerHTML =
      '<span class="imposia-error-code">LOAD / 01</span><strong>Unable to open this PDF</strong><span>Check the file and try again.</span>';
    elements.stateLabel.hidden = false;
    syncInterface();
  }

  function cancelRenders(): void {
    renderVersion += 1;
    for (const task of activeRenderTasks) task.cancel();
    activeRenderTasks.clear();
  }

  async function renderPage(pageNumber: number, version: number): Promise<HTMLElement | undefined> {
    if (documentProxy === undefined) return undefined;
    const pdfPage = await documentProxy.getPage(pageNumber);
    if (destroyed || version !== renderVersion) {
      pdfPage.cleanup();
      return undefined;
    }
    const viewport = pdfPage.getViewport({ scale: mutableState.zoom });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const wrapper = element("article", "imposia-page");
    wrapper.dataset.pageNumber = String(pageNumber);
    wrapper.setAttribute("aria-label", `Page ${pageNumber} of ${mutableState.pageCount}`);
    const canvas = element("canvas", "imposia-canvas");
    canvas.width = Math.ceil(viewport.width * pixelRatio);
    canvas.height = Math.ceil(viewport.height * pixelRatio);
    canvas.style.width = `${viewport.width}px`;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Rendered PDF page ${pageNumber}`);
    const context = canvas.getContext("2d", { alpha: false });
    if (context === null) throw new Error("Canvas 2D context is unavailable.");
    const task = pdfPage.render({
      canvas,
      canvasContext: context,
      viewport,
      ...(pixelRatio === 1 ? {} : { transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] }),
    });
    activeRenderTasks.add(task);
    try {
      await task.promise;
    } finally {
      activeRenderTasks.delete(task);
      pdfPage.cleanup();
    }
    if (destroyed || version !== renderVersion) return undefined;
    wrapper.append(
      canvas,
      element("span", "imposia-page-tag", String(pageNumber).padStart(2, "0")),
    );
    return wrapper;
  }

  async function renderVisiblePages(): Promise<void> {
    if (documentProxy === undefined || destroyed) return;
    cancelRenders();
    const version = renderVersion;
    elements.pages.replaceChildren();
    elements.pages.setAttribute("aria-busy", "true");
    const firstPage = Math.max(1, mutableState.page - 2);
    const lastPage = Math.min(mutableState.pageCount, mutableState.page + 2);
    const pageNumbers =
      mutableState.mode === "single"
        ? [mutableState.page]
        : Array.from({ length: lastPage - firstPage + 1 }, (_value, index) => firstPage + index);
    try {
      for (const pageNumber of pageNumbers) {
        const page = await renderPage(pageNumber, version);
        if (page === undefined || destroyed || version !== renderVersion) return;
        elements.pages.append(page);
      }
      elements.pages.setAttribute("aria-busy", "false");
    } catch (error) {
      if (!destroyed && version === renderVersion) setError(error);
    }
  }

  async function renderAndReveal(page: number): Promise<void> {
    await renderVisiblePages();
    if (destroyed || mutableState.page !== page) return;
    elements.pages
      .querySelector<HTMLElement>(`[data-page-number="${page}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goToPage(page: number): void {
    if (mutableState.status !== "ready" || mutableState.pageCount === 0) return;
    mutableState.page = clamp(Math.round(page), 1, mutableState.pageCount);
    syncInterface();
    if (mutableState.mode === "single") {
      elements.stage.scrollTop = 0;
      elements.stage.scrollLeft = 0;
      void renderVisiblePages();
      return;
    }
    const target = elements.pages.querySelector<HTMLElement>(
      `[data-page-number="${mutableState.page}"]`,
    );
    if (target === null) void renderAndReveal(mutableState.page);
    else target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setZoom(zoom: number): void {
    if (mutableState.status !== "ready" || !Number.isFinite(zoom)) return;
    const nextZoom = Math.round(clamp(zoom, 0.5, 2.5) * 10) / 10;
    if (nextZoom === mutableState.zoom) return;
    mutableState.zoom = nextZoom;
    syncInterface();
    void renderVisiblePages();
  }

  function setMode(mode: ViewerMode): void {
    if (mutableState.status !== "ready" || mode === mutableState.mode) return;
    mutableState.mode = mode;
    elements.stage.scrollTop = 0;
    elements.stage.scrollLeft = 0;
    syncInterface();
    void renderVisiblePages();
  }

  function bindControl(control: HTMLButtonElement, action: () => void): void {
    control.addEventListener("click", () => {
      control.focus();
      action();
    });
  }

  bindControl(elements.previous, () => goToPage(mutableState.page - 1));
  bindControl(elements.next, () => goToPage(mutableState.page + 1));
  bindControl(elements.zoomOut, () => setZoom(mutableState.zoom - 0.1));
  bindControl(elements.zoomIn, () => setZoom(mutableState.zoom + 0.1));
  bindControl(elements.continuous, () => setMode("continuous"));
  bindControl(elements.single, () => setMode("single"));
  elements.root.addEventListener("keydown", (event) => {
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
  });

  syncInterface();
  loadingTask = getDocument(loadingSource(source));
  void loadingTask.promise
    .then(async (loadedDocument) => {
      if (destroyed) {
        await loadedDocument.destroy();
        return;
      }
      documentProxy = loadedDocument;
      mutableState.pageCount = loadedDocument.numPages;
      mutableState.page = clamp(mutableState.page, 1, loadedDocument.numPages);
      await renderVisiblePages();
      if (destroyed || mutableState.status === "error") return;
      mutableState.status = "ready";
      elements.stateLabel.hidden = true;
      syncInterface();
    })
    .catch(setError);

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
    setTheme(nextTheme) {
      if (destroyed) return;
      theme.set(nextTheme);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      theme.destroy();
      cancelRenders();
      void loadingTask?.destroy();
      void documentProxy?.destroy();
      container.replaceChildren();
    },
    get state() {
      return { ...mutableState };
    },
  };
}
