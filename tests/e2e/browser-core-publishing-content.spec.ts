import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// Independently authored fixtures map to CSS Content 3 target-* functions, CSS GCPM 3
// string-set/string(), CSS Page Floats 3 footnote/page-float placement, and WHATWG
// fragment/id semantics. No browser-native unsupported-CSS result is used as the oracle.

type PageWarningView = { readonly code: string; readonly message?: string };

type PageMetadataView = {
  readonly number: number;
  readonly bodyText: readonly string[];
};

type PageDocumentView = {
  readonly iframe: HTMLIFrameElement;
  readonly generation: number;
  readonly pageCount: number;
  readonly pages: readonly PageMetadataView[];
  readonly warnings: readonly PageWarningView[];
};

type PageDocumentControllerView = {
  readonly ready: Promise<PageDocumentView>;
  readonly current: PageDocumentView | undefined;
  update(source: { html: string }): Promise<PageDocumentView>;
  destroy(): Promise<void>;
};

type CoreModuleView = {
  mountPageDocument(
    container: HTMLElement,
    source: { html: string },
    options?: Record<string, unknown>,
  ): PageDocumentControllerView;
};

function chromiumOnly(browserName: string): void {
  test.skip(browserName !== "chromium", "Generated publishing content is Chromium-reference only.");
}

test("preserves safe local fragment links without admitting remote resources", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  const remoteRequests: string[] = [];
  const onRequest = (request: { url(): string }) => {
    if (request.url().startsWith("https://blocked.invalid/")) remoteRequests.push(request.url());
  };
  page.on("request", onRequest);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      let controller: PageDocumentControllerView | undefined;
      try {
        controller = core.mountPageDocument(
          host,
          {
            html: `
              <article>
                <p><a id="local-link" href="#target">Continue to target</a></p>
                <img id="remote-image" src="https://blocked.invalid/publisher.png" alt="remote">
                <p id="target">Local target text</p>
              </article>
            `,
          },
          {},
        );
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument;
        const frameWindow = ready.iframe.contentWindow;
        if (frame === null || frameWindow === null) throw new Error("Missing canonical frame.");
        const localLink = frame.querySelector<HTMLAnchorElement>("#local-link");
        localLink?.click();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        return {
          href: localLink?.getAttribute("href") ?? null,
          targetPresent: frame.querySelector("#target") !== null,
          hashAfterClick: frameWindow.location.hash,
          remoteImagePresent: frame.querySelector("#remote-image") !== null,
          frameHasRemoteUrl: frame.documentElement.outerHTML.includes("blocked.invalid"),
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });
    await page.waitForTimeout(0);

    expect(observation.href).toBe("#target");
    expect(observation.targetPresent).toBe(true);
    expect(observation.hashAfterClick).toBe("#target");
    expect(observation.remoteImagePresent).toBe(false);
    expect(observation.frameHasRemoteUrl).toBe(false);
    expect(remoteRequests).toEqual([]);
  } finally {
    page.off("request", onRequest);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("resolves target page and text markers after pagination with a stable repeat", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const css = `
        #page-reference::after { content: target-counter(attr(href), page); }
        #text-reference::after { content: target-text(attr(href), content); }
        p { margin: 0 0 18px; font: 16px/24px Arial, sans-serif; }
      `;
      const filler = Array.from(
        { length: 100 },
        (_value, index) =>
          `<p data-filler="${index}">Filler ${index} keeps the target on a later page.</p>`,
      ).join("");
      const html = `
        <article>
          <p id="page-reference"><a href="#target">Page reference</a></p>
          <p id="text-reference"><a href="#target">Text reference</a></p>
          ${filler}
          <h2 id="target">Stable target text</h2>
        </article>
      `;
      let controller: PageDocumentControllerView | undefined;
      const collect = (document: Document) => {
        const pageFor = (element: Element | null): string | null =>
          element
            ?.closest<HTMLElement>("[data-imposia-page]")
            ?.getAttribute("data-imposia-page-number") ?? null;
        const target = document.querySelector("#target");
        const markers = [...document.querySelectorAll<HTMLElement>("[data-imposia-generated]")].map(
          (element) => ({
            kind: element.getAttribute("data-imposia-generated"),
            text: element.textContent?.trim() ?? "",
            page: pageFor(element),
          }),
        );
        return {
          targetPage: pageFor(target),
          markers,
          pageCount: document.querySelectorAll("[data-imposia-page]").length,
        };
      };
      try {
        const options: Record<string, unknown> = { css: [css] };
        controller = core.mountPageDocument(host, { html }, options);
        const first = await controller.ready;
        const firstFrame = first.iframe.contentDocument;
        if (firstFrame === null) throw new Error("Missing first canonical frame.");
        const firstSnapshot = collect(firstFrame);
        await controller.update({ html });
        const secondFrame = controller.current?.iframe.contentDocument;
        if (secondFrame === null || secondFrame === undefined) {
          throw new Error("Missing repeated canonical frame.");
        }
        return {
          first: firstSnapshot,
          second: collect(secondFrame),
          generation: controller.current?.generation ?? null,
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.first.pageCount).toBeGreaterThan(1);
    expect(Number(observation.first.targetPage)).toBeGreaterThan(1);
    expect(observation.first).toEqual(observation.second);
    const counter = observation.first.markers.find((marker) => marker.kind === "target-counter");
    const text = observation.first.markers.find((marker) => marker.kind === "target-text");
    expect(counter).toMatchObject({ text: observation.first.targetPage });
    expect(text).toMatchObject({ text: "Stable target text" });
    expect(counter?.page).toBe(text?.page);
    expect(observation.generation).toBe(2);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("applies generated-content cascade winners per pseudo-element slot", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const css = `
        .specificity::after { content: target-counter(attr(href), page); }
        a::after { content: target-text(attr(href), content); }
        .source-order::after { content: target-counter(attr(href), page); }
        .source-order::after { content: target-text(attr(href), content); }
        #important::after { content: target-counter(attr(href), page); }
        a.important::after { content: target-text(attr(href), content) !important; }
        a.where-reference::after { content: target-counter(attr(href), page); }
        a:where(#where-reference)::after { content: target-text(attr(href), content); }
        a:is(#is-reference)::after { content: target-counter(attr(href), page); }
        a.is-reference::after { content: target-text(attr(href), content); }
        a.not-case:not(#not-other)::after { content: target-counter(attr(href), page); }
        a.not-case.other::after { content: target-text(attr(href), content); }
        a:has(> #has-child)::after { content: target-counter(attr(href), page); }
        a.has-reference::after { content: target-text(attr(href), content); }
        #same-rule-order::after {
          content: target-counter(attr(href), page);
          content: target-text(attr(href), content);
          border: 1px solid red;
        }
        #same-rule-important::after {
          content: target-text(attr(href), content) !important;
          content: target-counter(attr(href), page);
          background: yellow;
        }
        a { font: 16px/24px Arial, sans-serif; }
      `;
      let controller: PageDocumentControllerView | undefined;
      try {
        controller = core.mountPageDocument(
          host,
          {
            html: `
              <article>
                <p><a id="specificity" class="specificity" href="#target">Specificity</a></p>
                <p><a id="source-order" class="source-order" href="#target">Source order</a></p>
                <p><a id="important" class="important" href="#target">Important</a></p>
                <p><a id="where-reference" class="where-reference" href="#target">Where</a></p>
                <p><a id="is-reference" class="is-reference" href="#target">Is</a></p>
                <p><a id="not-reference" class="not-case other" href="#target">Not</a></p>
                <p><a id="has-reference" class="has-reference" href="#target"><span id="has-child">Has</span></a></p>
                <p><a id="same-rule-order" href="#target">Same rule order</a></p>
                <p><a id="same-rule-important" href="#target">Same rule important</a></p>
                <h2 id="target">Target text</h2>
              </article>
            `,
          },
          { css: [css] },
        );
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument;
        if (frame === null) throw new Error("Missing canonical frame.");
        return [
          "specificity",
          "source-order",
          "important",
          "where-reference",
          "is-reference",
          "not-reference",
          "has-reference",
          "same-rule-order",
          "same-rule-important",
        ].map((id) => {
          const host = frame.querySelector(`#${id}`);
          return {
            id,
            markers: [
              ...(host?.querySelectorAll<HTMLElement>("[data-imposia-generated]") ?? []),
            ].map((marker) => ({
              kind: marker.getAttribute("data-imposia-generated"),
              text: marker.textContent?.trim() ?? "",
              style: marker.getAttribute("style"),
            })),
          };
        });
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation).toEqual([
      { id: "specificity", markers: [{ kind: "target-counter", text: "1", style: null }] },
      { id: "source-order", markers: [{ kind: "target-text", text: "Target text", style: null }] },
      { id: "important", markers: [{ kind: "target-text", text: "Target text", style: null }] },
      { id: "where-reference", markers: [{ kind: "target-counter", text: "1", style: null }] },
      { id: "is-reference", markers: [{ kind: "target-counter", text: "1", style: null }] },
      { id: "not-reference", markers: [{ kind: "target-counter", text: "1", style: null }] },
      { id: "has-reference", markers: [{ kind: "target-counter", text: "1", style: null }] },
      {
        id: "same-rule-order",
        markers: [{ kind: "target-text", text: "Target text", style: "border: 1px solid red" }],
      },
      {
        id: "same-rule-important",
        markers: [{ kind: "target-text", text: "Target text", style: "background: yellow" }],
      },
    ]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("reports missing and duplicate fragment references deterministically without crashing", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const options: Record<string, unknown> = {
        css: [
          "#missing-reference::after{content:target-counter(attr(href),page)}",
          "#duplicate-reference::after{content:target-text(attr(href),content)}",
        ],
      };
      let controller: PageDocumentControllerView | undefined;
      try {
        controller = core.mountPageDocument(
          host,
          {
            html: `
              <article>
                <p id="missing-reference"><a href="#does-not-exist">Missing</a></p>
                <p id="duplicate-reference"><a href="#duplicate-target">Duplicate</a></p>
                <h2 id="duplicate-target">First duplicate target</h2>
                <h2 id="duplicate-target">Second duplicate target</h2>
              </article>
            `,
          },
          options,
        );
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument;
        if (frame === null) throw new Error("Missing canonical frame.");
        return {
          warningCodes: ready.warnings.map((warning) => warning.code),
          markers: [...frame.querySelectorAll<HTMLElement>("[data-imposia-generated]")].map(
            (element) => ({
              kind: element.getAttribute("data-imposia-generated"),
              text: element.textContent?.trim() ?? "",
            }),
          ),
          pageCount: ready.pageCount,
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.pageCount).toBeGreaterThan(0);
    expect(observation.warningCodes).toEqual(["REFERENCE_MISSING", "REFERENCE_DUPLICATE"]);
    expect(observation.markers).toEqual([
      { kind: "target-counter", text: "" },
      { kind: "target-text", text: "First duplicate target" },
    ]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("populates margin boxes from text and attributes with page-scoped string values", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const css = `
        @page {
          @top-left { content: string(chapter, first); }
          @top-center { content: string(chapter, start); }
          @bottom-left { content: string(chapter, last); }
          @bottom-center { content: string(issue, last); }
        }
        h1[data-chapter] { string-set: chapter content(); }
        [data-issue] { string-set: issue attr(data-issue); }
        p { margin: 0 0 16px; font: 16px/24px Arial, sans-serif; }
      `;
      let controller: PageDocumentControllerView | undefined;
      try {
        const options: Record<string, unknown> = { css: [css] };
        controller = core.mountPageDocument(
          host,
          {
            html: `
              <article>
                <h1 data-chapter="alpha">Alpha chapter</h1>
                <p>Opening context remains on the first page.</p>
                <p style="break-before: page">Page two opening context.</p>
                <h1 data-chapter="beta" data-issue="Issue Two">Beta chapter</h1>
                <p data-issue="Issue Two">The attribute source updates the issue string.</p>
              </article>
            `,
          },
          options,
        );
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument;
        if (frame === null) throw new Error("Missing canonical frame.");
        const pages = [...frame.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
          (page) => ({
            number: page.getAttribute("data-imposia-page-number"),
            boxes: Object.fromEntries(
              [...page.querySelectorAll<HTMLElement>("[data-imposia-margin-box]")].map((box) => [
                box.getAttribute("data-imposia-margin-box"),
                box.textContent?.trim() ?? "",
              ]),
            ),
          }),
        );
        return { pages, warningCodes: ready.warnings.map((warning) => warning.code) };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.warningCodes).toEqual([]);
    expect(observation.pages.length).toBeGreaterThanOrEqual(2);
    const firstPage = observation.pages[0];
    const secondPage = observation.pages[1];
    expect(firstPage).toMatchObject({
      boxes: {
        "top-left": "Alpha chapter",
        "top-center": "Alpha chapter",
        "bottom-left": "Alpha chapter",
      },
    });
    expect(secondPage).toMatchObject({
      boxes: {
        "top-left": "Beta chapter",
        "top-center": "Alpha chapter",
        "bottom-left": "Beta chapter",
        "bottom-center": "Issue Two",
      },
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("opts into ordered bottom footnotes and keeps calls after their anchors", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const options: Record<string, unknown> = {
        css: ["[data-footnote]{float:footnote}"],
      };
      Reflect.set(options, "experimental", { footnotes: true });
      let controller: PageDocumentControllerView | undefined;
      const indexOf = (document: Document, element: Element | null): number =>
        element === null ? -1 : [...document.querySelectorAll("*")].indexOf(element);
      try {
        controller = core.mountPageDocument(
          host,
          {
            html: `
              <article>
                <p><span id="anchor-one" data-footnote-anchor="one">Anchor one.</span></p>
                <p><span id="anchor-two" data-footnote-anchor="two">Anchor two.</span></p>
                <aside id="note-one" data-footnote="one">First footnote body.</aside>
                <aside id="note-two" data-footnote="two">Second footnote body.</aside>
              </article>
            `,
          },
          options,
        );
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument;
        if (frame === null) throw new Error("Missing canonical frame.");
        const calls = [...frame.querySelectorAll<HTMLElement>("[data-imposia-footnote-call]")];
        const markers = [...frame.querySelectorAll<HTMLElement>("[data-imposia-footnote-marker]")];
        const notes = [...frame.querySelectorAll<HTMLElement>("[data-imposia-footnote]")];
        const area = frame.querySelector<HTMLElement>("[data-imposia-footnote-area]");
        const page = area?.closest<HTMLElement>("[data-imposia-page]");
        const areaRect = area?.getBoundingClientRect();
        const pageRect = page?.getBoundingClientRect();
        return {
          callTexts: calls.map((element) => element.textContent?.trim() ?? ""),
          markerTexts: markers.map((element) => element.textContent?.trim() ?? ""),
          noteTexts: notes.map((element) => element.textContent?.trim() ?? ""),
          areaPresent: area !== null,
          areaWithinPage:
            areaRect !== undefined &&
            pageRect !== undefined &&
            areaRect.top >= pageRect.top - 1 &&
            areaRect.bottom <= pageRect.bottom + 1,
          areaInLowerHalf:
            areaRect !== undefined &&
            pageRect !== undefined &&
            areaRect.top >= pageRect.top + pageRect.height / 2,
          anchorIndexes: [
            indexOf(frame, frame.querySelector("#anchor-one")),
            indexOf(frame, frame.querySelector("#anchor-two")),
          ],
          callIndexes: calls.map((element) => indexOf(frame, element)),
          warningCodes: ready.warnings.map((warning) => warning.code),
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.warningCodes).toEqual([]);
    expect(observation.callTexts).toEqual(["1", "2"]);
    expect(observation.markerTexts).toEqual(["1", "2"]);
    expect(observation.noteTexts).toHaveLength(2);
    expect(observation.noteTexts[0]).toContain("First footnote body.");
    expect(observation.noteTexts[1]).toContain("Second footnote body.");
    expect(observation.areaPresent).toBe(true);
    expect(observation.areaWithinPage).toBe(true);
    expect(observation.areaInLowerHalf).toBe(true);
    expect(
      observation.callIndexes.every(
        (callIndex, index) =>
          callIndex > (observation.anchorIndexes[index] ?? Number.POSITIVE_INFINITY),
      ),
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("falls back oversized and disabled footnotes to normal flow with warnings", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const source = (id: string, size: string) => ({
        html: `
          <article>
            <p>Anchor before ${id}.</p>
            <aside id="${id}" data-footnote="${id}" style="float: footnote;${size}">
              ${id} footnote body
            </aside>
          </article>
        `,
      });
      const run = async (options: Record<string, unknown>, html: { html: string }) => {
        let controller: PageDocumentControllerView | undefined;
        try {
          controller = core.mountPageDocument(host, html, options);
          const ready = await controller.ready;
          const frame = ready.iframe.contentDocument;
          if (frame === null) throw new Error("Missing canonical frame.");
          const note = frame.querySelector<HTMLElement>("[data-footnote]");
          return {
            normalFlow: note !== null && note.closest("[data-imposia-page-flow]") !== null,
            areaPresent: frame.querySelector("[data-imposia-footnote-area]") !== null,
            markerCount: frame.querySelectorAll("[data-imposia-footnote-marker]").length,
            warningCodes: ready.warnings.map((warning) => warning.code),
          };
        } finally {
          await controller?.destroy();
          host.replaceChildren();
        }
      };
      return {
        disabled: await run({}, source("disabled-note", "")),
        oversized: await run(
          (() => {
            const options: Record<string, unknown> = {};
            Reflect.set(options, "experimental", { footnotes: true });
            return options;
          })(),
          source("oversized-note", "height: 900px"),
        ),
      };
    });

    expect(observation.disabled.normalFlow).toBe(true);
    expect(observation.disabled.areaPresent).toBe(false);
    expect(observation.disabled.markerCount).toBe(0);
    expect(observation.disabled.warningCodes).toContain("FOOTNOTE_DEFERRED");
    expect(observation.oversized.normalFlow).toBe(true);
    expect(observation.oversized.areaPresent).toBe(false);
    expect(observation.oversized.markerCount).toBe(0);
    expect(observation.oversized.warningCodes).toContain("FOOTNOTE_DEFERRED");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("opts into page top and bottom floats without moving them before anchors", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const options: Record<string, unknown> = {};
      Reflect.set(options, "experimental", { pageFloats: true });
      let controller: PageDocumentControllerView | undefined;
      const pageNumberFor = (element: Element | null): number =>
        Number(
          element
            ?.closest<HTMLElement>("[data-imposia-page]")
            ?.getAttribute("data-imposia-page-number") ?? 0,
        );
      try {
        controller = core.mountPageDocument(
          host,
          {
            html: `
              <article>
                <p id="top-anchor">Top anchor.</p>
                <aside id="top-source" data-float-id="top" style="float: top; float-reference: page">Top float</aside>
                <p id="bottom-anchor">Bottom anchor.</p>
                <aside id="bottom-source" data-float-id="bottom" style="float: bottom; float-reference: page">Bottom float</aside>
              </article>
            `,
          },
          options,
        );
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument;
        if (frame === null) throw new Error("Missing canonical frame.");
        const floats = [...frame.querySelectorAll<HTMLElement>("[data-imposia-page-float]")];
        return {
          floats: floats.map((element) => ({
            kind: element.getAttribute("data-imposia-page-float"),
            text: element.textContent?.trim() ?? "",
            page: pageNumberFor(element),
          })),
          anchorPages: {
            top: pageNumberFor(frame.querySelector("#top-anchor")),
            bottom: pageNumberFor(frame.querySelector("#bottom-anchor")),
          },
          warningCodes: ready.warnings.map((warning) => warning.code),
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.warningCodes).toEqual([]);
    expect(observation.floats).toEqual([
      { kind: "top", text: "Top float", page: expect.any(Number) },
      { kind: "bottom", text: "Bottom float", page: expect.any(Number) },
    ]);
    expect(observation.anchorPages.top).toBeGreaterThan(0);
    expect(observation.anchorPages.bottom).toBeGreaterThan(0);
    expect(observation.floats[0]?.page).toBeGreaterThanOrEqual(observation.anchorPages.top);
    expect(observation.floats[1]?.page).toBeGreaterThanOrEqual(observation.anchorPages.bottom);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("falls back unsupported page floats to source flow with an explicit warning", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      let controller: PageDocumentControllerView | undefined;
      try {
        controller = core.mountPageDocument(
          host,
          {
            html: `
              <article>
                <p id="float-anchor">Float anchor.</p>
                <aside id="fallback-float" style="float: top; float-reference: page">Fallback float</aside>
              </article>
            `,
          },
          {},
        );
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument;
        if (frame === null) throw new Error("Missing canonical frame.");
        const float = frame.querySelector<HTMLElement>("#fallback-float");
        return {
          normalFlow: float !== null && float.closest("[data-imposia-page-flow]") !== null,
          generatedFloatCount: frame.querySelectorAll("[data-imposia-page-float]").length,
          warningCodes: ready.warnings.map((warning) => warning.code),
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.normalFlow).toBe(true);
    expect(observation.generatedFloatCount).toBe(0);
    expect(observation.warningCodes).toContain("PAGE_FLOAT_FALLBACK");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("bounds non-convergent generated content and retains the previous committed generation", async ({
  page,
  browserName,
}) => {
  chromiumOnly(browserName);
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const modulePath = "/packages/core/dist/index.js";
      const core = (await import(modulePath)) as CoreModuleView;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const options: Record<string, unknown> = {
        css: [
          "#unstable-reference::after{content:target-counter(attr(href),page);display:block;font:72px/72px Arial,sans-serif}",
          "p{margin:0;font:16px/24px Arial,sans-serif}",
        ],
      };
      Reflect.set(options, "limits", { maxLayoutPasses: 2 });
      const stableHtml = "<article><p>Committed generation</p></article>";
      const unstableFiller = Array.from(
        { length: 46 },
        (_value, index) => `<p>${index} boundary filler text for a moving target.</p>`,
      ).join("");
      const unstableHtml = `
        <article>
          <p id="unstable-reference"><a href="#unstable-target">A moving target</a></p>
          ${unstableFiller}
          <h2 id="unstable-target">Target text changes the first layout signature.</h2>
        </article>
      `;
      let controller: PageDocumentControllerView | undefined;
      try {
        controller = core.mountPageDocument(host, { html: stableHtml }, options);
        const first = await controller.ready;
        const firstFrame = first.iframe;
        let failureCode: string | null = null;
        let updateWarningCodes: readonly string[] = [];
        try {
          const updated = await controller.update({ html: unstableHtml });
          updateWarningCodes = updated.warnings.map((warning) => warning.code);
        } catch (error: unknown) {
          if (typeof error === "object" && error !== null) {
            const code = Reflect.get(error, "code");
            if (typeof code === "string") failureCode = code;
          }
        }
        const current = controller.current;
        return {
          failureCode,
          updateWarningCodes,
          currentGeneration: current?.generation ?? null,
          sameIframe: current?.iframe === firstFrame,
          currentText: current?.iframe.contentDocument?.body.textContent ?? "",
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(
      observation.failureCode === "LAYOUT_NON_CONVERGENT" ||
        observation.updateWarningCodes.includes("LAYOUT_NON_CONVERGENT"),
    ).toBe(true);
    expect(observation.currentGeneration).toBe(1);
    expect(observation.sameIframe).toBe(true);
    expect(observation.currentText).toContain("Committed generation");
    expect(observation.currentText).not.toContain("Target text changes the first layout signature");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
