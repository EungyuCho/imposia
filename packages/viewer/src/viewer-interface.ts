import { IMPOSIA_BRAND_MARK } from "./brand-mark.js";

interface ViewerInterfaceOptions {
  readonly root: HTMLElement;
  readonly label: string;
  readonly status: "loading" | "ready";
  readonly toolbarRole: "group" | "toolbar";
  readonly initialPageLabel: string;
  readonly initialZoomLabel: string;
}

interface ViewerInterfaceElements {
  readonly root: HTMLElement;
  readonly rail: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly pageIndicator: HTMLOutputElement;
  readonly zoomIndicator: HTMLOutputElement;
  readonly previous: HTMLButtonElement;
  readonly next: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly continuous: HTMLButtonElement;
  readonly single: HTMLButtonElement;
}

export interface ViewerElements extends ViewerInterfaceElements {
  readonly stage: HTMLElement;
  readonly pages: HTMLElement;
  readonly stateLabel: HTMLElement;
}

export interface PageViewerElements extends ViewerInterfaceElements {
  readonly stage: HTMLElement;
  readonly iframe: HTMLIFrameElement;
  readonly modeStatus: HTMLOutputElement;
  readonly spread: HTMLButtonElement;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, text: string): HTMLButtonElement {
  const node = element("button", "imposia-control", text);
  node.type = "button";
  node.setAttribute("aria-label", label);
  return node;
}

function createViewerInterface(options: ViewerInterfaceOptions): ViewerInterfaceElements {
  const { root } = options;
  root.tabIndex = 0;
  root.dataset.status = options.status;
  root.dataset.mode = "continuous";
  root.setAttribute("aria-label", options.label);
  const rail = element("header", "imposia-rail");
  const identity = element("div", "imposia-identity");
  identity.innerHTML = `${IMPOSIA_BRAND_MARK}<span class="imposia-wordmark">Imposia</span>`;
  const toolbar = element("div", "imposia-toolbar");
  toolbar.setAttribute("role", options.toolbarRole);
  toolbar.setAttribute("aria-label", "Document controls");
  const previous = button("Previous page", "←");
  const pageIndicator = element("output", "imposia-readout", options.initialPageLabel);
  pageIndicator.dataset.testid = "page-indicator";
  pageIndicator.setAttribute("aria-live", "polite");
  const next = button("Next page", "→");
  const zoomOut = button("Zoom out", "−");
  const zoomIndicator = element("output", "imposia-readout imposia-zoom", options.initialZoomLabel);
  zoomIndicator.dataset.testid = "zoom-indicator";
  const zoomIn = button("Zoom in", "+");
  const continuous = button("Continuous pages", "CONT");
  continuous.classList.add("imposia-mode");
  const single = button("Single page", "SINGLE");
  single.classList.add("imposia-mode");
  toolbar.append(
    previous,
    pageIndicator,
    next,
    element("span", "imposia-divider"),
    zoomOut,
    zoomIndicator,
    zoomIn,
    element("span", "imposia-divider"),
    continuous,
    single,
  );
  rail.append(identity, toolbar);
  return {
    root,
    rail,
    toolbar,
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

export function createPdfViewerInterface(container: HTMLElement): ViewerElements {
  const root = element("section", "imposia-viewer");
  const shared = createViewerInterface({
    root,
    label: "Imposia PDF viewer",
    status: "loading",
    toolbarRole: "toolbar",
    initialPageLabel: "1 / 0",
    initialZoomLabel: "100%",
  });
  const stage = element("div", "imposia-stage");
  const stateLabel = element("div", "imposia-state");
  stateLabel.setAttribute("role", "status");
  stateLabel.innerHTML =
    '<span class="imposia-spinner" aria-hidden="true"></span><span>Preparing document</span>';
  const pages = element("div", "imposia-pages");
  stage.append(stateLabel, pages);
  root.append(shared.rail, stage);
  container.replaceChildren(root);
  return {
    ...shared,
    stage,
    pages,
    stateLabel,
  };
}

export function createPageViewerInterface(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
): PageViewerElements {
  container.classList.add("imposia-viewer", "imposia-page-viewer");
  container.setAttribute("role", "region");
  const shared = createViewerInterface({
    root: container,
    label: "Imposia document viewer",
    status: "ready",
    toolbarRole: "group",
    initialPageLabel: "",
    initialZoomLabel: "",
  });
  const spread = button("Spread pages", "SPREAD");
  spread.classList.add("imposia-mode");
  const modeStatus = element("output", "imposia-visually-hidden");
  modeStatus.setAttribute("role", "status");
  modeStatus.setAttribute("aria-live", "polite");
  modeStatus.setAttribute("aria-atomic", "true");
  shared.toolbar.append(spread, modeStatus);
  iframe.classList.add("imposia-canonical-frame");
  iframe.title = "Imposia document";
  container.insertBefore(shared.rail, iframe);
  return {
    ...shared,
    stage: container,
    iframe,
    modeStatus,
    spread,
  };
}
