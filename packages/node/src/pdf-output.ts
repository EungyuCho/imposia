import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Page } from "playwright";
import type { RenderPage } from "./types.js";

export async function inspectPdf(pdf: Uint8Array): Promise<{ pages: RenderPage[] }> {
  const document = await getDocument({ data: pdf.slice() }).promise;
  try {
    const pages: RenderPage[] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        number: index,
        widthPoints: viewport.width,
        heightPoints: viewport.height,
      });
      page.cleanup();
    }
    return { pages };
  } finally {
    await document.destroy();
  }
}

export function pdfOptions(
  headerTemplate?: string,
  footerTemplate?: string,
): NonNullable<Parameters<Page["pdf"]>[0]> {
  const displayHeaderFooter = headerTemplate !== undefined || footerTemplate !== undefined;
  const wrapDecoration = (template: string): string =>
    `<div style="box-sizing:border-box;width:100%;padding:0 20mm;color:#17201e;font-family:Arial,sans-serif;">${template}</div>`;
  return {
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    displayHeaderFooter,
    ...(headerTemplate === undefined ? {} : { headerTemplate: wrapDecoration(headerTemplate) }),
    ...(footerTemplate === undefined ? {} : { footerTemplate: wrapDecoration(footerTemplate) }),
  };
}
