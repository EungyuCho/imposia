import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

for (const fullDocument of [false, true]) {
  test(`fragments a lead-in table in place${fullDocument ? " from a full document" : ""}`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    await page.goto("/examples/book.html");
    try {
      const observation = await page.evaluate(
        async ({ fullDocument: documentWrapped }) => {
          type Controller = {
            ready: Promise<{
              pageCount: number;
              pages: readonly { bodyText: readonly string[] }[];
            }>;
            destroy(): Promise<void>;
          };
          type Core = {
            mountPageDocument(
              host: HTMLElement,
              source: { html: string },
              options: { css: readonly string[]; page: { margin: string } },
            ): Controller;
          };
          const core = (await import("/packages/core/dist/index.js")) as Core;
          const rows = Array.from(
            { length: 60 },
            (_, index) => `<tr><td>row-${index + 1}</td><td>value-${index + 1}</td></tr>`,
          ).join("");
          const body = `<div style='height:120px'></div><span>Lead-in title</span><table><tbody>${rows}</tbody></table>`;
          const html = documentWrapped ? `<!doctype html><html><body>${body}</body></html>` : body;
          const host = document.body.appendChild(document.createElement("div"));
          const controller = core.mountPageDocument(
            host,
            { html },
            {
              css: [
                "table{width:100%;border-collapse:collapse}td{height:28px;border:1px solid #000}",
              ],
              page: { margin: "56px" },
            },
          );
          try {
            const committed = await controller.ready;
            return {
              pageCount: committed.pageCount,
              first: committed.pages[0]?.bodyText.join(" ") ?? "",
              later: committed.pages
                .slice(1)
                .map((entry) => entry.bodyText.join(" "))
                .join(" "),
            };
          } finally {
            await controller.destroy();
            host.remove();
          }
        },
        { fullDocument },
      );
      expect(observation.pageCount).toBeGreaterThan(1);
      expect(observation.first).toContain("Lead-in title");
      expect(observation.first).toContain("row-1");
      expect(observation.later).toContain("row-60");
    } finally {
      expect(errors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });
}
