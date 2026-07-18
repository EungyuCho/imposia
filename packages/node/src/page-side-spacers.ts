import type { Page } from "playwright";

export async function applyPageSideSpacers(
  page: Page,
  markers: Array<{ domId: string; id: number }>,
  blankBefore: number[],
): Promise<void> {
  const blankMarkerNumbers = new Set(blankBefore);
  const generatedIds = markers.map((marker) => marker.domId);
  const blankIds = markers
    .filter((marker) => blankMarkerNumbers.has(marker.id))
    .map((marker) => marker.domId);
  await page.evaluate(
    ({ generatedIds, blankIds }) => {
      const generated = new Set(generatedIds);
      const blanks = new Set(blankIds);
      const spacerStyle = [
        "all:initial!important",
        "background:transparent!important",
        "border:0!important",
        "break-after:page!important",
        "break-before:page!important",
        "clear:none!important",
        "display:block!important",
        "float:none!important",
        "font:0/0 Arial,sans-serif!important",
        "height:0!important",
        "margin:0!important",
        "padding:0!important",
        "position:static!important",
        "visibility:visible!important",
        "width:0!important",
      ].join(";");
      for (const marker of document.querySelectorAll<HTMLElement>("[data-imposia-side-marker]")) {
        const id = marker.dataset.imposiaSideMarker ?? "";
        if (!generated.has(id)) continue;
        const position = marker.dataset.imposiaSidePosition;
        const target =
          position === "after" ? marker.previousElementSibling : marker.nextElementSibling;
        if (
          position === "before" &&
          (target instanceof HTMLElement || target instanceof SVGElement)
        ) {
          const originalValue = marker.dataset.imposiaOriginalBreakBefore ?? "";
          const originalPriority = marker.dataset.imposiaOriginalBreakBeforePriority ?? "";
          if (originalValue === "") target.style.removeProperty("break-before");
          else target.style.setProperty("break-before", originalValue, originalPriority);
        }
        marker.remove();
        if (target === null || !blanks.has(id)) continue;
        const spacer = document.createElement("input");
        spacer.type = "text";
        spacer.readOnly = true;
        spacer.tabIndex = -1;
        spacer.setAttribute("aria-hidden", "true");
        spacer.setAttribute("data-imposia-blank-page", "");
        spacer.style.cssText = spacerStyle;
        if (position === "after") target.after(spacer);
        else target.before(spacer);
      }
    },
    { generatedIds, blankIds },
  );
}
