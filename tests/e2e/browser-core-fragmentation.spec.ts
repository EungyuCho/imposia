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

test("moves a block taller than a page to a fresh page when less than one line remains", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser fragmentation is Chromium-reference only.");
  test.setTimeout(120_000);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observations = await page.evaluate(async () => {
      type PageDocument = {
        iframe: HTMLIFrameElement;
        pageCount: number;
        warnings: readonly { readonly code: string }[];
      };
      type CoreController = { ready: Promise<PageDocument>; destroy(): Promise<void> };
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, unknown>,
        ): CoreController;
      };
      const css = [
        "@page{size:420px 560px;margin:32px}",
        "body{margin:0}p,table{margin:0;font:16px/24px Arial,sans-serif}td{padding:0}",
      ];
      const sentence = "The quick brown fox jumps over the lazy dog near the river bank. ";
      const tallText = (label: string) =>
        Array.from({ length: 21 }, (_value, index) => `${label}-${index + 1} ${sentence}`).join("");
      // 480px of the 496px content box: less than one 24px line remains.
      const spacer = '<div style="height:480px"></div>';
      const normalize = (value: string) => value.replace(/\s+/gu, " ").trim();
      const scenarios: readonly { name: string; html: string; experimental?: object }[] = [
        { name: "plain", html: `${spacer}<p>${tallText("plain")}</p>` },
        {
          name: "plain-sequential",
          html: `${spacer}<p>${tallText("sequential")}</p>`,
          experimental: { forceSequentialPlacement: true },
        },
        {
          name: "line-block",
          html: `${spacer}<p>${Array.from(
            { length: 30 },
            (_value, index) => `line-${index + 1} short line`,
          ).join("<br>")}</p>`,
        },
        {
          name: "rich",
          html: `${spacer}<p>${tallText("rich-a")}<em>emphasis</em> ${tallText("rich-b")}</p>`,
        },
        {
          name: "table",
          html: `${spacer}<table><tbody><tr><td>row-1 first<br>second<br>third</td></tr><tr><td>row-2</td></tr></tbody></table>`,
        },
        {
          // After one overflow, every following page-tall paragraph used to pile
          // up on the same overflowing page.
          name: "pile-up",
          html: `${spacer}${Array.from(
            { length: 120 },
            (_value, index) => `<p>${tallText(`pile-${index + 1}`)}</p>`,
          ).join("")}`,
        },
      ];

      const results = [];
      for (const scenario of scenarios) {
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const sourceDocument = new DOMParser().parseFromString(scenario.html, "text/html");
        const controller = core.mountPageDocument(
          host,
          { html: scenario.html },
          { css, ...(scenario.experimental ? { experimental: scenario.experimental } : {}) },
        );
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const flows = [
            ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]"),
          ];
          const overflowingPages = flows
            .map((flow, index) => ({
              index,
              overflows:
                flow.scrollHeight > (flow.parentElement?.getBoundingClientRect().height ?? 0) + 1,
            }))
            .filter(({ overflows }) => overflows)
            .map(({ index }) => index + 1);
          results.push({
            name: scenario.name,
            pageCount: ready.pageCount,
            warningCodes: ready.warnings.map((warning) => warning.code),
            overflowingPages,
            firstPageText: normalize(flows[0]?.textContent ?? ""),
            text: normalize(flows.map((flow) => flow.textContent ?? "").join("")),
            source: normalize(sourceDocument.body.textContent ?? ""),
          });
        } finally {
          await controller.destroy();
          host.replaceChildren();
        }
      }
      return results;
    });

    expect(observations.map(({ name }) => name)).toEqual([
      "plain",
      "plain-sequential",
      "line-block",
      "rich",
      "table",
      "pile-up",
    ]);
    for (const observation of observations) {
      expect(observation.pageCount, observation.name).toBeGreaterThan(1);
      expect(observation.warningCodes, observation.name).not.toContain("PAGE_OVERFLOW");
      expect(observation.overflowingPages, observation.name).toEqual([]);
      expect(observation.firstPageText, observation.name).toBe("");
      expect(observation.text, observation.name).toBe(observation.source);
    }
    expect(observations.find(({ name }) => name === "pile-up")?.pageCount).toBeGreaterThan(120);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
