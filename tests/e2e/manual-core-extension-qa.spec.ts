import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test.describe("manual Core extension contract QA (Chromium)", () => {
  test.beforeEach(({ browserName }) =>
    test.skip(browserName !== "chromium", "Chromium-reference Core."),
  );

  test("runs transforms in declaration order and sanitizes output", async ({ page }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, "chromium");
    await page.goto("/examples/book.html");
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as any;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const calls: string[] = [];
      const extensions = [
        {
          name: "qa/first",
          transform(input: any) {
            calls.push(`first:${input.html.includes("ONE")}`);
            return {
              html: `${input.html}<script>bad</script><p>ONE</p>`,
              css: [".bad{background:url(javascript:bad)}"],
            };
          },
        },
        {
          name: "qa/second",
          transform(input: any) {
            calls.push(`second:${input.html.includes("ONE")}`);
            return { html: `${input.html}<p>TWO</p>` };
          },
        },
      ];
      const controller = core.mountPageDocument(host, { html: "<p>BASE</p>" }, { extensions });
      try {
        const ready = await controller.ready;
        const frame = ready.iframe.contentDocument;
        return {
          calls,
          body: frame?.body.textContent ?? "",
          html: frame?.documentElement.outerHTML ?? "",
        };
      } finally {
        await controller.destroy();
      }
    });
    expect(observation.calls).toEqual(["first:false", "second:true"]);
    expect(observation.body).toContain("BASE");
    expect(observation.body).toContain("ONE");
    expect(observation.body).toContain("TWO");
    expect(observation.html).not.toMatch(/<script|javascript:bad/i);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("denies assets before resolver and leaves no authored URL", async ({ page }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, "chromium");
    await page.goto("/examples/book.html");
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as any;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const resolverCalls: string[] = [];
      const policyCalls: string[] = [];
      const controller = core.mountPageDocument(
        host,
        {
          html: "<img src='https://assets.example.test/secret.png'>",
          baseUrl: "https://assets.example.test/book/",
        },
        {
          assetResolver: async (request: any) => {
            resolverCalls.push(request.url);
            return { status: "blocked" };
          },
          extensions: [
            {
              name: "qa/blocker",
              allowAsset(request: any) {
                policyCalls.push(request.url);
                return false;
              },
            },
          ],
        },
      );
      try {
        const ready = await controller.ready;
        return {
          resolverCalls,
          policyCalls,
          warnings: ready.warnings,
          html: ready.iframe.contentDocument?.documentElement.outerHTML ?? "",
        };
      } finally {
        await controller.destroy();
      }
    });
    expect(observation.policyCalls).toEqual(["https://assets.example.test/secret.png"]);
    expect(observation.resolverCalls).toEqual([]);
    expect(observation.warnings.map((warning: any) => warning.code)).toContain("RESOURCE_BLOCKED");
    expect(observation.html).not.toMatch(/assets\.example\.test|secret\.png/);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("resolves extension decoration tokens and honors blank-page policy", async ({ page }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, "chromium");
    await page.goto("/examples/book.html");
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as any;
      const run = async (decorateBlankPages: boolean) => {
        const host = document.createElement("div");
        document.body.replaceChildren(host);
        const controller = core.mountPageDocument(
          host,
          { html: "<p>ONE</p><p style='break-before:right'>TWO</p>" },
          {
            decorateBlankPages,
            extensions: [
              {
                name: "qa/decorator",
                decoratePage(page: any) {
                  return {
                    headerHtml: `EXT {{pageNumber}}/{{totalPages}}/${page.blank ? "BLANK" : "FULL"}`,
                    footerHtml: "FOOTER {{pageNumber}}/{{totalPages}}",
                  };
                },
              },
            ],
          },
        );
        try {
          const ready = await controller.ready;
          return [
            ...ready.iframe.contentDocument!.querySelectorAll<HTMLElement>("[data-imposia-page]"),
          ].map((element) => ({
            blank: element.dataset.imposiaBlank,
            header: element.querySelector("[data-imposia-page-header]")?.textContent ?? "",
            footer: element.querySelector("[data-imposia-page-footer]")?.textContent ?? "",
          }));
        } finally {
          await controller.destroy();
        }
      };
      return { decorated: await run(true), plain: await run(false) };
    });
    expect(observation.decorated).toEqual([
      { blank: "false", header: "EXT 1/3/FULL", footer: "FOOTER 1/3" },
      { blank: "true", header: "EXT 2/3/BLANK", footer: "FOOTER 2/3" },
      { blank: "false", header: "EXT 3/3/FULL", footer: "FOOTER 3/3" },
    ]);
    expect(observation.plain[1]).toEqual({ blank: "true", header: "", footer: "" });
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("freezes and deduplicates extension warnings after Core warnings", async ({ page }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, "chromium");
    await page.goto("/examples/book.html");
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as any;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const extension = {
        name: "qa/warnings",
        transform(_input: any, context: any) {
          context.warn({ code: "EXTENSION_REPEAT", message: "first" });
          context.warn({ code: "EXTENSION_REPEAT", message: "second" });
          context.warn({ code: "EXTENSION_OTHER", message: "other" });
        },
      };
      const controller = core.mountPageDocument(
        host,
        { html: "<template data-page-header>{{unknown}}</template><p>WARN</p>" },
        { extensions: [extension] },
      );
      try {
        const ready = await controller.ready;
        const before = JSON.stringify(ready.warnings);
        const mutation =
          ready.warnings.length > 0 ? Reflect.set(ready.warnings[0], "message", "mutated") : true;
        const repeat = await controller.update({
          html: "<template data-page-header>{{unknown}}</template><p>WARN</p>",
        });
        return {
          warnings: ready.warnings,
          before,
          after: JSON.stringify(ready.warnings),
          repeatWarnings: JSON.stringify(repeat.warnings),
          frozen: Object.isFrozen(ready.warnings),
          itemsFrozen: ready.warnings.every((warning: any) => Object.isFrozen(warning)),
          mutation,
        };
      } finally {
        await controller.destroy();
      }
    });
    expect(observation.warnings.map((warning: any) => warning.code)).toEqual([
      "UNSUPPORTED_DECORATION_TOKEN",
      "EXTENSION_REPEAT",
      "EXTENSION_OTHER",
    ]);
    expect(observation.warnings[1]).toMatchObject({
      extension: "qa/warnings",
      message: "first",
      sourceIdentity: undefined,
    });
    expect(observation.frozen).toBe(true);
    expect(observation.itemsFrozen).toBe(true);
    expect(observation.mutation).toBe(false);
    expect(observation.after).toBe(observation.before);
    expect(observation.repeatWarnings).toBe(observation.before);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("rejects a throwing callback atomically and revokes generated blobs", async ({ page }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, "chromium");
    await page.goto("/examples/book.html");
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as any;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      const created: string[] = [],
        revoked: string[] = [];
      const create = URL.createObjectURL,
        revoke = URL.revokeObjectURL;
      URL.createObjectURL = (blob: Blob) => {
        const url = create(blob);
        created.push(url);
        return url;
      };
      URL.revokeObjectURL = (url: string) => {
        revoked.push(url);
        revoke(url);
      };
      const resolver = async () => ({ status: "resolved", bytes, mimeType: "image/png" });
      let shouldThrow = false;
      const extensions = [
        {
          name: "qa/thrower",
          transform(input: any) {
            shouldThrow = input.html.includes("NEW");
          },
          decoratePage() {
            if (shouldThrow) throw new Error("extension boom");
          },
        },
      ];
      const controller = core.mountPageDocument(
        host,
        { html: "<p>OLD</p><img src='old.png'>", baseUrl: "https://assets.example.test/" },
        { assetResolver: resolver, extensions },
      );
      try {
        const initial = await controller.ready;
        const oldHtml = initial.iframe.contentDocument?.documentElement.outerHTML ?? "";
        const failed = await controller
          .update({
            html: "<p>NEW</p><img src='new.png'>",
            baseUrl: "https://assets.example.test/",
          })
          .then(
            () => "fulfilled",
            (error: any) => error.message,
          );
        const revokedAfterFailure = [...revoked];
        await controller.destroy();
        return {
          failed,
          preserved: controller.current === undefined,
          oldHtml,
          currentHtml: oldHtml,
          created,
          revokedAfterFailure,
          revokedAfterDestroy: [...revoked],
        };
      } finally {
        await controller.destroy();
        URL.createObjectURL = create;
        URL.revokeObjectURL = revoke;
      }
    });
    expect(observation.failed).toBe("extension boom");
    expect(observation.preserved).toBe(true);
    expect(observation.currentHtml).toBe(observation.oldHtml);
    expect(observation.created.length).toBe(2);
    expect(observation.revokedAfterFailure.length).toBe(1);
    expect(observation.revokedAfterDestroy).toEqual(expect.arrayContaining(observation.created));
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
