import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("framework-neutral client example mounts the canonical two-page viewer", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/viewer/");

  try {
    await expect(page.locator("#viewer[data-status='ready']")).toBeVisible();
    await expect(page.locator("#viewer iframe[data-imposia-frame='page-document']")).toHaveCount(1);
    await expect(page.getByTestId("page-indicator")).toHaveText("1 / 2");

    const state = await page.evaluate(() => {
      const globals = globalThis as typeof globalThis & {
        imposiaDocumentController?: {
          current?: { pageCount: number; generation: number };
        };
        imposiaViewer?: {
          state: { pageCount: number; generation: number; mode: string };
        };
      };
      const viewerRoot = document.querySelector<HTMLElement>("#viewer");
      if (viewerRoot === null) throw new Error("Viewer root is missing.");
      return {
        document: globals.imposiaDocumentController?.current,
        viewer: globals.imposiaViewer?.state,
        theme: {
          accent: getComputedStyle(viewerRoot).getPropertyValue("--imposia-viewer-color-accent"),
          controlSize: getComputedStyle(viewerRoot).getPropertyValue(
            "--imposia-viewer-control-size",
          ),
        },
        text:
          document.querySelector<HTMLIFrameElement>("#viewer iframe")?.contentDocument?.body
            .textContent ?? "",
      };
    });

    expect(state.document).toMatchObject({ pageCount: 2, generation: 1 });
    expect(state.viewer).toMatchObject({ pageCount: 2, generation: 1, mode: "continuous" });
    expect(state.theme).toEqual({ accent: "#8b6cff", controlSize: "40px" });
    expect(state.text).toContain("Browser-only paginated document");
    expect(state.text).toContain("Second page");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
