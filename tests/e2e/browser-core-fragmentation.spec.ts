import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("fragments canonical browser flow into real A4 pages without duplicating text", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser fragmentation is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = {
        iframe: HTMLIFrameElement;
        pageCount: number;
        pages: readonly {
          number: number;
          side: "left" | "right";
          blank: boolean;
          widthCssPx: number;
          heightCssPx: number;
          bodyText: readonly string[];
        }[];
      };
      type CoreController = {
        ready: Promise<PageDocument>;
        destroy(): Promise<void>;
      };
      type PageViewerController = {
        nextPage(): void;
        setMode(mode: "continuous" | "single"): void;
        destroy(): void;
        readonly state: { page: number; pageCount: number; mode: string };
      };

      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);

      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: { css: readonly string[] },
        ): CoreController;
      };
      const viewerModule = (await import("/packages/viewer/dist/index.js")) as {
        mountPageViewer(container: HTMLElement, pageDocument: PageDocument): PageViewerController;
      };
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const markers = Array.from(
        { length: 84 },
        (_value, index) => `fragment-${String(index + 1).padStart(3, "0")}`,
      );
      const article = markers
        .map(
          (marker) =>
            `<p data-imposia-fragment="${marker}">${marker} canonical browser flow text</p>`,
        )
        .join("");
      const controller = core.mountPageDocument(
        host,
        { html: `<article>${article}</article>` },
        {
          css: [
            "article{margin:0}p[data-imposia-fragment]{margin:0 0 18px;font:16px/24px Arial,sans-serif}",
          ],
        },
      );

      try {
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const pageElements = [
          ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]"),
        ];
        const pageFlows = [
          ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]"),
        ];
        const allFlowText = pageFlows.map((flow) => flow.textContent ?? "").join("\n");
        const textOccurrences = markers.map((marker) => allFlowText.split(marker).length - 1);
        const viewer = viewerModule.mountPageViewer(host, ready);
        viewer.setMode("single");
        viewer.nextPage();
        const viewerState = viewer.state;
        viewer.destroy();

        return {
          pageCount: ready.pageCount,
          metadata: ready.pages.map((metadata) => ({
            number: metadata.number,
            side: metadata.side,
            blank: metadata.blank,
            widthCssPx: metadata.widthCssPx,
            heightCssPx: metadata.heightCssPx,
            text: metadata.bodyText.join(" "),
          })),
          pageMarkers: pageElements.map((pageElement) => ({
            number: pageElement.getAttribute("data-imposia-page-number"),
            side: pageElement.getAttribute("data-imposia-page-side"),
            blank: pageElement.getAttribute("data-imposia-blank"),
          })),
          pageFlowCount: pageFlows.length,
          textOccurrences,
          viewerState,
        };
      } finally {
        await controller.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.pageCount).toBeGreaterThanOrEqual(3);
    expect(observation.pageFlowCount).toBe(observation.pageCount);
    expect(observation.pageMarkers).toEqual(
      Array.from({ length: observation.pageCount }, (_value, index) => ({
        number: String(index + 1),
        side: index % 2 === 0 ? "right" : "left",
        blank: "false",
      })),
    );
    expect(observation.textOccurrences).toEqual(Array.from({ length: 84 }, () => 1));
    expect(observation.metadata).toHaveLength(observation.pageCount);
    for (const [index, metadata] of observation.metadata.entries()) {
      expect(metadata).toMatchObject({
        number: index + 1,
        side: index % 2 === 0 ? "right" : "left",
        blank: false,
      });
      expect(metadata.widthCssPx).toBeGreaterThan(790);
      expect(metadata.heightCssPx).toBeGreaterThan(1120);
      expect(metadata.text).not.toBe("");
    }
    expect(observation.viewerState).toMatchObject({
      page: 2,
      pageCount: observation.pageCount,
      mode: "single",
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
