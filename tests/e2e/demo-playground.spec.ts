import { expect, type Page, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// The public playground at /examples/demo/. It doubles as the proof lab: rapid
// edits must never show a half-built page set, and a rejected update must
// leave the committed pages on screen.

const FRAME = ".pg-stage iframe[data-imposia-frame='page-document']";

async function waitForCommit(page: Page): Promise<void> {
  await expect(page.locator(".pg-dot.is-ready")).toBeVisible();
}

async function committedPages(page: Page) {
  return page.evaluate((selector) => {
    const frame = document.querySelector<HTMLIFrameElement>(selector);
    const frameDocument = frame?.contentDocument;
    if (frameDocument === null || frameDocument === undefined) throw new Error("No frame.");
    return [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
      (pageElement) => ({
        width: pageElement.getBoundingClientRect().width,
        height: pageElement.getBoundingClientRect().height,
        headerRows: pageElement.querySelectorAll("thead tr").length,
        footer:
          pageElement.querySelector("[data-imposia-margin-box='bottom-right']")?.textContent ?? "",
        text: pageElement.textContent ?? "",
      }),
    );
  }, FRAME);
}

async function statusText(page: Page): Promise<string> {
  return (await page.locator(".pg-status").innerText()).replace(/\s+/g, " ");
}

test("opens on a statement whose header repeats on every page, without warnings", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/demo/");
  try {
    await waitForCommit(page);
    await expect(page.getByRole("button", { name: /Account statement/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await statusText(page)).toContain("No warnings");
    const pages = await committedPages(page);
    expect(pages.length).toBeGreaterThan(2);
    // Every page that carries statement rows repeats the table header.
    for (const item of pages.filter((entry) => /2026-0\d-\d\d/.test(entry.text))) {
      expect(item.headerRows).toBe(1);
    }
    expect(pages.at(-1)?.footer).toBe(`Page ${pages.length} of ${pages.length}`);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("every template commits without warnings, and the batch numbers each invoice from 1", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Template content is checked in the Chromium reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/demo/");
  try {
    await waitForCommit(page);
    for (const name of [/^Invoice Line/, /Quarterly report/, /Service agreement/]) {
      await page.getByRole("button", { name }).click();
      await waitForCommit(page);
      expect(await statusText(page)).toContain("No warnings");
    }
    await page.getByRole("button", { name: /Invoice batch/ }).click();
    await waitForCommit(page);
    expect(await statusText(page)).toContain("No warnings");
    const footers = (await committedPages(page)).map((item) => item.footer);
    // Six invoices, each starting again at page 1.
    expect(footers.filter((footer) => footer.startsWith("Page 1 of ")).length).toBe(6);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("page setup changes the committed sheet size and orientation", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Page geometry is checked in the Chromium reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/demo/");
  try {
    await waitForCommit(page);
    const a4 = (await committedPages(page))[0];
    await page
      .getByRole("group", { name: "Paper size" })
      .getByRole("button", { name: "Letter" })
      .click();
    await page
      .getByRole("group", { name: "Orientation" })
      .getByRole("button", { name: "Landscape" })
      .click();
    await expect.poll(async () => (await committedPages(page))[0]?.width).not.toBe(a4?.width);
    await waitForCommit(page);
    const letter = (await committedPages(page))[0];
    // Letter landscape is 11 × 8.5 in at 96 px/in.
    expect(Math.round(letter?.width ?? 0)).toBe(1056);
    expect(Math.round(letter?.height ?? 0)).toBe(816);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("rapid edits never show a half-built page set, and a broken update keeps the pages", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/demo/");
  try {
    await waitForCommit(page);
    const proof = page.locator(".pg-proof");
    await page.getByRole("button", { name: /rapid edits/ }).click();
    await expect(proof).toContainText("Every frame showed a complete page set");
    await waitForCommit(page);
    await expect
      .poll(async () => Number(await proof.locator("dd").nth(1).innerText()))
      .toBeGreaterThan(1);
    await expect(proof.locator("dd").nth(2)).toHaveText("0");

    const before = (await committedPages(page)).length;
    await page.getByRole("button", { name: /broken update/ }).click();
    await expect(proof).toContainText(
      "Broken update rejected. The previous pages stayed on screen.",
    );
    // The rejected update never replaced the pages; the valid update after it
    // commits the same document again.
    expect((await committedPages(page)).length).toBe(before);
    await waitForCommit(page);
    expect((await committedPages(page)).length).toBe(before);
    await expect(proof.locator("dd").nth(2)).toHaveText("0");
    expect(await statusText(page)).toContain("No warnings");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("spread view labels and steps through page pairs", async ({ page, browserName }) => {
  test.skip(
    browserName !== "chromium",
    "Viewer presentation is checked in the Chromium reference.",
  );
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/demo/");
  try {
    await waitForCommit(page);
    const pages = page.locator(".pg-viewer-pages");
    await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Spread" }).click();
    await expect(pages).toHaveText(/^1–2 \/ \d+$/);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(pages).toHaveText(/^3–4 \/ \d+$/);
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(pages).toHaveText(/^1–2 \/ \d+$/);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("Print / Save as PDF opens the browser print dialog from the top window", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical browser print is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/demo/");
  try {
    await waitForCommit(page);
    await page.evaluate((selector) => {
      const frameWindow = document.querySelector<HTMLIFrameElement>(selector)?.contentWindow;
      if (frameWindow === null || frameWindow === undefined) throw new Error("No frame.");
      const observation = { frame: 0, parent: 0 };
      Object.defineProperty(frameWindow, "print", {
        configurable: true,
        writable: true,
        value: () => {
          observation.frame += 1;
        },
      });
      Object.defineProperty(window, "print", {
        configurable: true,
        writable: true,
        value: () => {
          observation.parent += 1;
          window.dispatchEvent(new Event("afterprint"));
        },
      });
      Reflect.set(globalThis, "__playgroundPrint", observation);
    }, FRAME);
    await page.getByRole("button", { name: "Print / Save as PDF" }).click();
    await expect
      .poll(() => page.evaluate(() => Reflect.get(globalThis, "__playgroundPrint")))
      .toEqual({ frame: 0, parent: 1 });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

for (const width of [320, 390]) {
  test(`stays inside a ${width}px viewport with the viewer first`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Responsive geometry is Chromium-reference only.");
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/examples/demo/");
    try {
      await waitForCommit(page);
      const geometry = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        viewerTop: document.querySelector(".pg-viewer")?.getBoundingClientRect().top ?? -1,
        sidebarTop: document.querySelector(".pg-sidebar")?.getBoundingClientRect().top ?? -1,
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.viewerTop).toBeLessThan(geometry.sidebarTop);
      await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeVisible();
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });
}
