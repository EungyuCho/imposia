import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const localeCases = [
  { locale: "en", heading: "HTML in. Pages out.", cta: "Explore the demo" },
  { locale: "ko", heading: "HTML을 넣으면, 페이지가 됩니다.", cta: "데모 살펴보기" },
  { locale: "zh-CN", heading: "输入 HTML，输出页面。", cta: "查看演示" },
  { locale: "ja", heading: "HTMLから、ページへ。", cta: "デモを見る" },
] as const;

test("homepage switches language and keeps the choice after reload", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Homepage language behavior is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/");

  try {
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("HTML in. Pages out.");
    await expect(
      page
        .getByRole("region", { name: "HTML in. Pages out." })
        .getByRole("link", { name: "Explore the demo", exact: true }),
    ).toBeVisible();

    const languageSelector = page.getByRole("combobox", { name: /language/i });
    await expect(languageSelector).toHaveValue("en");
    await languageSelector.selectOption("ko");

    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "HTML을 넣으면, 페이지가 됩니다.",
    );
    await expect(
      page
        .getByRole("region", { name: "HTML을 넣으면, 페이지가 됩니다." })
        .getByRole("link", { name: "데모 살펴보기", exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByRole("combobox", { name: "언어" })).toHaveValue("ko");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "HTML을 넣으면, 페이지가 됩니다.",
    );
    await expect(
      page
        .getByRole("region", { name: "HTML을 넣으면, 페이지가 됩니다." })
        .getByRole("link", { name: "데모 살펴보기", exact: true }),
    ).toBeVisible();
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("homepage presents every supported locale through one accessible surface", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/");

  try {
    for (const localeCase of localeCases) {
      await page.getByRole("combobox").selectOption(localeCase.locale);
      await expect(page.locator("html")).toHaveAttribute("lang", localeCase.locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(localeCase.heading);
      await expect(
        page
          .getByRole("region", { name: localeCase.heading })
          .getByRole("link", { name: localeCase.cta, exact: true }),
      ).toHaveAttribute("href", "/examples/demo/");
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("homepage navigation and primary controls remain usable on a narrow viewport", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");

  try {
    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(navigation.getByRole("link", { name: "Why", exact: true })).toHaveAttribute(
      "href",
      "#why-imposia",
    );
    await expect(page.locator("#why-imposia")).toBeAttached();

    const geometry = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);

    for (const control of [
      page.getByRole("combobox", { name: "Language" }),
      page
        .getByRole("region", { name: "HTML in. Pages out." })
        .getByRole("link", { name: "Explore the demo", exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
      expect(box?.height).toBeGreaterThanOrEqual(24);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
