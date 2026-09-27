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

test("root redirects to the English landing page", async ({ page, browserName }) => {
  const captured = captureBrowserErrors(page, browserName);

  await page.goto("/");

  try {
    await expect(page).toHaveURL(/\/en\/?$/, { timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Imposia" })).toBeVisible();
    // The hero viewer is a real Imposia document paginated in the browser.
    await expect(page.locator(".lp-viewer-live .lp-viewer-ok")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator(".lp-viewer-live iframe[data-imposia-frame='page-document']"),
    ).toHaveCount(1);
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("crawl files expose canonical, authored pages", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap: https://imposia.pages.dev/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toContain("https://imposia.pages.dev/ko/docs/getting-started/");
  expect(xml).toContain("https://imposia.pages.dev/ko/blog/how-imposia-works/");
  expect(xml).not.toContain("https://imposia.pages.dev/ja/blog/how-imposia-works/");
});

test("each locale root renders that locale's landing page", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Locale routing is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/?$`), { timeout: 15_000 });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("#imposia-landing")).toBeVisible();
      await expect(
        page.locator(`#imposia-landing a[href="/${locale}/docs/getting-started"]`),
      ).toBeVisible();
      await expect(page.locator(".lp-stat-value").first()).not.toHaveText(/—/);
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
    const demoLink = page
      .locator("#nd-subnav")
      .getByRole("link", { name: "Examples", exact: true });
    await expect(demoLink).toHaveAttribute("href", "/examples/demo/index.html");
    await demoLink.click();

    await expect(page).toHaveURL(/\/examples\/demo\/index\.html$/);
    await expect(page).toHaveTitle("Imposia Playground");
    await expect(page.getByRole("button", { name: /Account statement/ })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("the GNB exposes the GitHub repository beside the navigation links, as on the landing page", async ({
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
    const githubLink = page
      .locator("#nd-subnav")
      .getByRole("link", { name: "GitHub", exact: true })
      .first();

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
    // Links, then GitHub, on the left; the locale control on the right.
    expect(githubBox?.x).toBeLessThan(languageBox?.x ?? Number.NEGATIVE_INFINITY);
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

test("Blog navigation opens the article index and the complete first article", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Article navigation is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    await page.goto("/en");
    await page.locator("#imposia-landing").getByRole("link", { name: "Blog" }).click();
    await expect(page).toHaveURL(/\/en\/blog\/?$/);
    await expect(page.getByRole("heading", { level: 1, name: "Inside Imposia" })).toBeVisible();
    await page.getByRole("link", { name: "Read article" }).click();
    await expect(page).toHaveURL(/\/en\/blog\/how-imposia-works\/?$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "How Imposia turns HTML into pages" }),
    ).toBeVisible();
    await expect(page.locator(".blog-content h2")).toHaveCount(7);
    await expect(page.locator(".blog-figure")).toHaveCount(1);
    const illustration = page.locator(".blog-illustration img");
    await expect(illustration).toHaveCount(1);
    await expect
      .poll(() => illustration.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.locator(".blog-toc a").first()).toBeVisible();

    await page.goto("/en/docs");
    const blogLink = page.locator("#nd-subnav").getByRole("link", { name: "Blog", exact: true });
    await expect(blogLink).toHaveAttribute("href", "/en/blog");
    await blogLink.click();
    await expect(page).toHaveURL(/\/en\/blog\/?$/);
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("localized articles disclose English fallback and keep canonical language honest", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Article locale routing is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);

  try {
    await page.goto("/ko/blog/how-imposia-works");
    await expect(page.locator(".blog-post")).toHaveAttribute("lang", "ko");
    await expect(page.locator(".blog-fallback")).toHaveCount(0);
    await expect(page.locator(".blog-illustration img")).toHaveAttribute(
      "src",
      "/images/articles/how-imposia-works-ko-desktop.png",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://imposia.pages.dev/ko/blog/how-imposia-works/",
    );
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      "href",
      "https://imposia.pages.dev/en/blog/how-imposia-works/",
    );

    for (const locale of ["ja", "zh-CN"]) {
      await page.goto(`/${locale}/blog`);
      await expect(page.locator(".blog-feature-copy h2")).toHaveAttribute("lang", "en");
      await expect(page.locator(".blog-feature-copy > p:not(.blog-eyebrow)")).toHaveAttribute(
        "lang",
        "en",
      );
      await page.goto(`/${locale}/blog/how-imposia-works`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator(".blog-post")).toHaveAttribute("lang", "en");
      await expect(page.locator(".blog-fallback")).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://imposia.pages.dev/en/blog/how-imposia-works/",
      );
      await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
      await expect(page.locator(".blog-language-badge")).toHaveCount(0);
    }
  } finally {
    assertNoBrowserErrors(captured);
  }
});

test("article pages retain readable navigation without horizontal overflow at 320px", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Article layout is Chromium-reference only.");
  const captured = captureBrowserErrors(page, browserName);
  await page.setViewportSize({ width: 320, height: 700 });

  try {
    for (const path of ["/ko/blog", "/ko/blog/how-imposia-works", "/ja/blog/how-imposia-works"]) {
      await page.goto(path);
      await expect(
        page
          .locator(".blog-nav")
          .getByRole("link", { name: "블로그" })
          .or(page.locator(".blog-nav").getByRole("link", { name: "ブログ" })),
      ).toBeVisible();
      const geometry = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(geometry.documentWidth, path).toBe(geometry.viewportWidth);
    }
    await page.goto("/ko/blog/how-imposia-works");
    const mobileContents = page.locator(".blog-mobile-toc");
    await expect(mobileContents.getByText("이 글의 목차")).toBeVisible();
    await mobileContents.locator("summary").click();
    await expect(mobileContents.getByRole("link").first()).toBeVisible();
  } finally {
    assertNoBrowserErrors(captured);
  }
});
