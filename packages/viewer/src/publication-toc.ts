import type { PublicationDestination, PublicationOutlineItem } from "@imposia/core";

let tocSequence = 0;

function nextTocId(): string {
  let id: string;
  do {
    tocSequence += 1;
    id = `imposia-publication-toc-${tocSequence}`;
  } while (document.getElementById(id) !== null);
  return id;
}

export interface PublicationToc {
  readonly opener: HTMLButtonElement;
  readonly panel: HTMLElement;
  setOutline(outline: readonly PublicationOutlineItem[]): void;
  open(): void;
  close(options?: { readonly restoreFocus?: boolean }): void;
  toggle(): void;
  destroy(): void;
  readonly openState: boolean;
}

function tocList(
  items: readonly PublicationOutlineItem[],
  select: (destination: PublicationDestination) => void,
  buttons: HTMLButtonElement[],
): HTMLOListElement {
  const list = document.createElement("ol");
  list.className = "imposia-toc-list";
  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.className = `imposia-toc-item imposia-toc-${item.kind}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "imposia-toc-link";
    button.textContent = item.title;
    button.dataset.destinationId = item.destination.id;
    button.addEventListener("click", () => select(item.destination));
    buttons.push(button);
    listItem.append(button);
    if (item.children.length > 0) listItem.append(tocList(item.children, select, buttons));
    list.append(listItem);
  }
  return list;
}

export function createPublicationToc(
  toolbar: HTMLElement,
  root: HTMLElement,
  iframe: HTMLIFrameElement,
  select: (destination: PublicationDestination) => void,
): PublicationToc {
  const id = nextTocId();
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "imposia-control imposia-toc-toggle";
  opener.textContent = "CONTENTS";
  opener.setAttribute("aria-label", "Contents");
  opener.setAttribute("aria-controls", id);
  opener.setAttribute("aria-expanded", "false");

  const panel = document.createElement("nav");
  panel.id = id;
  panel.className = "imposia-toc-panel";
  panel.setAttribute("aria-label", "Publication table of contents");
  panel.hidden = true;
  const originalTocOpen = root.getAttribute("data-toc-open");
  let buttons: HTMLButtonElement[] = [];
  let destroyed = false;

  function setOpen(open: boolean, restoreFocus = false): void {
    if (destroyed) return;
    panel.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    root.dataset.tocOpen = String(open);
    if (open) buttons[0]?.focus();
    else if (restoreFocus) opener.focus();
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

  opener.addEventListener("click", () => setOpen(panel.hidden !== false));
  panel.addEventListener("keydown", onPanelKeydown);
  toolbar.prepend(opener);
  root.insertBefore(panel, iframe);

  return {
    opener,
    panel,
    setOutline(outline) {
      const activeElement = document.activeElement;
      const focusedDestination =
        activeElement instanceof HTMLButtonElement && buttons.includes(activeElement)
          ? activeElement.dataset.destinationId
          : undefined;
      const restoreItemFocus = !panel.hidden && focusedDestination !== undefined;
      buttons = [];
      panel.replaceChildren(tocList(outline, select, buttons));
      if (restoreItemFocus) {
        (
          buttons.find((button) => button.dataset.destinationId === focusedDestination) ??
          buttons[0]
        )?.focus();
      }
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
      panel.removeEventListener("keydown", onPanelKeydown);
      opener.remove();
      panel.remove();
      if (originalTocOpen === null) delete root.dataset.tocOpen;
      else root.setAttribute("data-toc-open", originalTocOpen);
    },
    get openState() {
      return !panel.hidden;
    },
  };
}
