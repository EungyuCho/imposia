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
      const scenarios: readonly { name: string; html: string }[] = [
        { name: "plain", html: `${spacer}<p>${tallText("plain")}</p>` },
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
        const controller = core.mountPageDocument(host, { html: scenario.html }, { css });
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

test("keeps the cascade of mid-flow styles stable while pages are measured", async ({
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
      type Controller = { ready: Promise<PageDocument>; destroy(): Promise<void> };
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, unknown>,
        ): Controller;
        mountPublication(
          container: HTMLElement,
          snapshot: {
            metadata: { title: string; language: string };
            entries: readonly { id: string; title: string; html: string }[];
          },
          options: Record<string, unknown>,
        ): Controller;
      };
      const css = ["@page{size:420px 560px;margin:32px}", "body{margin:0}"];
      const sentence = "The quick brown fox jumps over the lazy dog near the river bank. ";
      // Each style uses the same selector as the others, so whichever comes last
      // in tree order wins. Placing them one at a time used to reverse that order
      // while earlier pages were measured.
      const style = (index: number) =>
        `<style>p{margin:0;font:16px/${20 + (index % 3) * 4}px Arial,sans-serif}</style>`;
      const sections = Array.from(
        { length: 60 },
        (_value, index) =>
          `${index % 10 === 5 ? style(index) : ""}<p>section-${index + 1} ${sentence.repeat(4)}</p>`,
      );
      const scenarios: readonly {
        name: string;
        mount: (host: HTMLElement) => Controller;
        source: string;
      }[] = [
        {
          name: "document",
          mount: (host) =>
            core.mountPageDocument(host, { html: `${style(0)}${sections.join("")}` }, { css }),
          source: `${style(0)}${sections.join("")}`,
        },
        {
          name: "publication",
          mount: (host) =>
            core.mountPublication(
              host,
              {
                metadata: { title: "Styles", language: "en" },
                entries: Array.from({ length: 12 }, (_value, index) => ({
                  id: `entry-${index + 1}`,
                  title: `Entry ${index + 1}`,
                  html: `${style(index)}${sections.slice(index * 5, index * 5 + 5).join("")}`,
                })),
              },
              { css },
            ),
          source: Array.from(
            { length: 12 },
            (_value, index) =>
              `${style(index)}${sections.slice(index * 5, index * 5 + 5).join("")}`,
          ).join(""),
        },
      ];
      const visibleText = (root: Element) => {
        const copy = root.cloneNode(true) as Element;
        for (const element of copy.querySelectorAll("style,template")) element.remove();
        return (copy.textContent ?? "").replace(/\s+/gu, " ").trim();
      };

      const results = [];
      for (const scenario of scenarios) {
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const controller = scenario.mount(host);
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const flows = [
            ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page-flow]"),
          ];
          const sourceBody = new DOMParser().parseFromString(scenario.source, "text/html").body;
          results.push({
            name: scenario.name,
            pageCount: ready.pageCount,
            warningCodes: ready.warnings.map((warning) => warning.code),
            overflowingPages: flows
              .map((flow, index) => ({
                index,
                overflows:
                  flow.scrollHeight > (flow.parentElement?.getBoundingClientRect().height ?? 0) + 1,
              }))
              .filter(({ overflows }) => overflows)
              .map(({ index }) => index + 1),
            text: flows.map(visibleText).join(" ").replace(/\s+/gu, " ").trim(),
            source: visibleText(sourceBody),
          });
        } finally {
          await controller.destroy();
          host.replaceChildren();
        }
      }
      return results;
    });

    expect(observations.map(({ name }) => name)).toEqual(["document", "publication"]);
    for (const observation of observations) {
      expect(observation.pageCount, observation.name).toBeGreaterThan(1);
      expect(observation.warningCodes, observation.name).not.toContain("PAGE_OVERFLOW");
      expect(observation.overflowingPages, observation.name).toEqual([]);
      expect(observation.text, observation.name).toBe(observation.source);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("reserves running header and footer rows on every split path", async ({
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
      const header = "<template data-page-header><span>Field Notes</span></template>";
      const footer =
        "<template data-page-footer><span>{{pageNumber}} / {{totalPages}}</span></template>";
      const decorations = { both: `${header}${footer}`, header, footer };
      const style = `<style>
        body { font: 11pt/1.55 Georgia, serif; }
        h1 { font-size: 26pt; line-height: 1.1; margin: 0 0 14pt; }
        h2 { font: 600 12pt/1.3 system-ui, sans-serif; margin: 16pt 0 6pt; }
        p { margin: 0 0 8pt; }
        .kicker { font: 600 8pt system-ui; margin-bottom: 6pt; }
        table { width: 100%; border-collapse: collapse; font: 9pt/1.4 system-ui, sans-serif; margin: 8pt 0; }
        th, td { padding: 4pt 6pt; border-bottom: 1px solid #e3e3df; }
        .figure { break-inside: avoid; box-sizing: border-box; height: 150pt; margin: 10pt 0; padding: 132pt 8pt 0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; }
        .flex { display: flex; flex-direction: column; }
      </style>`;
      const sentence = "The page is a box with margins and the flow fills it until it does not. ";
      // Every paragraph, table row, line, and item carries one unique marker so
      // the committed flow can be checked for exactly-once, in-order content.
      const paragraphs = (label: string, count: number, sentences: number) =>
        Array.from(
          { length: count },
          (_value, index) => `<p>PARA-${label}${index + 1} ${sentence.repeat(sentences)}</p>`,
        ).join("");
      const items = (label: string, count: number, open: string, close: string) =>
        Array.from(
          { length: count },
          (_value, index) => `${open}${label}-${String(index + 1).padStart(2, "0")}${close}`,
        ).join("");
      const shape = (body: string) =>
        `<h1>The shape of a page</h1>${paragraphs("A", 4, 6)}<h2>Tables that break cleanly</h2>${body}${paragraphs("B", 3, 6)}`;
      const scenarios: readonly { name: string; html: string }[] = [
        {
          name: "table",
          html: shape(
            `<table><thead><tr><th>Part</th><th>Length</th><th>Kind</th></tr></thead><tbody>${items(
              "ROW",
              26,
              "<tr><td>",
              "</td><td>12 pt</td><td>note</td></tr>",
            )}</tbody></table>`,
          ),
        },
        // A break-inside:avoid block before the page break once let the
        // following paragraphs run into the footer row. The trailing lengths
        // vary so at least one variant fills page one to its last line.
        ...[6, 7, 8, 9, 10, 11].map((sentences) => ({
          name: `chapter-figure-${sentences}`,
          html: `<section class="chapter"><p class="kicker">Chapter 1</p><h1>Why pages still matter</h1>${paragraphs(
            "A",
            5,
            4,
          )}<div class="figure">Figure 1</div>${paragraphs("B", 3, sentences)}</section>`,
        })),
        { name: "paragraphs", html: shape(paragraphs("C", 6, 6)) },
        { name: "line-block", html: shape(`<p>${items("LINE", 60, "", "<br>")}</p>`) },
        { name: "list", html: shape(`<ul>${items("ITEM", 60, "<li>", "</li>")}</ul>`) },
        {
          name: "grid",
          html: shape(`<div class="grid">${items("CELL", 60, "<div>", "</div>")}</div>`),
        },
        {
          name: "flex",
          html: shape(`<div class="flex">${items("FLEX", 60, "<div>", "</div>")}</div>`),
        },
      ];
      const markersIn = (text: string) => text.match(/PARA-[A-Z]\d+|[A-Z]{3,}-\d{2}/gu) ?? [];

      const results = [];
      for (const [variant, decoration] of Object.entries(decorations)) {
        for (const scenario of scenarios) {
          const host = document.createElement("div");
          document.body.replaceChildren(host);
          const html = `${decoration}${style}${scenario.html}`;
          const controller = core.mountPageDocument(
            host,
            { html },
            { page: { size: "A4", margin: "18mm" } },
          );
          try {
            const ready = await controller.ready;
            const frameDocument = ready.iframe.contentDocument;
            if (frameDocument === null) throw new Error("Missing canonical frame document.");
            const pages = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
            const flows = pages.map((pageElement) => {
              const flow = pageElement.querySelector<HTMLElement>("[data-imposia-page-flow]");
              if (flow === null) throw new Error("Missing page flow.");
              return flow;
            });
            const rowHeight = (pageElement: HTMLElement, selector: string) =>
              pageElement.querySelector(selector)?.getBoundingClientRect().height ?? 0;
            results.push({
              name: `${variant}/${scenario.name}`,
              pageCount: ready.pageCount,
              warningCodes: ready.warnings.map((warning) => warning.code),
              decorationHeights: pages.map(
                (pageElement) =>
                  rowHeight(pageElement, "[data-imposia-page-header]") +
                  rowHeight(pageElement, "[data-imposia-page-footer]"),
              ),
              overflows: pages.map(
                (pageElement, index) =>
                  (flows[index]?.scrollHeight ?? 0) -
                  Math.round(rowHeight(pageElement, "[data-imposia-page-content]")),
              ),
              markers: markersIn(flows.map((flow) => flow.textContent ?? "").join(" ")),
              sourceMarkers: markersIn(scenario.html),
            });
          } finally {
            await controller.destroy();
            host.replaceChildren();
          }
        }
      }
      return results;
    });

    expect(observations).toHaveLength(36);
    for (const observation of observations) {
      expect(observation.pageCount, observation.name).toBeGreaterThan(1);
      expect(observation.warningCodes, observation.name).not.toContain("PAGE_OVERFLOW");
      for (const height of observation.decorationHeights) {
        expect(height, observation.name).toBeGreaterThan(0);
      }
      for (const overflow of observation.overflows) {
        expect(overflow, observation.name).toBeLessThanOrEqual(0);
      }
      expect(observation.sourceMarkers.length, observation.name).toBeGreaterThan(7);
      expect(observation.markers, observation.name).toEqual(observation.sourceMarkers);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("reports extension decorations that shrink a filled page instead of clipping silently", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser fragmentation is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type PageDocument = {
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
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const html = Array.from(
        { length: 60 },
        (_value, index) =>
          `<p style="margin:0;font:16px/24px Arial,sans-serif">extension-fill-${index + 1}</p>`,
      ).join("");
      // Extension decorations run after pagination by contract, so Core cannot
      // reserve their height; it must report the overflow instead.
      const controller = core.mountPageDocument(
        host,
        { html },
        {
          page: { size: "A4", margin: "18mm" },
          extensions: [
            {
              name: "test/tall-header",
              decoratePage: () => ({ headerHtml: '<div style="height:96px">Late header</div>' }),
            },
          ],
        },
      );
      try {
        const ready = await controller.ready;
        return {
          pageCount: ready.pageCount,
          warningCodes: ready.warnings.map((warning) => warning.code),
        };
      } finally {
        await controller.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.pageCount).toBeGreaterThan(1);
    expect(observation.warningCodes).toContain("PAGE_OVERFLOW");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
