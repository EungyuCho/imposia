import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createRenderer } from "../../packages/node/src/renderer.js";

let largePdfPath = "";
let largePdfUrl = "";

test.beforeAll(async ({ browserName }) => {
  const name = browserName.replaceAll(/[^a-z0-9-]/gi, "-");
  largePdfPath = path.resolve(`tmp/viewer-large-${name}.pdf`);
  largePdfUrl = `/tmp/viewer-large-${name}.pdf`;
  const sections = Array.from(
    { length: 20 },
    (_value, index) => `<section><h1>Large page ${index + 1}</h1></section>`,
  ).join("");
  const renderer = createRenderer();
  try {
    const result = await renderer.render({
      html: `<style>@page{size:A4;margin:20mm}section+section{break-before:page}</style>${sections}`,
    });
    await mkdir(path.dirname(largePdfPath), { recursive: true });
    await writeFile(largePdfPath, result.pdf);
  } finally {
    await renderer.close();
  }
});

test.afterAll(async () => {
  if (largePdfPath !== "") await rm(largePdfPath, { force: true });
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/viewer/");
  await expect(page.locator(".imposia-viewer")).toHaveAttribute("data-status", "ready");
  expect(errors).toEqual([]);
});

test("navigates, zooms, switches modes, and keeps controls keyboard-accessible", async ({
  page,
}) => {
  const viewer = page.locator(".imposia-viewer");
  await expect(viewer).toHaveAttribute("data-mode", "continuous");
  await expect(page.locator(".imposia-page")).toHaveCount(3);
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 3");
  await expect(page.getByTestId("zoom-indicator")).toHaveText("100%");

  const next = page.getByRole("button", { name: "Next page" });
  await next.click();
  await expect(next).toBeFocused();
  await expect(page.getByTestId("page-indicator")).toHaveText("2 / 3");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("zoom-indicator")).toHaveText("110%");

  await page.getByRole("button", { name: "Single page" }).click();
  await expect(viewer).toHaveAttribute("data-mode", "single");
  await expect(page.locator(".imposia-page")).toHaveCount(1);
  await expect(page.locator(".imposia-page")).toHaveAttribute("data-page-number", "2");
  const singlePagePosition = await page.evaluate(() => {
    const stage = document.querySelector(".imposia-stage")?.getBoundingClientRect();
    const renderedPage = document.querySelector(".imposia-page")?.getBoundingClientRect();
    return { stageTop: stage?.top, pageTop: renderedPage?.top };
  });
  expect(singlePagePosition.pageTop).toBeGreaterThanOrEqual(singlePagePosition.stageTop ?? 0);

  await viewer.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("page-indicator")).toHaveText("3 / 3");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("page-indicator")).toHaveText("2 / 3");
  await page.keyboard.press("+");
  await expect(page.getByTestId("zoom-indicator")).toHaveText("120%");
});

test("announces loading and renders a useful error state", async ({ page }) => {
  await page.goto("/examples/viewer/?delay=250");
  await expect(page.locator(".imposia-viewer")).toHaveAttribute("data-status", "loading");
  await expect(page.locator('.imposia-state[role="status"]')).toContainText("Preparing document");
  await expect(page.locator(".imposia-viewer")).toHaveAttribute("data-status", "ready");

  await page.goto("/examples/viewer/?pdf=/missing.pdf");
  await expect(page.locator(".imposia-viewer")).toHaveAttribute("data-status", "error");
  await expect(page.getByRole("alert")).toContainText("Unable to open this PDF");
});

test("fits a narrow viewport without body overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/examples/viewer/");
  await expect(page.locator(".imposia-viewer")).toHaveAttribute("data-status", "ready");
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
  await expect(page.getByRole("toolbar", { name: "Document controls" })).toBeVisible();
  const narrowPagePosition = await page.evaluate(() => {
    const stage = document.querySelector(".imposia-stage")?.getBoundingClientRect();
    const renderedPage = document.querySelector(".imposia-page")?.getBoundingClientRect();
    return {
      stageLeft: stage?.left,
      stageRight: stage?.right,
      pageLeft: renderedPage?.left,
      pageRight: renderedPage?.right,
    };
  });
  expect(narrowPagePosition.pageLeft).toBeGreaterThanOrEqual(narrowPagePosition.stageLeft ?? 0);
  expect(narrowPagePosition.pageRight).toBeLessThanOrEqual(narrowPagePosition.stageRight ?? 390);
});

test("bounds large-document canvases and cancels obsolete render work", async ({ page }) => {
  await page.goto(`/examples/viewer/?pdf=${encodeURIComponent(largePdfUrl)}`);
  await expect(page.locator(".imposia-viewer")).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 20");
  expect(await page.locator(".imposia-page").count()).toBeLessThanOrEqual(5);

  await page.evaluate("globalThis.imposiaViewer.goToPage(20)");
  await expect(page.getByTestId("page-indicator")).toHaveText("20 / 20");
  await expect(page.locator('[data-page-number="20"]')).toBeVisible();
  expect(await page.locator(".imposia-page").count()).toBeLessThanOrEqual(5);

  await page.evaluate(`
    globalThis.imposiaViewer.setZoom(1.2);
    globalThis.imposiaViewer.setZoom(1.3);
    globalThis.imposiaViewer.setMode("single");
  `);
  await expect(page.locator(".imposia-viewer")).toHaveAttribute("data-mode", "single");
  await expect(page.locator(".imposia-page")).toHaveCount(1);
  await expect(page.locator('[data-page-number="20"]')).toBeVisible();

  await page.evaluate("globalThis.imposiaViewer.destroy()");
  await expect(page.locator(".imposia-viewer")).toHaveCount(0);
});
