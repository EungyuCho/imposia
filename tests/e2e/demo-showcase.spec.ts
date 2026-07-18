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
