import { IMPOSIA_BRAND_MARK } from "./brand-mark.js";

export interface ViewerElements {
  root: HTMLElement;
  stage: HTMLElement;
  pages: HTMLElement;
  stateLabel: HTMLElement;
  pageIndicator: HTMLElement;
  zoomIndicator: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  continuous: HTMLButtonElement;
  single: HTMLButtonElement;
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

export function createInterface(container: HTMLElement): ViewerElements {
  const root = element("section", "imposia-viewer");
  root.tabIndex = 0;
  root.dataset.status = "loading";
  root.dataset.mode = "continuous";
  root.setAttribute("aria-label", "Imposia PDF viewer");
  const rail = element("header", "imposia-rail");
  const identity = element("div", "imposia-identity");
  identity.innerHTML = `${IMPOSIA_BRAND_MARK}<span class="imposia-wordmark">Imposia</span>`;
  const toolbar = element("div", "imposia-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Document controls");
  const previous = button("Previous page", "←");
  const pageIndicator = element("output", "imposia-readout", "1 / 0");
  pageIndicator.dataset.testid = "page-indicator";
  pageIndicator.setAttribute("aria-live", "polite");
  const next = button("Next page", "→");
  const zoomOut = button("Zoom out", "−");
  const zoomIndicator = element("output", "imposia-readout imposia-zoom", "100%");
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
  const stage = element("div", "imposia-stage");
  const stateLabel = element("div", "imposia-state");
  stateLabel.setAttribute("role", "status");
  stateLabel.innerHTML =
    '<span class="imposia-spinner" aria-hidden="true"></span><span>Preparing document</span>';
  const pages = element("div", "imposia-pages");
  stage.append(stateLabel, pages);
  root.append(rail, stage);
  container.replaceChildren(root);
  return {
    root,
    stage,
    pages,
    stateLabel,
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
