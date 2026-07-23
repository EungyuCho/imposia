import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

function storedZipEntryText(bytes: Buffer, entryName: string): string {
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const compression = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if (name === entryName) {
      if (compression !== 0) throw new Error(`${entryName} is not stored without compression.`);
      return bytes.subarray(dataStart, dataStart + compressedSize).toString("utf8");
    }
    offset = dataStart + compressedSize;
  }
  throw new Error(`${entryName} is missing from the EPUB archive.`);
}

test("React publishing lab defaults to A4 portrait and switches orientation", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    const preview = page.getByTestId("demo-preview-surface");
    const orientation = page.getByRole("group", { name: "Page orientation" });
    const portrait = orientation.getByRole("button", { name: "Portrait", exact: true });
    const landscape = orientation.getByRole("button", { name: "Landscape", exact: true });

    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(portrait).toHaveAttribute("aria-pressed", "true");
    await expect(landscape).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("metric-sheet")).toHaveText("794 × 1123 px");

    await landscape.click();

    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(portrait).toHaveAttribute("aria-pressed", "false");
    await expect(landscape).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("metric-sheet")).toHaveText("1123 × 794 px");
    await expect(preview.locator("iframe[data-imposia-frame='page-document']")).toHaveCount(1);

    await portrait.click();

    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(portrait).toHaveAttribute("aria-pressed", "true");
    await expect(landscape).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("metric-sheet")).toHaveText("794 × 1123 px");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab proves page-boundary continuity through rapid CSR updates", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/demo/");

  try {
    const preview = page.getByTestId("demo-preview-surface");
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(page.getByTestId("integrity-count")).toHaveText("96 / 96");
    await expect(page.getByTestId("integrity-status")).toContainText(
      "Exact and ordered · CSR revision 0",
    );
    const ranges = page.getByTestId("integrity-page-ranges").locator("li");
    expect(await ranges.count()).toBeGreaterThan(2);

    await page.evaluate(() => {
      const expectedTokens = Array.from(
        { length: 96 },
        (_, index) => `FLOW-${String(index + 1).padStart(3, "0")}`,
      );
      const observations: Array<{
        tokenCount: number;
        exactSequence: boolean;
        integrityCount: string;
      }> = [];
      const sampleCanonicalGeneration = () => {
        const frame = document.querySelector<HTMLIFrameElement>(
          "[data-testid='demo-preview-surface'] iframe",
        );
        const tokens = [
          ...(frame?.contentDocument?.querySelectorAll<HTMLElement>(
            "[data-imposia-page] [data-integrity-token]",
          ) ?? []),
        ].map((element) => element.dataset.integrityToken);
        observations.push({
          tokenCount: tokens.length,
          exactSequence: tokens.every((token, index) => token === expectedTokens[index]),
          integrityCount:
            document.querySelector<HTMLElement>("[data-testid='integrity-count']")?.innerText ?? "",
        });
      };
      const samplingInterval = window.setInterval(sampleCanonicalGeneration, 1);
      sampleCanonicalGeneration();
      Object.assign(globalThis, {
        __imposiaIntegrityFrame: document.querySelector(
          "[data-testid='demo-preview-surface'] iframe",
        ),
        __imposiaIntegrityObservations: observations,
        __imposiaIntegritySamplingInterval: samplingInterval,
      });
    });
    await page.getByTestId("run-csr-burst").click();
    await expect(page.getByTestId("integrity-status")).toContainText(
      "Exact and ordered · CSR revision 3",
    );
    await expect(page.getByTestId("integrity-count")).toHaveText("96 / 96");
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaIntegrityFrame") ===
          document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      ),
    ).toBe(true);

    const committedTokens = await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(
        "[data-testid='demo-preview-surface'] iframe",
      );
      return [
        ...(frame?.contentDocument?.querySelectorAll<HTMLElement>(
          "[data-imposia-page] [data-integrity-token]",
        ) ?? []),
      ].map((element) => element.dataset.integrityToken);
    });
    expect(committedTokens).toEqual(
      Array.from({ length: 96 }, (_, index) => `FLOW-${String(index + 1).padStart(3, "0")}`),
    );
    const observations = await page.evaluate(() => {
      const samplingInterval = Reflect.get(globalThis, "__imposiaIntegritySamplingInterval");
      if (typeof samplingInterval === "number") window.clearInterval(samplingInterval);
      return Reflect.get(globalThis, "__imposiaIntegrityObservations") as Array<{
        tokenCount: number;
        exactSequence: boolean;
        integrityCount: string;
      }>;
    });
    expect(observations.length).toBeGreaterThan(1);
    expect(
      observations.every(
        (observation) =>
          observation.tokenCount === 96 &&
          observation.exactSequence &&
          observation.integrityCount === "96 / 96",
      ),
    ).toBe(true);
  } finally {
    await page
      .evaluate(() => {
        const samplingInterval = Reflect.get(globalThis, "__imposiaIntegritySamplingInterval");
        if (typeof samplingInterval === "number") window.clearInterval(samplingInterval);
      })
      .catch(() => undefined);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab switches sources and extension boundaries", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    const preview = page.getByTestId("demo-preview-surface");
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    expect(Number(await page.getByTestId("metric-pages").textContent())).toBeGreaterThan(2);
    await expect(page.getByTestId("metric-warnings")).toHaveText("0");
    await expect(preview.locator("iframe[data-imposia-frame='page-document']")).toHaveCount(1);

    await page.evaluate(() => {
      Object.assign(globalThis, {
        __imposiaDemoFrame: document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      });
    });
    await page.locator("[data-sample-id='brief']").click();
    await expect(page.getByTestId("metric-generation")).toHaveText("2");
    await expect(page.getByTestId("metric-pages")).toHaveText("2");
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaDemoFrame") ===
          document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      ),
    ).toBe(true);

    await page.getByRole("button", { name: "Core" }).click();
    await expect(page.getByTestId("demo-code-snippet")).toContainText("mountPageDocument");

    await page.getByRole("checkbox", { name: "Running-head extension" }).uncheck();
    await expect(page.getByTestId("metric-generation")).toHaveText("3");
    await expect(page.getByTestId("metric-warnings")).toHaveText("0");
    await expect(preview.locator("iframe[data-imposia-frame='page-document']")).toHaveCount(1);
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaDemoFrame") ===
          document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      ),
    ).toBe(true);

    await page.getByRole("checkbox", { name: "Running-head extension" }).check();
    await expect(page.getByTestId("metric-generation")).toHaveText("4");
    await expect(page.getByTestId("metric-warnings")).toHaveText("2");
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaDemoFrame") ===
          document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      ),
    ).toBe(true);

    await page.locator("[data-sample-id='publishing']").click();
    await expect(page.getByTestId("metric-generation")).toHaveText("5");
    await expect(page.getByTestId("metric-sheet")).toHaveText("794 × 1123 px");
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaDemoFrame") ===
          document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      ),
    ).toBe(true);

    const placementCounts = () =>
      page.evaluate(() => {
        const frame = document.querySelector<HTMLIFrameElement>(
          "[data-testid='demo-preview-surface'] iframe",
        );
        return {
          footnotes:
            frame?.contentDocument?.querySelectorAll("[data-imposia-footnote]").length ?? 0,
          pageFloats:
            frame?.contentDocument?.querySelectorAll("[data-imposia-page-float]").length ?? 0,
        };
      });
    const experimentalPlacement = page.getByRole("checkbox", {
      name: "Experimental placement",
    });
    await expect(experimentalPlacement).not.toBeChecked();
    expect(await placementCounts()).toEqual({ footnotes: 0, pageFloats: 0 });

    await experimentalPlacement.check();
    await expect(page.getByTestId("metric-generation")).toHaveText("6");
    expect(await placementCounts()).toEqual({ footnotes: 1, pageFloats: 1 });
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaDemoFrame") ===
          document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      ),
    ).toBe(true);

    await experimentalPlacement.uncheck();
    await expect(page.getByTestId("metric-generation")).toHaveText("7");
    expect(await placementCounts()).toEqual({ footnotes: 0, pageFloats: 0 });
    expect(
      await page.evaluate(
        () =>
          Reflect.get(globalThis, "__imposiaDemoFrame") ===
          document.querySelector("[data-testid='demo-preview-surface'] iframe"),
      ),
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab downloads a ready EPUB", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Browser downloads are Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    const downloadButton = page.getByRole("button", { name: "Download EPUB", exact: true });
    const preview = page.getByTestId("demo-preview-surface");
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(page.getByTestId("demo-export-status")).toHaveText("EPUB ready");

    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>(".demo-export-button");
      if (button === null) throw new Error("Demo export button is missing.");
      const trace: boolean[] = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.attributeName !== "disabled") continue;
          trace.push(record.oldValue === null);
        }
      });
      observer.observe(button, {
        attributes: true,
        attributeFilter: ["disabled"],
        attributeOldValue: true,
      });
      Reflect.set(globalThis, "__imposiaDemoExportTrace", trace);
      Reflect.set(globalThis, "__imposiaDemoExportObserver", observer);
    });
    await page.locator("[data-sample-id='publishing']").click();
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Experimental placement" })).not.toBeChecked();
    const exportTrace = await page.evaluate(() => {
      const observer = Reflect.get(globalThis, "__imposiaDemoExportObserver");
      if (observer instanceof MutationObserver) observer.disconnect();
      const trace = Reflect.get(globalThis, "__imposiaDemoExportTrace");
      return Array.isArray(trace) ? (trace as boolean[]) : [];
    });
    expect(exportTrace).toContain(true);
    await expect(page.getByTestId("metric-sheet")).toHaveText("794 × 1123 px");
    await expect(downloadButton).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;
    await expect(page.getByTestId("demo-export-status")).toHaveText("EPUB downloaded");
    expect(download.suggestedFilename()).toMatch(/\.epub$/i);

    const stream = await download.createReadStream();
    if (stream === null) throw new Error("EPUB download stream is missing.");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const nameLength = bytes.readUInt16LE(26);
    const extraLength = bytes.readUInt16LE(28);
    expect(bytes.subarray(30, 30 + nameLength).toString("utf8")).toBe("mimetype");
    expect(bytes.readUInt16LE(8)).toBe(0);
    const dataOffset = 30 + nameLength + extraLength;
    const dataLength = bytes.readUInt32LE(18);
    expect(bytes.subarray(dataOffset, dataOffset + dataLength).toString("utf8")).toBe(
      "application/epub+zip",
    );
    const contentXhtml = storedZipEntryText(bytes, "EPUB/content.xhtml");
    const contentCss = storedZipEntryText(bytes, "EPUB/styles.css");
    expect(contentXhtml).toContain('class="publishing-float"');
    expect(contentXhtml).toContain('class="publishing-footnote"');
    expect(contentXhtml).not.toContain("publishing-float-disabled");
    expect(contentXhtml).not.toContain("publishing-footnote-disabled");
    expect(contentCss).not.toContain("float-reference: page");
    expect(contentCss).not.toContain("float: footnote");
    expect(contentXhtml).not.toContain("extensions:on");
    expect(contentXhtml).not.toContain("placement:on");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab prints the canonical frame for browser PDF saving", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical browser print is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/demo/");

  try {
    const preview = page.getByTestId("demo-preview-surface");
    const printButton = page.getByRole("button", { name: "Print / Save PDF", exact: true });
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    await expect(printButton).toBeEnabled();
    await expect(preview.locator("iframe[data-imposia-frame='page-document']")).toHaveAttribute(
      "sandbox",
      "allow-same-origin allow-modals",
    );

    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(
        "[data-testid='demo-preview-surface'] iframe",
      );
      const frameWindow = frame?.contentWindow;
      if (frame === null || frameWindow === null || frameWindow === undefined) {
        throw new Error("Canonical demo frame is missing.");
      }
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
        },
      });
      Reflect.set(globalThis, "__imposiaDemoPrintObservation", observation);
    });

    await printButton.click();
    expect(
      await page.evaluate(() => Reflect.get(globalThis, "__imposiaDemoPrintObservation")),
    ).toEqual({ frame: 1, parent: 0 });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab keeps viewer controls inside a 320px viewport", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Responsive demo geometry is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/examples/demo/");

  try {
    const preview = page.getByTestId("demo-preview-surface");
    await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>(".imposia-toolbar");
      if (toolbar === null) throw new Error("Demo viewer toolbar is missing.");
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        toolbar: toolbar.getBoundingClientRect().toJSON(),
        toolbarClientWidth: toolbar.clientWidth,
        toolbarScrollWidth: toolbar.scrollWidth,
        controls: [...toolbar.querySelectorAll<HTMLElement>("button")].map((control) => ({
          name: control.getAttribute("aria-label") ?? control.textContent?.trim() ?? "",
          rect: control.getBoundingClientRect().toJSON(),
          offsetLeft: control.offsetLeft,
          offsetRight: control.offsetLeft + control.offsetWidth,
          fontSize: Number.parseFloat(getComputedStyle(control).fontSize),
        })),
      };
    });

    expect(geometry.documentScrollWidth).toBe(geometry.viewportWidth);
    expect(geometry.toolbar.left).toBeGreaterThanOrEqual(0);
    expect(geometry.toolbar.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.toolbarScrollWidth).toBeGreaterThanOrEqual(geometry.toolbarClientWidth);
    expect(geometry.controls.map(({ name }) => name)).toEqual([
      "Previous page",
      "Next page",
      "Zoom out",
      "Zoom in",
      "Continuous pages",
      "Single page",
      "Spread pages",
    ]);
    for (const control of geometry.controls) {
      expect(control.rect.width, `${control.name} width`).toBeGreaterThanOrEqual(24);
      expect(control.rect.height, `${control.name} height`).toBeGreaterThanOrEqual(24);
      expect(control.fontSize, `${control.name} font size`).toBeGreaterThanOrEqual(8);
    }
    for (let index = 1; index < geometry.controls.length; index += 1) {
      expect(geometry.controls[index]?.offsetLeft).toBeGreaterThanOrEqual(
        geometry.controls[index - 1]?.offsetRight ?? 0,
      );
    }
    const activeModeControl = geometry.controls.find(({ name }) => name === "Continuous pages");
    if (activeModeControl === undefined) throw new Error("Demo active mode control is missing.");
    expect(activeModeControl.rect.left).toBeGreaterThanOrEqual(0);
    expect(activeModeControl.rect.right).toBeLessThanOrEqual(geometry.viewportWidth);

    const finalControl = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>(".imposia-toolbar");
      if (toolbar === null) throw new Error("Demo viewer toolbar is missing.");
      toolbar.scrollLeft = toolbar.scrollWidth;
      const control = toolbar.querySelector<HTMLElement>("button:last-of-type");
      if (control === null) throw new Error("Demo viewer final control is missing.");
      return control.getBoundingClientRect().toJSON();
    });
    expect(finalControl.left).toBeGreaterThanOrEqual(0);
    expect(finalControl.right).toBeLessThanOrEqual(geometry.viewportWidth);

    await page.getByRole("button", { name: "Next page" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("page-indicator")).toContainText("2 /");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React publishing lab stacks nested viewer controls at edge widths", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Responsive demo geometry is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  try {
    for (const width of [821, 900]) {
      await page.setViewportSize({ width, height: 568 });
      await page.goto("/examples/demo/");
      const preview = page.getByTestId("demo-preview-surface");
      await expect(preview.locator("[data-imposia-react-status='ready']")).toBeVisible();
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (element === null) throw new Error(`Missing ${selector}.`);
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
          };
        };
        const toolbar = document.querySelector<HTMLElement>(".imposia-toolbar");
        if (toolbar === null) throw new Error("Demo viewer toolbar is missing.");
        const identity = rect(".imposia-identity");
        const toolbarBounds = rect(".imposia-toolbar");
        const controls = [...toolbar.querySelectorAll<HTMLElement>("button")].map((control) => {
          const bounds = control.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            width: bounds.width,
            height: bounds.height,
          };
        });
        const overlaps =
          identity.left < toolbarBounds.right &&
          toolbarBounds.left < identity.right &&
          identity.top < toolbarBounds.bottom &&
          toolbarBounds.top < identity.bottom;
        return {
          viewportWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          identity,
          toolbar: toolbarBounds,
          overlaps,
          toolbarClientWidth: toolbar.clientWidth,
          toolbarScrollWidth: toolbar.scrollWidth,
          controls,
        };
      });

      expect(geometry.documentScrollWidth).toBe(geometry.viewportWidth);
      expect(geometry.overlaps).toBe(false);
      expect(geometry.toolbar.left).toBeGreaterThanOrEqual(0);
      expect(geometry.toolbar.right).toBeLessThanOrEqual(width);
      expect(geometry.controls).toHaveLength(7);
      for (const control of geometry.controls) {
        expect(control.left).toBeGreaterThanOrEqual(geometry.toolbar.left);
        expect(control.right).toBeLessThanOrEqual(
          geometry.toolbar.left + geometry.toolbarScrollWidth,
        );
        expect(control.width).toBeGreaterThanOrEqual(24);
        expect(control.height).toBeGreaterThanOrEqual(24);
      }
      for (let index = 1; index < geometry.controls.length; index += 1) {
        expect(geometry.controls[index]?.left).toBeGreaterThanOrEqual(
          geometry.controls[index - 1]?.right ?? 0,
        );
      }
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
