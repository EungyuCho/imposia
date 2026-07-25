import { expect, test } from "@playwright/test";
import { LOCALES } from "../../site/lib/i18n";
import { captureBrowserErrors } from "./browser-core-support.js";

function assertNoBrowserErrors(errors: ReturnType<typeof captureBrowserErrors>) {
  expect(errors.errors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
}

test("root redirects to the default English landing page", async ({ page, browserName }) => {
  const captured = captureBrowserErrors(page, browserName);

  await page.goto("/");

  try {
    await expect(page).toHaveURL(/\/en\/?$/, { timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("localized landing pages expose docs and demo calls to action", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Landing-page copy is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/?$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const landing = page.getByRole("main");
      const docsCta = landing.locator(`.hero-actions a[href="/${locale}/docs"]`);
      await expect(docsCta).toBeVisible();

      const demoCta = landing.locator('.hero-actions a[href="/examples/demo/index.html"]');
      await expect(demoCta).toBeVisible();
      await expect(landing.locator(".outcome-section .outcome-card")).toHaveCount(3);
      await expect(landing.locator(".outcome-section h2")).toHaveCount(3);
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("the GNB demo link loads the standalone demo document", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Landing-page navigation is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  await page.goto("/en");

  try {
    const demoLink = page.locator("#nd-nav").getByRole("link", { name: "Demo", exact: true });
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
  test.skip(browserName !== "chromium", "Landing-page navigation is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  await page.goto("/en");

  try {
    const navigation = page.locator("#nd-nav");
    const languageTrigger = navigation
      .getByRole("button", { name: /choose a language|language|locale/i })
      .first();
    const githubLink = navigation.getByRole("link", { name: "GitHub", exact: true });

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
      await expect(page.getByText("@imposia/react", { exact: true })).toBeVisible();
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
      await expect(page.getByText("ImposiaPageViewer", { exact: true }).first()).toBeVisible();

      await page.goto(`/${locale}/docs/api/core`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/api/core/?$`));
      await expect(page.getByText("mountPageDocument", { exact: true }).first()).toBeVisible();

      await page.goto(`/${locale}/docs/api/viewer`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/docs/api/viewer/?$`));
      await expect(page.getByText("mountPageViewer", { exact: true }).first()).toBeVisible();
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
