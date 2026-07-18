import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const CSS_PX_PER_MM = 96 / 25.4;
const A4_WIDTH_CSS_PX = 210 * CSS_PX_PER_MM;
const A4_HEIGHT_CSS_PX = 297 * CSS_PX_PER_MM;
const LETTER_LANDSCAPE_WIDTH_CSS_PX = 11 * 96;
const LETTER_LANDSCAPE_HEIGHT_CSS_PX = 8.5 * 96;
const PAGE_GEOMETRY_TOLERANCE_CSS_PX = 0.75;

function expectCssPx(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(PAGE_GEOMETRY_TOLERANCE_CSS_PX);
}

test("authored default @page geometry drives canonical metadata and print CSS", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium owns structural paged-media assertions.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  await page.emulateMedia({ media: "print" });
  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = {
        iframe: HTMLIFrameElement;
        pageCount: number;
        pages: readonly [{ widthCssPx: number; heightCssPx: number }];
      };
      type Controller = { ready: Promise<PageDocument>; destroy(): Promise<void> };
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options?: unknown,
        ): Controller;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(host, {
        html: `
          <style>
            @page { size: 148mm 210mm; margin: 12mm 16mm 18mm 20mm; }
          </style>
          <p>Authored 148 by 210 millimetre sheet</p>
        `,
      });

      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical page document.");
        const frameWindow = frameDocument.defaultView;
        if (frameWindow === null) throw new Error("Missing canonical page window.");
        const pageElement = frameDocument.querySelector<HTMLElement>("[data-imposia-page]");
        if (pageElement === null) throw new Error("Missing canonical page element.");
        const pageStyle = frameWindow.getComputedStyle(pageElement);
        const htmlStyle = frameWindow.getComputedStyle(frameDocument.documentElement);
        const metadata = ready.pages[0];
        if (metadata === undefined) throw new Error("Missing page metadata.");

        return {
          pageCount: ready.pageCount,
          metadata: { width: metadata.widthCssPx, height: metadata.heightCssPx },
          pageRect: {
            width: pageElement.getBoundingClientRect().width,
            height: pageElement.getBoundingClientRect().height,
          },
          padding: {
            top: Number.parseFloat(pageStyle.paddingTop),
            right: Number.parseFloat(pageStyle.paddingRight),
            bottom: Number.parseFloat(pageStyle.paddingBottom),
            left: Number.parseFloat(pageStyle.paddingLeft),
          },
          printSheet: {
            width: Number.parseFloat(htmlStyle.width),
            height: Number.parseFloat(htmlStyle.minHeight),
          },
          printMedia: frameWindow.matchMedia("print").matches,
          iframeCount: host.querySelectorAll("iframe[data-imposia-frame]").length,
          canonicalIframe: host.querySelector("iframe[data-imposia-frame]") === ready.iframe,
        };
      } finally {
        await controller.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.pageCount).toBe(1);
    expectCssPx(observation.metadata.width, 148 * CSS_PX_PER_MM);
    expectCssPx(observation.metadata.height, 210 * CSS_PX_PER_MM);
    expectCssPx(observation.pageRect.width, 148 * CSS_PX_PER_MM);
    expectCssPx(observation.pageRect.height, 210 * CSS_PX_PER_MM);
    expectCssPx(observation.padding.top, 12 * CSS_PX_PER_MM);
    expectCssPx(observation.padding.right, 16 * CSS_PX_PER_MM);
    expectCssPx(observation.padding.bottom, 18 * CSS_PX_PER_MM);
    expectCssPx(observation.padding.left, 20 * CSS_PX_PER_MM);
    expectCssPx(observation.printSheet.width, 148 * CSS_PX_PER_MM);
    expectCssPx(observation.printSheet.height, 210 * CSS_PX_PER_MM);
    expect(observation.printMedia).toBe(true);
    expect(observation.iframeCount).toBe(1);
    expect(observation.canonicalIframe).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("page pseudo-classes select distinct supported margin-box content", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium owns structural paged-media assertions.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  await page.emulateMedia({ media: "print" });
  try {
    const observation = await page.evaluate(async () => {
      type Page = {
        side: string | null;
        blank: string | null;
        topCenter: string;
      };
      type PageDocument = { iframe: HTMLIFrameElement; pages: readonly unknown[] };
      type Controller = { ready: Promise<PageDocument>; destroy(): Promise<void> };
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options?: unknown,
        ): Controller;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(host, {
        html: `
          <style>
            @page {
              size: 148mm 210mm;
              margin: 12mm 16mm 18mm 20mm;
              @top-center { content: "DEFAULT"; }
            }
            @page :first { @top-center { content: "FIRST"; } }
            @page :left { @top-center { content: "LEFT"; } }
            @page :right { @top-center { content: "RIGHT"; } }
            @page :blank { @top-center { content: "BLANK"; } }
          </style>
          <section>First page</section>
          <section style="break-before: right">Right page after an inserted blank</section>
          <section style="break-before: left">Left page</section>
        `,
      });

      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical page document.");
        const pages: Page[] = [
          ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]"),
        ].map((pageElement) => ({
          side: pageElement.getAttribute("data-imposia-page-side"),
          blank: pageElement.getAttribute("data-imposia-blank"),
          topCenter:
            pageElement
              .querySelector<HTMLElement>('[data-imposia-margin-box="top-center"]')
              ?.textContent?.trim() ?? "",
        }));
        return { pageCount: ready.pages.length, pages };
      } finally {
        await controller.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.pageCount).toBe(4);
    expect(observation.pages).toEqual([
      { side: "right", blank: "false", topCenter: "FIRST" },
      { side: "left", blank: "true", topCenter: "BLANK" },
      { side: "right", blank: "false", topCenter: "RIGHT" },
      { side: "left", blank: "false", topCenter: "LEFT" },
    ]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("named @page rules apply through the authored page property", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium owns structural paged-media assertions.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  await page.emulateMedia({ media: "print" });
  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = { iframe: HTMLIFrameElement; pages: readonly unknown[] };
      type Controller = { ready: Promise<PageDocument>; destroy(): Promise<void> };
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options?: unknown,
        ): Controller;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(host, {
        html: `
          <style>
            @page { size: A4; margin: 20mm; @top-center { content: "BASE"; } }
            @page chapter { margin: 7mm; @top-center { content: "CHAPTER"; } }
            .chapter { page: chapter; break-before: page; }
          </style>
          <p>Base page</p>
          <article class="chapter">Named chapter page</article>
        `,
      });

      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical page document.");
        const frameWindow = frameDocument.defaultView;
        if (frameWindow === null) throw new Error("Missing canonical page window.");
        const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
          (pageElement) => ({
            name: pageElement.getAttribute("data-imposia-page-name"),
            topCenter:
              pageElement
                .querySelector<HTMLElement>('[data-imposia-margin-box="top-center"]')
                ?.textContent?.trim() ?? "",
            paddingTop: Number.parseFloat(frameWindow.getComputedStyle(pageElement).paddingTop),
          }),
        );
        return { pageCount: ready.pages.length, pages };
      } finally {
        await controller.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.pageCount).toBe(2);
    expect(observation.pages[0]?.topCenter).toBe("BASE");
    expect(observation.pages[1]?.name).toBe("chapter");
    expect(observation.pages[1]?.topCenter).toBe("CHAPTER");
    expectCssPx(observation.pages[1]?.paddingTop ?? Number.NaN, 7 * CSS_PX_PER_MM);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("host Letter landscape geometry overrides authored page geometry on one canonical iframe", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium owns structural paged-media assertions.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  await page.emulateMedia({ media: "print" });
  try {
    const observation = await page.evaluate(async () => {
      type Page = {
        widthCssPx: number;
        heightCssPx: number;
        paddingTop: number;
        paddingRight: number;
        paddingBottom: number;
        paddingLeft: number;
      };
      type PageDocument = {
        iframe: HTMLIFrameElement;
        generation: number;
        pages: readonly Page[];
      };
      type Controller = {
        ready: Promise<PageDocument>;
        update(source: { html: string }): Promise<PageDocument>;
        destroy(): Promise<void>;
      };
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options?: unknown,
        ): Controller;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const pageOptions = { size: "A4" as const, margin: "20mm" };
      Reflect.set(pageOptions, "size", "Letter");
      Reflect.set(pageOptions, "orientation", "landscape");
      Reflect.set(pageOptions, "margin", {
        top: "9mm",
        right: "11mm",
        bottom: "13mm",
        left: "15mm",
      });
      const controller = core.mountPageDocument(
        host,
        {
          html: `
            <style>
              @page { size: 148mm 210mm; margin: 1mm; }
            </style>
            <p>Host geometry wins</p>
          `,
        },
        { page: pageOptions },
      );

      const read = (document: PageDocument) => {
        const frameDocument = document.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical page document.");
        const frameWindow = frameDocument.defaultView;
        if (frameWindow === null) throw new Error("Missing canonical page window.");
        const pageElement = frameDocument.querySelector<HTMLElement>("[data-imposia-page]");
        if (pageElement === null) throw new Error("Missing canonical page element.");
        const style = frameWindow.getComputedStyle(pageElement);
        const sheet = frameWindow.getComputedStyle(frameDocument.documentElement);
        const metadata = document.pages[0];
        if (metadata === undefined) throw new Error("Missing page metadata.");
        return {
          generation: document.generation,
          page: {
            widthCssPx: metadata.widthCssPx,
            heightCssPx: metadata.heightCssPx,
            paddingTop: Number.parseFloat(style.paddingTop),
            paddingRight: Number.parseFloat(style.paddingRight),
            paddingBottom: Number.parseFloat(style.paddingBottom),
            paddingLeft: Number.parseFloat(style.paddingLeft),
          },
          printSheet: {
            width: Number.parseFloat(sheet.width),
            height: Number.parseFloat(sheet.minHeight),
          },
          iframeCount: host.querySelectorAll("iframe[data-imposia-frame]").length,
          canonicalIframe: host.querySelector("iframe[data-imposia-frame]") === document.iframe,
        };
      };

      try {
        const first = await controller.ready;
        const firstObservation = read(first);
        const second = await controller.update({ html: "<p>Host geometry remains on update</p>" });
        const secondObservation = read(second);
        return { first: firstObservation, second: secondObservation };
      } finally {
        await controller.destroy();
        host.replaceChildren();
      }
    });

    for (const snapshot of [observation.first, observation.second]) {
      expect(snapshot.generation).toBeGreaterThanOrEqual(1);
      expectCssPx(snapshot.page.widthCssPx, LETTER_LANDSCAPE_WIDTH_CSS_PX);
      expectCssPx(snapshot.page.heightCssPx, LETTER_LANDSCAPE_HEIGHT_CSS_PX);
      expectCssPx(snapshot.page.paddingTop, 9 * CSS_PX_PER_MM);
      expectCssPx(snapshot.page.paddingRight, 11 * CSS_PX_PER_MM);
      expectCssPx(snapshot.page.paddingBottom, 13 * CSS_PX_PER_MM);
      expectCssPx(snapshot.page.paddingLeft, 15 * CSS_PX_PER_MM);
      expectCssPx(snapshot.printSheet.width, LETTER_LANDSCAPE_WIDTH_CSS_PX);
      expectCssPx(snapshot.printSheet.height, LETTER_LANDSCAPE_HEIGHT_CSS_PX);
      expect(snapshot.iframeCount).toBe(1);
      expect(snapshot.canonicalIframe).toBe(true);
    }
    expect(observation.first.generation).toBe(1);
    expect(observation.second.generation).toBe(2);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("unsupported authored page values recover with deterministic warnings and default geometry", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium owns structural paged-media assertions.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  await page.emulateMedia({ media: "print" });
  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = {
        iframe: HTMLIFrameElement;
        generation: number;
        pages: readonly [{ widthCssPx: number; heightCssPx: number; bodyText: readonly string[] }];
        warnings: readonly { code: string; message: string }[];
      };
      type Controller = {
        ready: Promise<PageDocument>;
        update(source: { html: string }): Promise<PageDocument>;
        destroy(): Promise<void>;
      };
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options?: unknown,
        ): Controller;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(host, { html: "<p>Stable generation</p>" });

      const read = (document: PageDocument) => ({
        generation: document.generation,
        iframe: document.iframe,
        page: document.pages[0],
        warningCodes: document.warnings.map(({ code }) => code),
        warnings: document.warnings,
        text: document.pages[0]?.bodyText.join(" ") ?? "",
        iframeCount: host.querySelectorAll("iframe[data-imposia-frame]").length,
      });

      try {
        const first = await controller.ready;
        const recovered = await controller.update({
          html: `
            <style>
              @page {
                size: broken;
                margin: 10%;
                margin-top: 2em;
                margin-right: 25vw;
              }
            </style>
            <p>Recovered generation</p>
          `,
        });
        const repeated = await controller.update({
          html: `
            <style>
              @page {
                size: broken;
                margin: 10%;
                margin-top: 2em;
                margin-right: 25vw;
              }
            </style>
            <p>Recovered generation</p>
          `,
        });
        return {
          first: read(first),
          recovered: read(recovered),
          repeated: read(repeated),
          sameIframe: first.iframe === recovered.iframe && recovered.iframe === repeated.iframe,
        };
      } finally {
        await controller.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.first.generation).toBe(1);
    expect(observation.first.text).toBe("Stable generation");
    expectCssPx(observation.first.page.widthCssPx, A4_WIDTH_CSS_PX);
    expectCssPx(observation.first.page.heightCssPx, A4_HEIGHT_CSS_PX);
    expect(observation.recovered.generation).toBe(2);
    expect(observation.repeated.generation).toBe(3);
    expect(observation.recovered.text).toBe("Recovered generation");
    expect(observation.repeated.text).toBe("Recovered generation");
    expect(observation.recovered.warningCodes.length).toBeGreaterThan(0);
    expect(
      observation.recovered.warningCodes.every((code) => code === "PAGE_RULE_UNSUPPORTED"),
    ).toBe(true);
    expect(observation.repeated.warningCodes).toEqual(observation.recovered.warningCodes);
    expect(observation.repeated.warnings).toEqual(observation.recovered.warnings);
    expectCssPx(observation.recovered.page.widthCssPx, A4_WIDTH_CSS_PX);
    expectCssPx(observation.recovered.page.heightCssPx, A4_HEIGHT_CSS_PX);
    expectCssPx(observation.repeated.page.widthCssPx, A4_WIDTH_CSS_PX);
    expectCssPx(observation.repeated.page.heightCssPx, A4_HEIGHT_CSS_PX);
    expect(observation.sameIframe).toBe(true);
    expect(observation.recovered.iframeCount).toBe(1);
    expect(observation.repeated.iframeCount).toBe(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
