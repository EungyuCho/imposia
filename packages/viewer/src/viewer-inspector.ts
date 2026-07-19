import {
  type PageDocument,
  type PageWarning,
  type PublicationDocument,
  pageWarningTargetBounds,
} from "@imposia/core";
import type { ViewerInspectorController } from "./viewer-types.js";

const HIGHLIGHT_DURATION_MS = 3_000;
let inspectorSequence = 0;

function nextInspectorId(): string {
  let id: string;
  do {
    inspectorSequence += 1;
    id = `imposia-viewer-inspector-${inspectorSequence}`;
  } while (document.getElementById(id) !== null);
  return id;
}

function warningMetadata(warning: PageWarning): string {
  const parts = [`GENERATION ${warning.location.generation ?? "UNKNOWN"}`];
  if (warning.location.entryId !== undefined) parts.push(`ENTRY ${warning.location.entryId}`);
  if (warning.location.page !== undefined) parts.push(`PAGE ${warning.location.page}`);
  if (warning.location.entryId === undefined && warning.location.page === undefined) {
    parts.push("GLOBAL");
  }
  return parts.join(" · ");
}

export interface MountedViewerInspector extends ViewerInspectorController {
  readonly opener: HTMLButtonElement;
  readonly panel: HTMLElement;
  setDocument(pageDocument: PageDocument): void;
  setOnOpen(callback: (() => void) | undefined): void;
  syncPresentation(): void;
  close(options?: { readonly restoreFocus?: boolean }): void;
  destroy(): void;
  readonly openState: boolean;
}

export function createViewerInspector(
  toolbar: HTMLElement,
  root: HTMLElement,
  iframe: HTMLIFrameElement,
  pageDocument: PageDocument,
  goToPage: (page: number) => void,
): MountedViewerInspector {
  const id = nextInspectorId();
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "imposia-control imposia-inspector-toggle";
  opener.textContent = "ISSUES";
  opener.setAttribute("aria-label", "Diagnostics");
  opener.setAttribute("aria-controls", id);
  opener.setAttribute("aria-expanded", "false");

  const panel = document.createElement("section");
  panel.id = id;
  panel.className = "imposia-inspector-panel";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Document diagnostics");
  panel.tabIndex = -1;
  panel.hidden = true;
  const heading = document.createElement("h2");
  heading.className = "imposia-inspector-heading";
  heading.textContent = "CURRENT DIAGNOSTICS";
  const list = document.createElement("ol");
  list.className = "imposia-inspector-list";
  panel.append(heading, list);
  const highlightOverlay = document.createElement("div");
  highlightOverlay.className = "imposia-inspector-highlight";
  highlightOverlay.setAttribute("aria-hidden", "true");
  highlightOverlay.hidden = true;

  const originalInspectorOpen = root.getAttribute("data-inspector-open");
  let currentDocument = pageDocument;
  let warnings = pageDocument.warnings;
  let selected: PageWarning | undefined;
  let buttons: HTMLButtonElement[] = [];
  let highlightTimer: number | undefined;
  let destroyed = false;
  let onOpen: (() => void) | undefined;

  function assertActive(): void {
    if (destroyed) throw new Error("Viewer inspector has been destroyed.");
  }

  function clearHighlight(): void {
    if (highlightTimer !== undefined) {
      window.clearTimeout(highlightTimer);
      highlightTimer = undefined;
    }
    highlightOverlay.hidden = true;
    highlightOverlay.style.removeProperty("left");
    highlightOverlay.style.removeProperty("top");
    highlightOverlay.style.removeProperty("width");
    highlightOverlay.style.removeProperty("height");
    delete highlightOverlay.dataset.page;
  }

  function warningPage(warning: PageWarning): number | undefined {
    if (warning.location.page !== undefined) return warning.location.page;
    const entryId = warning.location.entryId;
    if (entryId === undefined || !("entries" in currentDocument)) return undefined;
    return (currentDocument as PublicationDocument).entries.find((entry) => entry.id === entryId)
      ?.pageRange.start;
  }

  function warningTarget(
    warning: PageWarning,
    page: number,
  ): Readonly<{ left: number; top: number; width: number; height: number }> | undefined {
    const frameDocument = iframe.contentDocument;
    if (frameDocument === null) return undefined;
    const sourceBounds = pageWarningTargetBounds(currentDocument, warning);
    if (sourceBounds !== undefined) return sourceBounds;
    const pageElement = frameDocument.querySelector<HTMLElement>(
      `[data-imposia-page-number="${page}"]`,
    );
    if (pageElement === null) return undefined;
    return pageElement.getBoundingClientRect();
  }

  function highlight(warning: PageWarning, page: number): void {
    clearHighlight();
    const target = warningTarget(warning, page);
    if (target === undefined) return;
    const rootBounds = root.getBoundingClientRect();
    const iframeBounds = iframe.getBoundingClientRect();
    const targetBounds = target;
    const scaleX = iframe.clientWidth <= 0 ? 1 : iframeBounds.width / iframe.clientWidth;
    const scaleY = iframe.clientHeight <= 0 ? 1 : iframeBounds.height / iframe.clientHeight;
    highlightOverlay.style.left = `${iframeBounds.left - rootBounds.left + root.scrollLeft + targetBounds.left * scaleX}px`;
    highlightOverlay.style.top = `${iframeBounds.top - rootBounds.top + root.scrollTop + targetBounds.top * scaleY}px`;
    highlightOverlay.style.width = `${targetBounds.width * scaleX}px`;
    highlightOverlay.style.height = `${targetBounds.height * scaleY}px`;
    highlightOverlay.dataset.page = String(page);
    highlightOverlay.hidden = false;
    highlightTimer = window.setTimeout(clearHighlight, HIGHLIGHT_DURATION_MS);
  }

  function render(): void {
    list.replaceChildren();
    buttons = [];
    if (warnings.length === 0) {
      const empty = document.createElement("li");
      empty.className = "imposia-inspector-empty";
      empty.textContent = `No warnings for generation ${currentDocument.generation}.`;
      list.append(empty);
      return;
    }
    for (const [index, warning] of warnings.entries()) {
      const item = document.createElement("li");
      item.className = "imposia-inspector-item";
      const page = warningPage(warning);
      const finding = document.createElement(page === undefined ? "div" : "button");
      finding.className = "imposia-inspector-finding";
      if (finding instanceof HTMLButtonElement) {
        finding.type = "button";
        finding.dataset.warningIndex = String(index);
        finding.setAttribute("aria-current", String(warning === selected));
        buttons.push(finding);
      } else {
        finding.setAttribute("role", "group");
      }
      finding.setAttribute(
        "aria-label",
        `${warning.code}: ${warning.message}. ${warningMetadata(warning)}`,
      );
      const code = document.createElement("span");
      code.className = "imposia-inspector-code";
      code.textContent = warning.code;
      const metadata = document.createElement("span");
      metadata.className = "imposia-inspector-metadata";
      metadata.textContent = warningMetadata(warning);
      const message = document.createElement("span");
      message.className = "imposia-inspector-message";
      message.textContent = warning.message;
      finding.append(code, metadata, message);
      if ("recovery" in warning && warning.recovery !== undefined) {
        const recovery = document.createElement("span");
        recovery.className = "imposia-inspector-recovery";
        recovery.textContent = `RECOVERY · ${warning.recovery}`;
        finding.append(recovery);
      }
      item.append(finding);
      list.append(item);
    }
  }

  function setOpen(open: boolean, restoreFocus = false): void {
    if (destroyed) return;
    panel.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    root.dataset.inspectorOpen = String(open);
    if (open) {
      onOpen?.();
      (buttons[0] ?? panel).focus();
    } else if (restoreFocus) opener.focus();
  }

  function select(warning: PageWarning): void {
    assertActive();
    if (!warnings.includes(warning)) {
      throw new Error("Viewer inspector warning does not belong to the current generation.");
    }
    selected = warning;
    render();
    const page = warningPage(warning);
    if (page === undefined) return;
    goToPage(page);
    highlight(warning, page);
    setOpen(false);
    iframe.focus({ preventScroll: true });
  }

  function onOpenerClick(): void {
    setOpen(panel.hidden);
  }

  function onListClick(event: MouseEvent): void {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    const index = Number(target?.dataset.warningIndex);
    const warning = warnings[index];
    if (warning !== undefined) select(warning);
  }

  function onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false, true);
      return;
    }
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
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
  root.insertBefore(highlightOverlay, iframe);
  render();

  return {
    opener,
    panel,
    open() {
      assertActive();
      setOpen(true);
    },
    close(options) {
      assertActive();
      setOpen(false, options?.restoreFocus);
    },
    toggle() {
      assertActive();
      const opening = panel.hidden;
      setOpen(opening, !opening);
    },
    select,
    setDocument(nextDocument) {
      if (destroyed) throw new Error("Viewer inspector has been destroyed.");
      clearHighlight();
      currentDocument = nextDocument;
      warnings = nextDocument.warnings;
      selected = undefined;
      render();
      if (!panel.hidden) (buttons[0] ?? panel).focus();
    },
    setOnOpen(callback) {
      onOpen = callback;
    },
    syncPresentation() {
      clearHighlight();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearHighlight();
      warnings = Object.freeze([]);
      selected = undefined;
      onOpen = undefined;
      opener.removeEventListener("click", onOpenerClick);
      list.removeEventListener("click", onListClick);
      panel.removeEventListener("keydown", onPanelKeydown);
      list.replaceChildren();
      panel.replaceChildren();
      opener.remove();
      panel.remove();
      highlightOverlay.remove();
      if (originalInspectorOpen === null) delete root.dataset.inspectorOpen;
      else root.setAttribute("data-inspector-open", originalInspectorOpen);
    },
    get openState() {
      return !panel.hidden;
    },
    get state() {
      return {
        open: destroyed ? false : !panel.hidden,
        warnings,
        selected,
      };
    },
  };
}
