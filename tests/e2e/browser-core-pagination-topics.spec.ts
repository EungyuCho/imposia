import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";
import { boundaryTopics } from "./pagination-boundary-topics.js";
import { combinationTopics } from "./pagination-combination-topics.js";
import { layoutTopics } from "./pagination-layout-topics.js";
import { publishingTopics } from "./pagination-publishing-topics.js";
import { observeTopic } from "./pagination-topic-support.js";

for (const topic of [
  ...layoutTopics,
  ...publishingTopics,
  ...boundaryTopics,
  ...combinationTopics,
]) {
  test(`${topic.id}: ${topic.title}`, async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "Structural pagination is Chromium-reference only.");
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    await page.goto("/examples/book.html");
    const result = await observeTopic(page, topic.input);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
    await testInfo.attach("pagination-observation", {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });
    expect(result.tokens).toEqual(topic.input.html.match(/K\d{4}/g) ?? []);
    if (!topic.recovery) {
      expect(result.warnings.map((w) => w.code)).not.toContain("PAGE_OVERFLOW");
      expect(result.pages.every((p) => p.overflow <= 1)).toBe(true);
    }
    topic.check(result);
  });
}
