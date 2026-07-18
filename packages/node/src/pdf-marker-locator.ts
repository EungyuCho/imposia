import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfTextMarker {
  id: number;
  token: string;
}

export async function locateTextMarkers(
  pdf: Uint8Array,
  markers: PdfTextMarker[],
): Promise<Map<number, number>> {
  const document = await getDocument({ data: pdf.slice() }).promise;
  const pages = new Map<number, number>();
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join("");
      for (const marker of markers) {
        if (text.includes(marker.token)) pages.set(marker.id, pageNumber);
      }
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return pages;
}
