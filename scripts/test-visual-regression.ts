import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { chromium, type Page } from "playwright";
import { PNG } from "pngjs";

const pdfPath = path.resolve("output/pdf/imposia-example.pdf");
const renderDirectory = path.resolve("tmp/pdfs/imposia-example");
const baselineDirectory = path.resolve("tests/fixtures/pdf/visual");
const pdfModulePath = path.resolve("node_modules/pdfjs-dist/build/pdf.mjs");
const pdfWorkerPath = path.resolve("node_modules/pdfjs-dist/build/pdf.worker.mjs");
const update = process.argv.includes("--update");
const pageCount = 3;

async function fulfillFiles(page: Page): Promise<void> {
  const [pdfModule, pdfWorker, pdf] = await Promise.all([
    readFile(pdfModulePath),
    readFile(pdfWorkerPath),
    readFile(pdfPath),
  ]);
  await page.route("https://imposia.test/pdf.mjs", (route) =>
    route.fulfill({ body: pdfModule, contentType: "text/javascript" }),
  );
  await page.route("https://imposia.test/pdf.worker.mjs", (route) =>
    route.fulfill({ body: pdfWorker, contentType: "text/javascript" }),
  );
  await page.route("https://imposia.test/book.pdf", (route) =>
    route.fulfill({ body: pdf, contentType: "application/pdf" }),
  );
}

async function rasterize(): Promise<void> {
  await mkdir(renderDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await fulfillFiles(page);
    await page.setContent(`<!doctype html><html><body><main></main><script type="module">
      import { getDocument, GlobalWorkerOptions } from "https://imposia.test/pdf.mjs";
      GlobalWorkerOptions.workerSrc = "https://imposia.test/pdf.worker.mjs";
      const pdf = await getDocument("https://imposia.test/book.pdf").promise;
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const sheet = await pdf.getPage(number);
        const viewport = sheet.getViewport({ scale: 96 / 72 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        document.querySelector("main").append(canvas);
        await sheet.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        sheet.cleanup();
      }
      document.body.dataset.ready = "true";
    </script></body></html>`);
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    const canvases = page.locator("canvas");
    if ((await canvases.count()) !== pageCount) {
      throw new Error(`Expected ${pageCount} raster pages.`);
    }
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      await canvases.nth(pageNumber - 1).screenshot({
        path: path.join(renderDirectory, `page-${pageNumber}.png`),
      });
    }
  } finally {
    await browser.close();
  }
}

async function comparePage(pageNumber: number): Promise<void> {
  const actualPath = path.join(renderDirectory, `page-${pageNumber}.png`);
  const baselinePath = path.join(baselineDirectory, `page-${pageNumber}.png`);
  if (update) {
    await copyFile(actualPath, baselinePath);
    return;
  }
  let expectedBuffer: Buffer;
  try {
    expectedBuffer = await readFile(baselinePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Visual baseline is missing. Run pnpm test:visual:update. ${detail}`);
  }
  const actual = PNG.sync.read(await readFile(actualPath));
  const expected = PNG.sync.read(expectedBuffer);
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `Page ${pageNumber} dimensions changed: expected ${expected.width}x${expected.height}, got ${actual.width}x${actual.height}.`,
    );
  }
  const changedPixels = pixelmatch(
    actual.data,
    expected.data,
    undefined,
    actual.width,
    actual.height,
    { threshold: 0.1 },
  );
  const ratio = changedPixels / (actual.width * actual.height);
  if (ratio > 0.001) {
    throw new Error(
      `Page ${pageNumber} visual difference ${(ratio * 100).toFixed(3)}% exceeds 0.100%.`,
    );
  }
}

async function main(): Promise<void> {
  await rasterize();
  if (update) await mkdir(baselineDirectory, { recursive: true });
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    await comparePage(pageNumber);
  }
  process.stdout.write(
    update
      ? `Updated ${pageCount} Playwright/PDF.js visual baselines in ${baselineDirectory}.\n`
      : `Visual PDF regression passed for ${pageCount} Playwright/PDF.js pages.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
