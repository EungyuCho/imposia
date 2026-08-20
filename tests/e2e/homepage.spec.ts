import { expect, type Page, test } from "@playwright/test";
import { LOCALES } from "../../site/lib/i18n";
import { captureBrowserErrors } from "./browser-core-support.js";

function assertNoBrowserErrors(errors: ReturnType<typeof captureBrowserErrors>) {
  expect(errors.errors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
}

/**
 * Documentation pages repeat identifiers across package-manager tabs and keep
 * some occurrences inside collapsed accordions, so DOM order alone does not
 * find a rendered one. Match the first occurrence the reader can actually see.
 */
function visibleInPage(page: Page, text: string) {
  return page
    .locator("#nd-page")
    .getByText(text, { exact: true })
    .filter({ visible: true })
    .first();
}

test("root redirects to the default English documentation", async ({ page, browserName }) => {
  const captured = captureBrowserErrors(page, browserName);

  await page.goto("/");

  try {
    await expect(page).toHaveURL(/\/en\/docs\/?$/, { timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("each locale root forwards to that locale's documentation", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Locale routing is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/?$`), { timeout: 15_000 });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("the GNB demo link loads the standalone demo document", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Navigation chrome is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  await page.goto("/en/docs");

  try {
    const demoLink = page.locator("#nd-sidebar").getByRole("link", { name: "Demo", exact: true });
    await expect(demoLink).toHaveAttribute("href", "/examples/demo/index.html");
    await demoLink.click();

    await expect(page).toHaveURL(/\/examples\/demo\/index\.html$/);
    await expect(page).toHaveTitle("Imposia Publishing Lab");
    await expect(
      page.getByRole("heading", { name: "Edit HTML. Keep complete pages.", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("the GNB exposes the GitHub repository next to the locale control", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Navigation chrome is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  await page.goto("/en/docs");

  try {
    const languageTrigger = page
      .getByRole("button", { name: /choose a language|language|locale/i })
      .first();
    const githubLink = page.getByRole("link", { name: "GitHub", exact: true }).first();

    await expect(languageTrigger).toBeVisible();
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveAttribute("href", "https://github.com/EungyuCho/imposia");
    await expect(githubLink).toHaveAttribute("target", "_blank");

    const [languageBox, githubBox] = await Promise.all([
      languageTrigger.boundingBox(),
      githubLink.boundingBox(),
    ]);
    expect(languageBox).not.toBeNull();
    expect(githubBox).not.toBeNull();
    expect(githubBox?.x).toBeGreaterThan(languageBox?.x ?? Number.POSITIVE_INFINITY);
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("documentation layout exposes the Fumadocs sidebar and locale controls", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Fumadocs documentation layout is Chromium-reference only.",
  );
  const captured = captureBrowserErrors(page, browserName);

  await page.goto("/en/docs/getting-started");

  try {
    await expect(page.getByRole("complementary").first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("link", { name: "Build your first page", exact: true }),
    ).toBeVisible();

    const languageTrigger = page
      .getByRole("button", { name: /choose a language|language|locale|언어|语言|言語/i })
      .first();
    await expect(languageTrigger).toBeVisible();
    await languageTrigger.click();

    const languageDialog = page.getByRole("dialog");
    await expect(languageDialog.getByRole("button", { name: "한국어", exact: true })).toBeVisible();
    await expect(
      languageDialog.getByRole("button", { name: "简体中文", exact: true }),
    ).toBeVisible();
    await expect(languageDialog.getByRole("button", { name: "日本語", exact: true })).toBeVisible();

    await languageDialog.getByRole("button", { name: "한국어", exact: true }).click();
    await expect(page).toHaveURL(/\/ko\/docs\/getting-started\/?$/);
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("localized getting-started docs render through the public route", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Documentation rendering is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/docs/getting-started`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/getting-started/?$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(visibleInPage(page, "@imposia/react")).toBeVisible();
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("localized documentation separates concepts and task guides", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Documentation rendering is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/docs/concepts/publishing-model`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/concepts/publishing-model/?$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await page.goto(`/${locale}/docs/guides/react-publishing`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/guides/react-publishing/?$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("localized API references expose separate React, Core, and Viewer pages", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Documentation rendering is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/docs/api/react`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/api/react/?$`));
      await expect(visibleInPage(page, "ImposiaPageViewer")).toBeVisible();

      await page.goto(`/${locale}/docs/api/core`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/api/core/?$`));
      await expect(visibleInPage(page, "mountPageDocument")).toBeVisible();

      await page.goto(`/${locale}/docs/api/viewer`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/api/viewer/?$`));
      await expect(visibleInPage(page, "mountPageViewer")).toBeVisible();
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("legacy API reference routes redirect to the package overview", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Documentation routing is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const legacyPath of ["/en/docs/api-reference", "/en/docs/api-reference/"]) {
      await page.goto(legacyPath);
      await expect(page).toHaveURL(/\/en\/docs\/api\/?$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("legacy publishing routes redirect to the publishing model", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Documentation routing is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const legacyPath of ["/ko/docs/publishing-contract", "/ko/docs/publishing-contract/"]) {
      await page.goto(legacyPath);
      await expect(page).toHaveURL(/\/ko\/docs\/concepts\/publishing-model\/?$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("localized landing and documentation pages do not overflow a 320px viewport", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Responsive layout is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  await page.setViewportSize({ width: 320, height: 700 });
  try {
    for (const locale of LOCALES) {
      for (const path of ["", "/docs", "/docs/api/react"]) {
        await page.goto(`/${locale}${path}`);
        const geometry = await page.evaluate(() => ({
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
        }));
        expect(geometry.documentWidth, `/${locale}${path}`).toBe(geometry.viewportWidth);
      }
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});
