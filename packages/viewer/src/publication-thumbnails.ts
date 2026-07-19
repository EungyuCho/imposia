import type { PageDocument } from "@imposia/core";
import type { PublicationThumbnail } from "./viewer-types.js";

const MAX_PREVIEW_LINES = 6;
let thumbnailSequence = 0;

function nextThumbnailId(): string {
  let id: string;
  do {
    thumbnailSequence += 1;
    id = `imposia-publication-thumbnails-${thumbnailSequence}`;
  } while (document.getElementById(id) !== null);
  return id;
}

function thumbnailsFor(pageDocument: PageDocument): readonly PublicationThumbnail[] {
  return Object.freeze(
    pageDocument.pages.map((page) =>
      Object.freeze({
        page: page.number,
        generation: pageDocument.generation,
        widthCssPx: page.widthCssPx,
        heightCssPx: page.heightCssPx,
        previewLineCount: Math.min(
          MAX_PREVIEW_LINES,
          page.bodyText.filter((line) => line.trim() !== "").length,
        ),
      }),
    ),
  );
}

export interface PublicationThumbnails {
  readonly opener: HTMLButtonElement;
  readonly panel: HTMLElement;
  setDocument(pageDocument: PageDocument): void;
  setCurrentPage(page: number): void;
  open(): void;
  close(options?: { readonly restoreFocus?: boolean }): void;
  toggle(): void;
  destroy(): void;
  readonly openState: boolean;
  readonly thumbnails: readonly PublicationThumbnail[];
}

export function createPublicationThumbnails(
  toolbar: HTMLElement,
  root: HTMLElement,
  iframe: HTMLIFrameElement,
  pageDocument: PageDocument,
  select: (thumbnail: PublicationThumbnail) => void,
): PublicationThumbnails {
  const id = nextThumbnailId();
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "imposia-control imposia-thumbnail-toggle";
  opener.textContent = "PAGES";
  opener.setAttribute("aria-label", "Page thumbnails");
  opener.setAttribute("aria-controls", id);
  opener.setAttribute("aria-expanded", "false");

  const panel = document.createElement("nav");
  panel.id = id;
  panel.className = "imposia-thumbnail-panel";
  panel.setAttribute("aria-label", "Publication page thumbnails");
  panel.hidden = true;
  const list = document.createElement("ol");
  list.className = "imposia-thumbnail-list";
  panel.append(list);
  const originalThumbnailsOpen = root.getAttribute("data-thumbnails-open");
  let thumbnails = thumbnailsFor(pageDocument);
  let buttons: HTMLButtonElement[] = [];
  let currentPage = 1;
  let destroyed = false;

  function currentButton(): HTMLButtonElement | undefined {
    return buttons.find((button) => Number(button.dataset.page) === currentPage) ?? buttons[0];
  }

  function renderCurrent(): void {
    for (const button of buttons) {
      const current = Number(button.dataset.page) === currentPage;
      if (current) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  }

  function render(): void {
    buttons = thumbnails.map((thumbnail) => {
      const item = document.createElement("li");
      item.className = "imposia-thumbnail-item";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "imposia-thumbnail-button";
      button.dataset.page = String(thumbnail.page);
      button.dataset.generation = String(thumbnail.generation);
      button.setAttribute("aria-label", `Go to page ${thumbnail.page}`);
      const preview = document.createElement("span");
      preview.className = "imposia-thumbnail-preview";
      preview.setAttribute("aria-hidden", "true");
      preview.style.aspectRatio = `${thumbnail.widthCssPx} / ${thumbnail.heightCssPx}`;
      for (let index = 0; index < thumbnail.previewLineCount; index += 1) {
        const line = document.createElement("span");
        line.className = "imposia-thumbnail-preview-line";
        line.style.width = `${88 - ((thumbnail.page + index * 7) % 5) * 9}%`;
        preview.append(line);
      }
      const label = document.createElement("span");
      label.className = "imposia-thumbnail-label";
      label.textContent = `PAGE ${thumbnail.page}`;
      button.append(preview, label);
      item.append(button);
      list.append(item);
      return button;
    });
    renderCurrent();
  }

  function setOpen(open: boolean, restoreFocus = false): void {
    if (destroyed) return;
    panel.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    root.dataset.thumbnailsOpen = String(open);
    if (open) {
      const button = currentButton();
      button?.focus();
      button?.scrollIntoView({ block: "nearest" });
    } else if (restoreFocus) {
      opener.focus();
    }
  }

  function onOpenerClick(): void {
    setOpen(panel.hidden !== false);
  }

  function onListClick(event: MouseEvent): void {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null;
    const page = Number(target?.dataset.page);
    const generation = Number(target?.dataset.generation);
    const thumbnail = thumbnails.find(
      (candidate) => candidate.page === page && candidate.generation === generation,
    );
    if (thumbnail === undefined) return;
    select(thumbnail);
    setOpen(false);
  }

  function onPanelKeydown(event: KeyboardEvent): void {
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false, true);
      return;
    }
    const nextIndex =
      event.key === "ArrowDown"
        ? Math.min(buttons.length - 1, Math.max(0, index + 1))
        : event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : undefined;
    if (nextIndex !== undefined && buttons[nextIndex] !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      buttons[nextIndex]?.focus();
    }
  }

  opener.addEventListener("click", onOpenerClick);
  list.addEventListener("click", onListClick);
  panel.addEventListener("keydown", onPanelKeydown);
  toolbar.prepend(opener);
  root.insertBefore(panel, iframe);
  render();

  return {
    opener,
    panel,
    setDocument(nextDocument) {
      thumbnails = thumbnailsFor(nextDocument);
      currentPage = Math.min(Math.max(currentPage, 1), thumbnails.length);
      list.replaceChildren();
      render();
      if (!panel.hidden) currentButton()?.focus();
    },
    setCurrentPage(page) {
      currentPage = Math.min(Math.max(Math.round(page), 1), thumbnails.length);
      renderCurrent();
    },
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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      thumbnails = Object.freeze([]);
      buttons = [];
      opener.removeEventListener("click", onOpenerClick);
      list.removeEventListener("click", onListClick);
      panel.removeEventListener("keydown", onPanelKeydown);
      list.replaceChildren();
      panel.replaceChildren();
      opener.remove();
      panel.remove();
      if (originalThumbnailsOpen === null) delete root.dataset.thumbnailsOpen;
      else root.setAttribute("data-thumbnails-open", originalThumbnailsOpen);
    },
    get openState() {
      return !panel.hidden;
    },
    get thumbnails() {
      return thumbnails;
    },
  };
}
