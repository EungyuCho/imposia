import type { Page } from "playwright";
import { type PageSideConstraint, selectBlankMarkers } from "./page-side-parity.js";
import { applyPageSideSpacers } from "./page-side-spacers.js";
import { locateTextMarkers, type PdfTextMarker } from "./pdf-marker-locator.js";

interface SideMarker extends PdfTextMarker, PageSideConstraint {
  domId: string;
  side: "left" | "right";
}

type PdfOptions = NonNullable<Parameters<Page["pdf"]>[0]>;

async function attachMarkers(page: Page): Promise<SideMarker[]> {
  return page.evaluate(() => {
    const markers: SideMarker[] = [];
    const randomValues = new Uint32Array(4);
    globalThis.crypto.getRandomValues(randomValues);
    let markerNamespace = "IMPS";
    for (const value of randomValues) markerNamespace += value.toString(16).padStart(8, "0");
    const markerStyle = [
      "all:initial!important",
      "background:transparent!important",
      "border:0!important",
      "clear:none!important",
      "color:#fff!important",
      "display:block!important",
      "float:none!important",
      "font:1px/1px Arial,sans-serif!important",
      "height:1px!important",
      "margin:0 0 -1px!important",
      "opacity:1!important",
      "overflow:visible!important",
      "padding:0!important",
      "position:static!important",
      "visibility:visible!important",
      "white-space:nowrap!important",
      "width:40px!important",
    ].join(";");
    for (const target of document.querySelectorAll("body *")) {
      const styles = getComputedStyle(target);
      const breakBefore = styles.breakBefore;
      const breakAfter = styles.breakAfter;
      const hasBeforeSide = breakBefore === "left" || breakBefore === "right";
      const hasAfterSide = breakAfter === "left" || breakAfter === "right";
      if (!hasBeforeSide && !hasAfterSide) continue;
      const replacedInline =
        target instanceof HTMLCanvasElement ||
        target instanceof HTMLImageElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLVideoElement;
      const inlineDisplay =
        styles.display === "inline" ||
        styles.display.startsWith("inline-") ||
        styles.display.startsWith("inline ");
      if (
        styles.position === "absolute" ||
        styles.position === "fixed" ||
        (inlineDisplay && !replacedInline)
      ) {
        continue;
      }
      if (target.getClientRects().length === 0) continue;
      if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) continue;

      if (hasBeforeSide) {
        const id = markers.length;
        const domId = `${markerNamespace}:${id}`;
        const token = `${markerNamespace}${id}Z`;
        const marker = document.createElement("input");
        marker.type = "text";
        marker.value = token;
        marker.readOnly = true;
        marker.tabIndex = -1;
        marker.dataset.imposiaSideMarker = domId;
        marker.dataset.imposiaSidePosition = "before";
        marker.dataset.imposiaOriginalBreakBefore = target.style.getPropertyValue("break-before");
        marker.dataset.imposiaOriginalBreakBeforePriority =
          target.style.getPropertyPriority("break-before");
        marker.setAttribute("aria-hidden", "true");
        marker.style.cssText = markerStyle;
        marker.style.setProperty("break-before", "page", "important");
        target.style.setProperty("break-before", "auto", "important");
        target.before(marker);
        markers.push({ domId, id, side: breakBefore, token });
      }

      if (!hasAfterSide) continue;
      let cursor: Node | null = target;
      let candidate: Node | null = null;
      while (cursor !== null && cursor !== document.body) {
        if (cursor.nextSibling !== null) {
          candidate = cursor.nextSibling;
          break;
        }
        cursor = cursor.parentNode;
      }
      let hasFollowingContent = false;
      while (candidate !== null) {
        if (candidate.nodeType === Node.TEXT_NODE && candidate.textContent?.trim() !== "") {
          const range = document.createRange();
          range.selectNodeContents(candidate);
          if (range.getClientRects().length > 0) {
            hasFollowingContent = true;
            break;
          }
        }
        if (candidate instanceof Element) {
          const ignored = ["SCRIPT", "STYLE", "TEMPLATE"].includes(candidate.tagName);
          const candidatePosition = getComputedStyle(candidate).position;
          const outOfFlow = candidatePosition === "absolute" || candidatePosition === "fixed";
          if (!ignored && !outOfFlow && candidate.getClientRects().length > 0) {
            hasFollowingContent = true;
            break;
          }
          if (!ignored && !outOfFlow) {
            const descendants = document.createTreeWalker(
              candidate,
              NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            );
            let descendant = descendants.nextNode();
            while (descendant !== null) {
              let ancestor = descendant instanceof Element ? descendant : descendant.parentElement;
              let descendantOutOfFlow = false;
              while (ancestor !== null && ancestor !== candidate) {
                const position = getComputedStyle(ancestor).position;
                if (
                  ["SCRIPT", "STYLE", "TEMPLATE"].includes(ancestor.tagName) ||
                  position === "absolute" ||
                  position === "fixed"
                ) {
                  descendantOutOfFlow = true;
                  break;
                }
                ancestor = ancestor.parentElement;
              }
              if (descendantOutOfFlow) {
                descendant = descendants.nextNode();
                continue;
              }
              if (descendant.nodeType === Node.TEXT_NODE && descendant.textContent?.trim() !== "") {
                const range = document.createRange();
                range.selectNodeContents(descendant);
                if (range.getClientRects().length > 0) {
                  hasFollowingContent = true;
                  break;
                }
              }
              if (descendant instanceof Element) {
                const descendantIgnored = ["SCRIPT", "STYLE", "TEMPLATE"].includes(
                  descendant.tagName,
                );
                if (!descendantIgnored && descendant.getClientRects().length > 0) {
                  hasFollowingContent = true;
                  break;
                }
              }
              descendant = descendants.nextNode();
            }
            if (hasFollowingContent) break;
          }
        }
        cursor = candidate;
        candidate = null;
        while (cursor !== null && cursor !== document.body) {
          if (cursor.nextSibling !== null) {
            candidate = cursor.nextSibling;
            break;
          }
          cursor = cursor.parentNode;
        }
      }
      if (!hasFollowingContent) {
        target.style.setProperty("break-after", "auto", "important");
        continue;
      }
      const id = markers.length;
      const domId = `${markerNamespace}:${id}`;
      const token = `${markerNamespace}${id}Z`;
      const marker = document.createElement("input");
      marker.type = "text";
      marker.value = token;
      marker.readOnly = true;
      marker.tabIndex = -1;
      marker.dataset.imposiaSideMarker = domId;
      marker.dataset.imposiaSidePosition = "after";
      marker.setAttribute("aria-hidden", "true");
      marker.style.cssText = markerStyle;
      target.after(marker);
      markers.push({ domId, id, side: breakAfter, token });
    }

    const markersByDomId = new Map<string, SideMarker>();
    for (const marker of markers) markersByDomId.set(marker.domId, marker);
    const orderedMarkers: SideMarker[] = [];
    for (const markerElement of document.querySelectorAll<HTMLElement>(
      "[data-imposia-side-marker]",
    )) {
      const marker = markersByDomId.get(markerElement.dataset.imposiaSideMarker ?? "");
      if (marker !== undefined) orderedMarkers.push(marker);
    }
    return orderedMarkers;
  });
}

export async function renderPdfWithPageSides(page: Page, options: PdfOptions): Promise<Uint8Array> {
  const markers = await attachMarkers(page);
  if (markers.length === 0) return new Uint8Array(await page.pdf(options));
  const probe = new Uint8Array(await page.pdf(options));
  const pages = await locateTextMarkers(probe, markers);
  const blankMarkers = selectBlankMarkers(markers, pages);
  await applyPageSideSpacers(page, markers, blankMarkers);
  return new Uint8Array(await page.pdf(options));
}
