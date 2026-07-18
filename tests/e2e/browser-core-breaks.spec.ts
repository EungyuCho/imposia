import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("materializes authored page breaks as canonical pages", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Browser fragmentation is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = {
        iframe: HTMLIFrameElement;
        pages: readonly { blank: boolean; bodyText: readonly string[]; side: "left" | "right" }[];
      };
      type CoreController = { ready: Promise<PageDocument>; destroy(): Promise<void> };
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options?: Record<string, never>,
        ): CoreController;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(host, {
        html: `
            <style>
              .after-page { break-after: page; }
              .right { break-before: right; break-after: right; }
              .after-left { break-after: left; }
              .before-page { break-before: page; }
              .before-left { break-before: left; }
            </style>
            <template data-page-header>CORE-HEADER {{pageNumber}} / {{totalPages}}</template>
            <template data-page-footer>CORE-FOOTER {{pageNumber}} / {{totalPages}}</template>
            <section class="after-page">BREAK-AFTER-PAGE-ONE</section>
            <section>BREAK-AFTER-PAGE-TWO</section>
            <section class="right">BREAK-RIGHT-THREE</section>
            <section>BREAK-AFTER-RIGHT-FOUR</section>
            <section class="after-left">BREAK-AFTER-LEFT-FIVE</section>
            <section class="before-page">BREAK-BEFORE-PAGE-SIX</section>
            <section class="before-left">BREAK-BEFORE-LEFT-SEVEN</section>
          `,
      });
      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const pageElements = [
          ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]"),
        ];
        const flowText = [
          ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]"),
        ]
          .map((flow) => flow.textContent ?? "")
          .join("\n");
        return {
          pages: ready.pages.map((metadata) => ({
            blank: metadata.blank,
            side: metadata.side,
            text: metadata.bodyText.join(" "),
          })),
          blankAttributes: pageElements.map((pageElement) =>
            pageElement.getAttribute("data-imposia-blank"),
          ),
          headerText: pageElements.map((pageElement) =>
            pageElement
              .querySelector("[data-imposia-page-header]")
              ?.textContent?.replace(/\s+/g, " ")
              .trim(),
          ),
          footerText: pageElements.map((pageElement) =>
            pageElement
              .querySelector("[data-imposia-page-footer]")
              ?.textContent?.replace(/\s+/g, " ")
              .trim(),
          ),
          flowText,
        };
      } finally {
        await controller.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.pages).toEqual([
      { blank: false, side: "right", text: "BREAK-AFTER-PAGE-ONE" },
      { blank: false, side: "left", text: "BREAK-AFTER-PAGE-TWO" },
      { blank: false, side: "right", text: "BREAK-RIGHT-THREE" },
      { blank: true, side: "left", text: "" },
      {
        blank: false,
        side: "right",
        text: "BREAK-AFTER-RIGHT-FOUR BREAK-AFTER-LEFT-FIVE",
      },
      { blank: false, side: "left", text: "BREAK-BEFORE-PAGE-SIX" },
      { blank: true, side: "right", text: "" },
      { blank: false, side: "left", text: "BREAK-BEFORE-LEFT-SEVEN" },
    ]);
    expect(observation.blankAttributes).toEqual([
      "false",
      "false",
      "false",
      "true",
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(observation.headerText).toEqual(
      Array.from({ length: 8 }, (_value, index) => `CORE-HEADER ${index + 1} / 8`),
    );
    expect(observation.footerText).toEqual(
      Array.from({ length: 8 }, (_value, index) => `CORE-FOOTER ${index + 1} / 8`),
    );
    for (const marker of [
      "BREAK-AFTER-PAGE-ONE",
      "BREAK-AFTER-PAGE-TWO",
      "BREAK-RIGHT-THREE",
      "BREAK-AFTER-RIGHT-FOUR",
      "BREAK-AFTER-LEFT-FIVE",
      "BREAK-BEFORE-PAGE-SIX",
      "BREAK-BEFORE-LEFT-SEVEN",
    ]) {
      expect(observation.flowText.split(marker)).toHaveLength(2);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("can leave inserted blank-page decorations empty", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Browser fragmentation is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = { iframe: HTMLIFrameElement };
      type CoreController = { ready: Promise<PageDocument>; destroy(): Promise<void> };
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: {
            decorateBlankPages: boolean;
            headerTemplate: string;
            footerTemplate: string;
          },
        ): CoreController;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const controller = core.mountPageDocument(
        host,
        {
          html: '<section>FIRST</section><section style="break-before:right">SECOND</section>',
        },
        {
          decorateBlankPages: false,
          headerTemplate: "HEADER {{pageNumber}} / {{totalPages}}",
          footerTemplate: "FOOTER {{pageNumber}} / {{totalPages}}",
        },
      );
      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        return [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
          (pageElement) => ({
            blank: pageElement.getAttribute("data-imposia-blank"),
            header: pageElement.querySelector("[data-imposia-page-header]")?.textContent ?? "",
            footer: pageElement.querySelector("[data-imposia-page-footer]")?.textContent ?? "",
          }),
        );
      } finally {
        await controller.destroy();
      }
    });

    expect(observation).toEqual([
      { blank: "false", header: "HEADER 1 / 3", footer: "FOOTER 1 / 3" },
      { blank: "true", header: "", footer: "" },
      { blank: "false", header: "HEADER 3 / 3", footer: "FOOTER 3 / 3" },
    ]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
