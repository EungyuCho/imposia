import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("finalizes live pages in declaration order and retains split-table provenance", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Controller = {
        ready: Promise<{ iframe: HTMLIFrameElement; pageCount: number }>;
        destroy(): Promise<void>;
      };
      type Core = {
        mountPageDocument(
          host: HTMLElement,
          source: { html: string },
          options: { css?: readonly string[]; extensions?: readonly object[] },
        ): Controller;
      };
      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const events: string[] = [];
      let controller: Controller | undefined;
      try {
        const rows = Array.from(
          { length: 96 },
          (_, index) => `<tr><td>row-${index + 1}</td><td>stable content ${index + 1}</td></tr>`,
        ).join("");
        controller = core.mountPageDocument(
          host,
          {
            html: `<table><thead><tr><th>First</th><th>Second</th></tr></thead><tbody>${rows}</tbody></table>`,
          },
          {
            css: [
              "table{width:100%;border-collapse:collapse}td,th{height:24px;border:1px solid #000}",
            ],
            extensions: [
              {
                name: "acme/finalize-first",
                finalizePage(input: {
                  number: number;
                  element: HTMLElement;
                  tableFragments: readonly {
                    origin: Element;
                    fragment: Element;
                    index: number;
                  }[];
                }) {
                  events.push(
                    `first:${input.number}:${input.element.isConnected}:${input.element.getBoundingClientRect().width > 0}:${input.tableFragments.map((fragment) => `${fragment.origin.localName}/${fragment.fragment.localName}/${fragment.index}`).join(",")}`,
                  );
                  input.element.setAttribute("data-finalized-by-first", String(input.number));
                },
              },
              {
                name: "acme/finalize-second",
                finalizePage(input: { number: number; element: HTMLElement }) {
                  events.push(
                    `second:${input.number}:${input.element.getAttribute("data-finalized-by-first")}`,
                  );
                  input.element.setAttribute("data-finalized-by-second", String(input.number));
                },
              },
            ],
          },
        );
        const committed = await controller.ready;
        const frameDocument = committed.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical iframe document.");
        return {
          pageCount: committed.pageCount,
          events,
          committedMarkers: Array.from(frameDocument.querySelectorAll("[data-imposia-page]")).map(
            (pageElement) => ({
              first: pageElement.getAttribute("data-finalized-by-first"),
              second: pageElement.getAttribute("data-finalized-by-second"),
            }),
          ),
        };
      } finally {
        await controller?.destroy();
        host.remove();
      }
    });

    expect(observation.pageCount).toBeGreaterThan(1);
    expect(observation.events).toHaveLength(observation.pageCount * 2);
    for (let index = 0; index < observation.pageCount; index += 1) {
      expect(observation.events[index * 2]).toContain(`first:${index + 1}:true:true:`);
      expect(observation.events[index * 2 + 1]).toBe(`second:${index + 1}:${index + 1}`);
      expect(observation.committedMarkers[index]).toEqual({
        first: String(index + 1),
        second: String(index + 1),
      });
    }
    expect(observation.events.some((event) => event.includes("table/table/1"))).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("finalizes intentionally inserted blank pages even when decorations are disabled", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Controller = {
        ready: Promise<{ iframe: HTMLIFrameElement; pageCount: number }>;
        destroy(): Promise<void>;
      };
      type Core = {
        mountPageDocument(
          host: HTMLElement,
          source: { html: string },
          options: { decorateBlankPages: boolean; extensions: readonly object[] },
        ): Controller;
      };
      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const finalized: Array<{ number: number; blank: boolean }> = [];
      let controller: Controller | undefined;
      try {
        controller = core.mountPageDocument(
          host,
          {
            html: '<section>FIRST</section><section style="break-before:right">SECOND</section>',
          },
          {
            decorateBlankPages: false,
            extensions: [
              {
                name: "acme/finalize-blank",
                finalizePage(input: { number: number; blank: boolean; element: HTMLElement }) {
                  finalized.push({ number: input.number, blank: input.blank });
                  input.element.setAttribute("data-finalized", String(input.blank));
                },
              },
            ],
          },
        );
        const committed = await controller.ready;
        const frameDocument = committed.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical iframe document.");
        return {
          finalized,
          committed: Array.from(frameDocument.querySelectorAll("[data-imposia-page]")).map(
            (pageElement) => ({
              finalized: pageElement.getAttribute("data-finalized"),
            }),
          ),
        };
      } finally {
        await controller?.destroy();
        host.remove();
      }
    });

    expect(observation.finalized).toEqual([
      { number: 1, blank: false },
      { number: 2, blank: true },
      { number: 3, blank: false },
    ]);
    expect(observation.committed).toEqual([
      { finalized: "false" },
      { finalized: "true" },
      { finalized: "false" },
    ]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("rejects invalid finalizePage declarations and returns atomically", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Controller = { ready: Promise<unknown>; destroy(): Promise<void> };
      type Core = {
        mountPageDocument(
          host: HTMLElement,
          source: { html: string },
          options: { extensions: readonly object[] },
        ): Controller;
      };
      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const rejected = async (extensions: readonly object[]): Promise<string> => {
        const controller = core.mountPageDocument(host, { html: "<p>atomic</p>" }, { extensions });
        try {
          await controller.ready;
          return "fulfilled";
        } catch (error: unknown) {
          return error instanceof Error ? error.message : "unknown";
        } finally {
          await controller.destroy();
        }
      };
      try {
        return {
          invalidDeclaration: await rejected([
            { name: "acme/invalid-finalizer", finalizePage: "not-a-function" },
          ]),
          invalidReturn: await rejected([
            { name: "acme/invalid-return", finalizePage: () => "unexpected" },
          ]),
        };
      } finally {
        host.remove();
      }
    });
    expect(observation.invalidDeclaration).toContain(
      'finalizePage for "acme/invalid-finalizer" must be a function.',
    );
    expect(observation.invalidReturn).toContain(
      'finalizePage for "acme/invalid-return" must not return a value.',
    );
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
