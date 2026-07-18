export interface PageSideConstraint {
  id: number;
  side: "left" | "right";
}

export function selectBlankMarkers(
  markers: PageSideConstraint[],
  pages: Map<number, number>,
): number[] {
  const selected: number[] = [];
  for (const marker of markers) {
    const markerPage = pages.get(marker.id);
    if (markerPage === undefined) {
      throw new Error(`Unable to locate page-side marker ${marker.id} in the probe PDF.`);
    }
    const pageNumber = markerPage + selected.length;
    const needsBlank = marker.side === "right" ? pageNumber % 2 === 0 : pageNumber % 2 === 1;
    if (needsBlank) selected.push(marker.id);
  }
  return selected;
}
