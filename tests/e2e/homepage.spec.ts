import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const locales = [
  {
    locale: "en",
    heading: "HTML in. Pages out.",
    docsCta: /documentation|get started|docs/i,
    demoCta: /demo/i,
    gettingStarted: "Build your first page",
  },
  {
    locale: "ko",
    heading: "HTML을 넣으면, 페이지가 됩니다.",
    docsCta: /문서|시작/i,
    demoCta: /데모/i,
    gettingStarted: "첫 페이지 만들기",
  },
  {
    locale: "zh-CN",
    heading: "输入 HTML，输出页面。",
    docsCta: /文档|开始|入门/i,
    demoCta: /演示/i,
    gettingStarted: "创建第一个分页预览",
  },
  {
    locale: "ja",
    heading: "HTMLから、ページへ。",
    docsCta: /ドキュメント|はじめに|始める/i,
    demoCta: /デモ/i,
    gettingStarted: "最初のページを作る",
  },
] as const;

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
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locales[0].heading);
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
    for (const locale of locales) {
      await page.goto(`/${locale.locale}`);
      await expect(page).toHaveURL(new RegExp(`/${locale.locale}/?$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale.locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale.heading);

      const landing = page.getByRole("main");
      const docsCta = landing.getByRole("link", { name: locale.docsCta }).first();
      await expect(docsCta).toBeVisible();
      await expect(docsCta).toHaveAttribute("href", new RegExp(`/${locale.locale}/docs`));

      const demoCta = landing.getByRole("link", { name: locale.demoCta }).first();
      await expect(demoCta).toBeVisible();
      await expect(demoCta).toHaveAttribute("href", "/examples/demo/index.html");
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
      page.getByRole("heading", { name: "Documents that stay documents.", exact: true }),
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
    for (const locale of locales) {
      await page.goto(`/${locale.locale}/docs/getting-started`);
      await expect(page).toHaveURL(new RegExp(`/${locale.locale}/docs/getting-started/?$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale.locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale.gettingStarted);
      await expect(page.getByText("@imposia/react", { exact: true })).toBeVisible();
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("localized API references expose the public React, Core, and Viewer surfaces", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Documentation rendering is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const locale of locales) {
      await page.goto(`/${locale.locale}/docs/api-reference`);
      await expect(page).toHaveURL(new RegExp(`/${locale.locale}/docs/api-reference/?$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale.locale);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("API");
      await expect(page.getByText("ImposiaPageViewer", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("mountPageDocument", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("mountPageViewer", { exact: true }).first()).toBeVisible();
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("localized landing pages do not overflow a 320px viewport", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Responsive layout is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/en");

  try {
    const geometry = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
  } finally {
    assertNoBrowserErrors(captured);
  }
});
