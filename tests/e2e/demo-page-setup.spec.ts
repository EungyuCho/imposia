import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("React publishing lab offers common page presets with A4 selected", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    await page.locator("[data-demo-case='compatibility']").click();
    const pageSize = page.getByRole("combobox", { name: "Page size" });
    await expect(
      page.getByTestId("demo-preview-surface").locator("[data-imposia-react-status='ready']"),
    ).toBeVisible();
    await expect(pageSize).toHaveValue("a4");
    await expect(pageSize.locator("option")).toHaveText([
      "A5",
      "A4",
      "A3",
      "ISO B5",
      "ISO B4",
      "ISO B3",
      "ISO B2",
      "ISO B1",
      "Letter",
    ]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab switches the page size to A3", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Canonical pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    const preview = page.getByTestId("demo-preview-surface");
    await page.locator("[data-demo-case='compatibility']").click();
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();

    await page.getByRole("combobox", { name: "Page size" }).selectOption("a3");

    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(page.getByTestId("metric-sheet")).toHaveText("1123 × 1587 px");
    await expect(preview.locator("iframe[data-imposia-frame='page-document']")).toHaveCount(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab combines ISO B1 with landscape orientation", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    const preview = page.getByTestId("demo-preview-surface");
    await page.locator("[data-demo-case='compatibility']").click();
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await page.getByRole("button", { name: "Landscape", exact: true }).click();
    await expect(page.getByTestId("metric-sheet")).toHaveText("1123 × 794 px");

    await page.getByRole("combobox", { name: "Page size" }).selectOption("b1");

    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(page.getByTestId("metric-sheet")).toHaveText("3780 × 2672 px");
    await expect(preview.locator("iframe[data-imposia-frame='page-document']")).toHaveCount(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
