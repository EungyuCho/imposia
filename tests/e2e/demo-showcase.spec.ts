import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("React publishing lab switches sources and extension boundaries", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    const preview = page.getByTestId("demo-preview-surface");
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(page.getByTestId("metric-pages")).toHaveText("3");
    await expect(page.getByTestId("metric-warnings")).toHaveText("1");
    await expect(preview.locator("iframe[data-imposia-frame='page-document']")).toHaveCount(1);

    await page.evaluate(() => {
      Object.assign(globalThis, {
        __imposiaDemoFrame: document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      });
    });
    await page.locator("[data-sample-id='brief']").click();
    await expect(page.getByTestId("metric-generation")).toHaveText("2");
    await expect(page.getByTestId("metric-pages")).toHaveText("2");
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaDemoFrame") ===
          document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      ),
    ).toBe(true);

    await page.getByRole("button", { name: "Core" }).click();
    await expect(page.getByTestId("demo-code-snippet")).toContainText("mountPageDocument");

    await page.getByRole("checkbox", { name: "Running-head extension" }).uncheck();
    await expect(page.getByTestId("metric-warnings")).toHaveText("0");
    await expect(preview.locator("iframe[data-imposia-frame='page-document']")).toHaveCount(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab downloads a ready EPUB", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Browser downloads are Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    const downloadButton = page.getByRole("button", { name: "Download EPUB", exact: true });
    const preview = page.getByTestId("demo-preview-surface");
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();

    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>(".demo-export-button");
      if (button === null) throw new Error("Demo export button is missing.");
      const trace: boolean[] = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.attributeName !== "disabled") continue;
          trace.push(record.oldValue === null);
        }
      });
      observer.observe(button, {
        attributes: true,
        attributeFilter: ["disabled"],
        attributeOldValue: true,
      });
      Reflect.set(globalThis, "__imposiaDemoExportTrace", trace);
      Reflect.set(globalThis, "__imposiaDemoExportObserver", observer);
    });
    await page.locator("[data-sample-id='publishing']").click();
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    const exportTrace = await page.evaluate(() => {
      const observer = Reflect.get(globalThis, "__imposiaDemoExportObserver");
      if (observer instanceof MutationObserver) observer.disconnect();
      const trace = Reflect.get(globalThis, "__imposiaDemoExportTrace");
      return Array.isArray(trace) ? (trace as boolean[]) : [];
    });
    expect(exportTrace).toContain(true);
    await expect(page.getByTestId("metric-sheet")).toHaveText("1123 × 794 px");
    await expect(downloadButton).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.epub$/i);

    const stream = await download.createReadStream();
    if (stream === null) throw new Error("EPUB download stream is missing.");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const nameLength = bytes.readUInt16LE(26);
    const extraLength = bytes.readUInt16LE(28);
    expect(bytes.subarray(30, 30 + nameLength).toString("utf8")).toBe("mimetype");
    expect(bytes.readUInt16LE(8)).toBe(0);
    const dataOffset = 30 + nameLength + extraLength;
    const dataLength = bytes.readUInt32LE(18);
    expect(bytes.subarray(dataOffset, dataOffset + dataLength).toString("utf8")).toBe(
      "application/epub+zip",
    );
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
