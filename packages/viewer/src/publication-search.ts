import type { PublicationSearchResult } from "@imposia/core";

let searchSequence = 0;

function nextSearchId(): string {
  let id: string;
  do {
    searchSequence += 1;
    id = `imposia-publication-search-${searchSequence}`;
  } while (document.getElementById(id) !== null);
  return id;
}

export interface PublicationSearch {
  readonly opener: HTMLButtonElement;
  readonly panel: HTMLElement;
  open(): void;
  close(options?: { readonly restoreFocus?: boolean }): void;
  toggle(): void;
  search(query: string): readonly PublicationSearchResult[];
  next(): PublicationSearchResult | undefined;
  previous(): PublicationSearchResult | undefined;
  select(result: PublicationSearchResult): void;
  refresh(): void;
  destroy(): void;
  readonly openState: boolean;
  readonly query: string;
  readonly results: readonly PublicationSearchResult[];
  readonly resultIndex: number | undefined;
}

function normalizedQuery(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function createPublicationSearch(
  toolbar: HTMLElement,
  root: HTMLElement,
  iframe: HTMLIFrameElement,
  run: (query: string) => readonly PublicationSearchResult[],
  navigate: (result: PublicationSearchResult) => void,
): PublicationSearch {
  const id = nextSearchId();
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "imposia-control imposia-search-toggle";
  opener.textContent = "SEARCH";
  opener.setAttribute("aria-label", "Search publication");
  opener.setAttribute("aria-controls", id);
  opener.setAttribute("aria-expanded", "false");

  const panel = document.createElement("section");
  panel.id = id;
  panel.className = "imposia-search-panel";
  panel.setAttribute("role", "search");
  panel.setAttribute("aria-label", "Publication search");
  panel.hidden = true;

  const form = document.createElement("form");
  form.className = "imposia-search-form";
  const input = document.createElement("input");
  input.type = "search";
  input.className = "imposia-search-input";
  input.setAttribute("aria-label", "Search publication text");
  input.autocomplete = "off";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "imposia-control imposia-search-submit";
  submit.textContent = "FIND";
  form.append(input, submit);

  const navigation = document.createElement("div");
  navigation.className = "imposia-search-navigation";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "imposia-control";
  previous.textContent = "←";
  previous.setAttribute("aria-label", "Previous search result");
  const next = document.createElement("button");
  next.type = "button";
  next.className = "imposia-control";
  next.textContent = "→";
  next.setAttribute("aria-label", "Next search result");
  const status = document.createElement("output");
  status.className = "imposia-search-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  navigation.append(previous, next, status);

  const list = document.createElement("ol");
  list.className = "imposia-search-results";
  panel.append(form, navigation, list);
  const originalSearchOpen = root.getAttribute("data-search-open");
  let query = "";
  let results: readonly PublicationSearchResult[] = Object.freeze([]);
  let resultIndex: number | undefined;
  let destroyed = false;

  function render(): void {
    previous.disabled = results.length === 0;
    next.disabled = results.length === 0;
    const selected = resultIndex === undefined ? undefined : results[resultIndex];
    status.textContent =
      selected === undefined || resultIndex === undefined
        ? `${results.length} ${results.length === 1 ? "result" : "results"}`
        : `Result ${resultIndex + 1} of ${results.length}, ${selected.entry.title}, page ${selected.page}`;
    list.replaceChildren(
      ...results.map((result, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "imposia-search-result";
        button.dataset.destinationId = result.destination.id;
        button.setAttribute("aria-current", String(index === resultIndex));
        const metadata = document.createElement("span");
        metadata.className = "imposia-search-result-metadata";
        metadata.textContent = `${result.entry.title} · PAGE ${result.page}`;
        const context = document.createElement("span");
        context.className = "imposia-search-result-context";
        context.textContent = result.excerpt;
        button.append(metadata, context);
        item.append(button);
        return item;
      }),
    );
  }

  function setOpen(open: boolean, restoreFocus = false): void {
    if (destroyed) return;
    panel.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    root.dataset.searchOpen = String(open);
    if (open) input.focus();
    else if (restoreFocus) opener.focus();
  }

  function search(value: string): readonly PublicationSearchResult[] {
    if (destroyed) throw new Error("Publication search has been destroyed.");
    query = normalizedQuery(value);
    input.value = query;
    results = run(query);
    resultIndex = undefined;
    render();
    return results;
  }

  function select(result: PublicationSearchResult): void {
    if (destroyed) throw new Error("Publication search has been destroyed.");
    navigate(result);
    const selected = results.findIndex(
      (candidate) =>
        candidate.destination.id === result.destination.id &&
        candidate.destination.generation === result.destination.generation,
    );
    resultIndex = selected < 0 ? undefined : selected;
    render();
  }

  function step(direction: -1 | 1): PublicationSearchResult | undefined {
    if (destroyed) throw new Error("Publication search has been destroyed.");
    if (results.length === 0) return undefined;
    const nextIndex =
      resultIndex === undefined
        ? direction === 1
          ? 0
          : results.length - 1
        : (resultIndex + direction + results.length) % results.length;
    const result = results[nextIndex];
    if (result === undefined) return undefined;
    select(result);
    return result;
  }

  function onSubmit(event: SubmitEvent): void {
    event.preventDefault();
    search(input.value);
  }

  function onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false, true);
  }

  function onOpenerClick(): void {
    setOpen(panel.hidden !== false);
  }

  function onResultClick(event: MouseEvent): void {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null;
    const destinationId = target?.dataset.destinationId;
    if (destinationId === undefined) return;
    const result = results.find((candidate) => candidate.destination.id === destinationId);
    if (result === undefined) return;
    select(result);
    setOpen(false);
  }

  function onPreviousClick(): void {
    step(-1);
    previous.focus();
  }

  function onNextClick(): void {
    step(1);
    next.focus();
  }

  opener.addEventListener("click", onOpenerClick);
  form.addEventListener("submit", onSubmit);
  panel.addEventListener("keydown", onPanelKeydown);
  list.addEventListener("click", onResultClick);
  previous.addEventListener("click", onPreviousClick);
  next.addEventListener("click", onNextClick);
  toolbar.prepend(opener);
  root.insertBefore(panel, iframe);
  render();

  return {
    opener,
    panel,
    open() {
      setOpen(true);
    },
    close(options) {
      setOpen(false, options?.restoreFocus);
    },
    toggle() {
      const opening = panel.hidden !== false;
      setOpen(opening, !opening);
    },
    search,
    next() {
      return step(1);
    },
    previous() {
      return step(-1);
    },
    select,
    refresh() {
      search(query);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      query = "";
      input.value = "";
      results = Object.freeze([]);
      resultIndex = undefined;
      panel.hidden = true;
      opener.removeEventListener("click", onOpenerClick);
      form.removeEventListener("submit", onSubmit);
      panel.removeEventListener("keydown", onPanelKeydown);
      list.removeEventListener("click", onResultClick);
      previous.removeEventListener("click", onPreviousClick);
      next.removeEventListener("click", onNextClick);
      panel.replaceChildren();
      opener.remove();
      panel.remove();
      if (originalSearchOpen === null) delete root.dataset.searchOpen;
      else root.setAttribute("data-search-open", originalSearchOpen);
    },
    get openState() {
      return !panel.hidden;
    },
    get query() {
      return query;
    },
    get results() {
      return results;
    },
    get resultIndex() {
      return resultIndex;
    },
  };
}
