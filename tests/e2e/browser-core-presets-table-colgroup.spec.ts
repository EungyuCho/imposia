import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("keeps authored colgroups and opt-in freezes continuation widths", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Controller = { ready: Promise<{ iframe: HTMLIFrameElement }>; destroy(): Promise<void> };
      type Extension = { name: string; finalizePage: unknown };
      type Core = {
        createTableColgroupExtension(): Extension;
        mountPageDocument(
          host: HTMLElement,
          source: { html: string },
          options: { css: readonly string[]; extensions?: readonly Extension[] },
        ): Controller;
      };
      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const rows = Array.from(
        { length: 96 },
        (_, index) =>
          `<tr><td>first column ${index + 1}</td><td>second column ${index + 1}</td><td>third column ${index + 1}</td></tr>`,
      ).join("");
      const css = [
        "table{width:100%;border-collapse:collapse}td,th{height:24px;border:1px solid #000}",
      ];
      let authored: Controller | undefined;
      let preset: Controller | undefined;
      let partial: Controller | undefined;
      const partialDebug: string[] = [];
      try {
        authored = core.mountPageDocument(
          host,
          {
            html: `<table><colgroup><col style='width:20%'><col style='width:30%'><col style='width:50%'></colgroup><tbody>${rows}</tbody></table>`,
          },
          { css },
        );
        const authoredDocument = await authored.ready;
        const authoredTables =
          authoredDocument.iframe.contentDocument?.querySelectorAll("table") ?? [];
        preset = core.mountPageDocument(
          host,
          { html: `<table><tbody>${rows}</tbody></table>` },
          { css, extensions: [core.createTableColgroupExtension()] },
        );
        const presetDocument = await preset.ready;
        const presetTables = Array.from(
          presetDocument.iframe.contentDocument?.querySelectorAll("table") ?? [],
        );
        partial = core.mountPageDocument(
          host,
          {
            html: `<table><colgroup><col style='width:30%'><col><col></colgroup><tbody>${rows}</tbody></table>`,
          },
          {
            css,
            extensions: [
              core.createTableColgroupExtension(),
              {
                name: "acme/partial-observer",
                finalizePage(input: { tableFragments: readonly { fragment: Element }[] }) {
                  for (const { fragment } of input.tableFragments) {
                    partialDebug.push(
                      Array.from(
                        fragment.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col"),
                      )
                        .map((column) => column.style.width)
                        .join(","),
                    );
                  }
                },
              },
            ],
          },
        );
        const partialDocument = await partial.ready;
        const partialTables = Array.from(
          partialDocument.iframe.contentDocument?.querySelectorAll("table") ?? [],
        );
        const extension = core.createTableColgroupExtension();
        return {
          extensionName: extension.name,
          hasFinalizePage: typeof extension.finalizePage === "function",
          authoredContinuationCount: Array.from(authoredTables)
            .slice(1)
            .filter((table) => table.querySelector(":scope > colgroup") !== null).length,
          authoredTableCount: authoredTables.length,
          presetTableCount: presetTables.length,
          synthesized: presetTables.slice(1).map((table) => {
            const group = table.querySelector<HTMLElement>(
              ":scope > colgroup[data-imposia-synthesized-colgroup]",
            );
            return group === null
              ? []
              : Array.from(group.querySelectorAll<HTMLElement>(":scope > col")).map(
                  (col) => col.style.width,
                );
          }),
          partialTableCount: partialTables.length,
          partialDebug,
        };
      } finally {
        await authored?.destroy();
        await preset?.destroy();
        await partial?.destroy();
        host.remove();
      }
    });
    expect(observation.extensionName).toBe("imposia/table-colgroup");
    expect(observation.hasFinalizePage).toBe(true);
    expect(observation.authoredTableCount).toBeGreaterThan(1);
    expect(observation.authoredContinuationCount).toBe(observation.authoredTableCount - 1);
    expect(observation.presetTableCount).toBeGreaterThan(1);
    expect(
      observation.synthesized.every(
        (widths) => widths.length === 3 && widths.every((width) => width.endsWith("px")),
      ),
    ).toBe(true);
    expect(observation.partialTableCount).toBeGreaterThan(1);
    expect(
      observation.partialDebug.every((widths) => {
        const columns = widths.split(",");
        return (
          columns.length === 3 &&
          columns[0] === "30%" &&
          columns.slice(1).every((width) => width.endsWith("px"))
        );
      }),
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
