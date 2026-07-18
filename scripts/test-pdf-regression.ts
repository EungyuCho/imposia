import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = path.resolve("output/pdf/imposia-example.pdf");
const baselinePath = path.resolve("tests/fixtures/pdf/imposia-example.semantic.json");
const update = process.argv.includes("--update");

interface PdfSemanticSnapshot {
  title: string;
  pageCount: number;
  pages: Array<{
    number: number;
    widthPoints: number;
    heightPoints: number;
    text: string;
  }>;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

async function snapshotPdf(): Promise<PdfSemanticSnapshot> {
  const pdfBytes = new Uint8Array(await readFile(pdfPath));
  const pdf = await getDocument({ data: pdfBytes }).promise;
  try {
    const metadata = await pdf.getMetadata();
    const title =
      typeof metadata.info === "object" &&
      metadata.info !== null &&
      "Title" in metadata.info &&
      typeof metadata.info.Title === "string"
        ? metadata.info.Title
        : "";
    const pages: PdfSemanticSnapshot["pages"] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const text = await page.getTextContent();
      pages.push({
        number,
        widthPoints: rounded(viewport.width),
        heightPoints: rounded(viewport.height),
        text: text.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      });
      page.cleanup();
    }
    return { title, pageCount: pdf.numPages, pages };
  } finally {
    await pdf.destroy();
  }
}

async function main(): Promise<void> {
  const snapshot = await snapshotPdf();
  if (update) {
    await mkdir(path.dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`);
    process.stdout.write(`Updated semantic PDF baseline: ${baselinePath}\n`);
    return;
  }

  let expected: PdfSemanticSnapshot;
  try {
    expected = JSON.parse(await readFile(baselinePath, "utf8")) as PdfSemanticSnapshot;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `PDF semantic baseline is missing or invalid. Run pnpm test:pdf:update. ${detail}`,
    );
  }
  if (JSON.stringify(snapshot) !== JSON.stringify(expected)) {
    throw new Error(
      `PDF semantic regression detected.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(snapshot)}`,
    );
  }
  process.stdout.write(
    `PDF semantic regression passed: ${snapshot.pageCount} pages, title "${snapshot.title}".\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
