import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const source = path.join(root, "design/articles/how-imposia-works-visual.html");
const output = path.join(root, "site/public/images/articles");
const browser = await chromium.launch({ headless: true });

try {
  await mkdir(output, { recursive: true });
  for (const lang of ["en", "ko"] as const) {
    for (const [size, width] of [
      ["desktop", 780],
      ["mobile", 343],
    ] as const) {
      const page = await browser.newPage({
        viewport: { width, height: 1200 },
        deviceScaleFactor: 2,
      });
      try {
        await page.goto(`${pathToFileURL(source).href}?lang=${lang}`);
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          clipped: [...document.querySelectorAll(".seg")].some(
            (element) =>
              element.scrollWidth > element.clientWidth + 1 ||
              element.scrollHeight > element.clientHeight + 1,
          ),
        }));
        if (geometry.document > geometry.viewport || geometry.clipped) {
          throw new Error(`Visual overflows at ${lang}/${size}: ${JSON.stringify(geometry)}`);
        }
        await page.locator("#artifact").screenshot({
          path: path.join(output, `how-imposia-works-${lang}-${size}.png`),
        });
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
