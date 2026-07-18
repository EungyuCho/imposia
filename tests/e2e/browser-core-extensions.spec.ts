import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("runs immutable transforms in order, sanitizes their output, and keeps aborted updates atomic", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Result = {
        iframe: HTMLIFrameElement;
        pages: readonly { bodyText: readonly string[] }[];
      };
      type Controller = {
        ready: Promise<Result>;
        current: Result | undefined;
        update(source: { html: string }, options?: { signal?: AbortSignal }): Promise<Result>;
        destroy(): Promise<void>;
      };
      type Core = {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: object,
        ): Controller;
      };
      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const calls: string[] = [];
      let releaseHold: ((value: { html: string }) => void) | undefined;
      const extensions = [
        {
          name: "acme/first",
          transform(input: { html: string; css: readonly string[] }) {
            calls.push(`first:${input.html.includes("initial") ? "initial" : "next"}`);
            if (input.html.includes("hold")) {
              return new Promise<{ html: string }>((resolve) => {
                releaseHold = resolve;
              });
            }
            if (input.html.includes("large")) return { html: `<p>${"x".repeat(400)}</p>` };
            return {
              html: input.html.replace(/initial|updated/g, "first"),
              css: [
                ...input.css,
                ".transformed{background-image:url('https://assets.example.test/nope.png')}",
              ],
            };
          },
        },
        {
          name: "acme/second",
          transform(input: { html: string; css: readonly string[] }) {
            calls.push(`second:${input.html.includes("first") ? "first" : "other"}`);
            return { html: input.html.replace("first", "second"), css: input.css };
          },
        },
      ];
      let controller: Controller | undefined;
      try {
        controller = core.mountPageDocument(
          host,
          { html: "<p>initial</p>" },
          { extensions, limits: { maxInputBytes: 256 } },
        );
        const initial = await controller.ready;
        extensions.push({
          name: "acme/late",
          transform: () => ({ html: "<p>late</p>" }),
        });
        const updated = await controller.update({ html: "<p>updated</p>" });
        const abortController = new AbortController();
        const holding = controller.update(
          { html: "<p>hold</p>" },
          { signal: abortController.signal },
        );
        await Promise.resolve();
        abortController.abort();
        const aborted = await holding.then(
          () => "fulfilled",
          (error: unknown) => (error instanceof DOMException ? error.name : "unknown"),
        );
        releaseHold?.({ html: "<p>released</p>" });
        await Promise.resolve();
        const limited = await controller.update({ html: "<p>large</p>" }).then(
          () => "fulfilled",
          (error: unknown) => (error instanceof Error ? error.message : "unknown"),
        );
        const frameDocument = updated.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        return {
          calls,
          initialText: initial.pages[0]?.bodyText,
          updatedText: updated.pages[0]?.bodyText,
          aborted,
          limited,
          currentPreserved: controller.current === updated,
          frameHtml: frameDocument.documentElement.outerHTML,
        };
      } finally {
        await controller?.destroy();
        host.remove();
      }
    });

    expect(observation.calls.slice(0, 4)).toEqual([
      "first:initial",
      "second:first",
      "first:next",
      "second:first",
    ]);
    expect(observation.initialText).toContain("second");
    expect(observation.updatedText).toContain("second");
    expect(observation.aborted).toBe("AbortError");
    expect(observation.limited).toContain("input limit");
    expect(observation.currentPreserved).toBe(true);
    expect(observation.frameHtml).not.toContain("<p>late</p>");
    expect(observation.frameHtml).not.toContain("assets.example.test/nope.png");
    expect(observation.frameHtml).not.toMatch(/background-image\s*:\s*url/i);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("runs asset policies before the resolver and freezes namespaced warnings", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Result = {
        iframe: HTMLIFrameElement;
        warnings: readonly { code: string; message: string; extension?: string }[];
      };
      type Controller = { ready: Promise<Result>; destroy(): Promise<void> };
      type Core = {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string; baseUrl: string },
          options: object,
        ): Controller;
      };
      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const events: string[] = [];
      let controller: Controller | undefined;
      try {
        controller = core.mountPageDocument(
          host,
          { html: '<img src="cover.png">', baseUrl: "https://assets.example.test/book/" },
          {
            assetResolver: async () => {
              events.push("resolver");
              return { status: "blocked" };
            },
            extensions: [
              {
                name: "acme/audit",
                allowAsset(request: { url: string }, context: { warn(value: object): void }) {
                  events.push(`audit:${request.url}`);
                  context.warn({ code: "EXTENSION_POLICY", message: "Audited asset policy." });
                  context.warn({ code: "EXTENSION_POLICY", message: "Duplicate warning." });
                  return true;
                },
              },
              {
                name: "acme/block",
                allowAsset(request: { url: string }, context: { warn(value: object): void }) {
                  events.push(`block:${request.url}`);
                  context.warn({ code: "EXTENSION_POLICY", message: "Blocked asset policy." });
                  return false;
                },
              },
            ],
          },
        );
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        return {
          events,
          warnings: ready.warnings,
          warningsFrozen: Object.isFrozen(ready.warnings),
          warningElementsFrozen: ready.warnings.every((warning) => Object.isFrozen(warning)),
          frameHtml: frameDocument.documentElement.outerHTML,
        };
      } finally {
        await controller?.destroy();
        host.remove();
      }
    });

    expect(observation.events).toEqual(["audit:cover.png", "block:cover.png"]);
    expect(observation.warnings).toEqual([
      {
        code: "RESOURCE_BLOCKED",
        message: "Resource was blocked by the loading policy.",
        sourceIdentity: "resource-0",
      },
      {
        code: "EXTENSION_POLICY",
        message: "Audited asset policy.",
        sourceIdentity: undefined,
        extension: "acme/audit",
      },
      {
        code: "EXTENSION_POLICY",
        message: "Blocked asset policy.",
        sourceIdentity: undefined,
        extension: "acme/block",
      },
    ]);
    expect(observation.warningsFrozen).toBe(true);
    expect(observation.warningElementsFrozen).toBe(true);
    expect(observation.frameHtml).not.toContain("cover.png");
    expect(observation.frameHtml).not.toContain("assets.example.test");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("decorates allocated pages through Core token and blank-page handling", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Result = { iframe: HTMLIFrameElement };
      type Controller = { ready: Promise<Result>; destroy(): Promise<void> };
      type Core = {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: object,
        ): Controller;
      };
      const core = (await import("/packages/core/dist/index.js")) as Core;
      const run = async (decorateBlankPages: boolean) => {
        const host = document.body.appendChild(document.createElement("div"));
        const calls: Array<{ number: number; blank: boolean; mutable: boolean }> = [];
        let controller: Controller | undefined;
        try {
          controller = core.mountPageDocument(
            host,
            {
              html: '<section>FIRST</section><section style="break-before:right">SECOND</section>',
            },
            {
              decorateBlankPages,
              headerTemplate: "CORE {{pageNumber}} / {{totalPages}}",
              extensions: [
                {
                  name: "acme/running-head",
                  decoratePage(pageInfo: { number: number; blank: boolean }) {
                    calls.push({
                      number: pageInfo.number,
                      blank: pageInfo.blank,
                      mutable: Reflect.set(pageInfo, "number", 99),
                    });
                    return {
                      headerHtml:
                        '<img src="https://assets.example.test/decorator.png">EXT {{pageNumber}} / {{totalPages}}',
                      footerHtml: "FOOT {{pageNumber}} / {{totalPages}}",
                    };
                  },
                },
              ],
            },
          );
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          return {
            calls,
            frameHtml: frameDocument.documentElement.outerHTML,
            pages: [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")].map(
              (pageElement) => ({
                blank: pageElement.getAttribute("data-imposia-blank"),
                header: pageElement.querySelector("[data-imposia-page-header]")?.textContent ?? "",
                footer: pageElement.querySelector("[data-imposia-page-footer]")?.textContent ?? "",
              }),
            ),
          };
        } finally {
          await controller?.destroy();
          host.remove();
        }
      };
      return { decorated: await run(true), undecorated: await run(false) };
    });

    expect(observation.decorated.calls).toEqual([
      { number: 1, blank: false, mutable: false },
      { number: 2, blank: true, mutable: false },
      { number: 3, blank: false, mutable: false },
    ]);
    expect(observation.decorated.pages.map((page) => page.header)).toEqual([
      "CORE 1 / 3EXT 1 / 3",
      "CORE 2 / 3EXT 2 / 3",
      "CORE 3 / 3EXT 3 / 3",
    ]);
    expect(observation.decorated.pages.map((page) => page.footer)).toEqual([
      "FOOT 1 / 3",
      "FOOT 2 / 3",
      "FOOT 3 / 3",
    ]);
    expect(observation.undecorated.calls).toEqual([
      { number: 1, blank: false, mutable: false },
      { number: 3, blank: false, mutable: false },
    ]);
    expect(observation.undecorated.pages[1]).toEqual({ blank: "true", header: "", footer: "" });
    expect(observation.decorated.frameHtml).not.toContain("assets.example.test/decorator.png");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("rejects malformed extension work without replacing a committed page", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Browser pagination is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Result = { iframe: HTMLIFrameElement };
      type Controller = {
        ready: Promise<Result>;
        current: Result | undefined;
        update(source: { html: string }): Promise<Result>;
        destroy(): Promise<void>;
      };
      type Core = {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: object,
        ): Controller;
      };
      const core = (await import("/packages/core/dist/index.js")) as Core;
      const host = document.body.appendChild(document.createElement("div"));
      const duplicateHost = document.body.appendChild(document.createElement("div"));
      const nonArrayHost = document.body.appendChild(document.createElement("div"));
      let controller: Controller | undefined;
      let duplicate: Controller | undefined;
      let nonArray: Controller | undefined;
      try {
        controller = core.mountPageDocument(
          host,
          { html: "<p>stable</p>" },
          {
            extensions: [
              {
                name: "acme/failure",
                transform(input: { html: string }, context: { warn(value: object): void }) {
                  if (input.html.includes("invalid")) return { html: 7 };
                  if (input.html.includes("throw")) throw new Error("extension callback failed");
                  if (input.html.includes("warning")) {
                    context.warn({ code: "EXTENSION_", message: "Invalid warning." });
                  }
                },
              },
            ],
          },
        );
        const stable = await controller.ready;
        const invalid = await controller.update({ html: "<p>invalid</p>" }).then(
          () => "fulfilled",
          (error: unknown) => (error instanceof TypeError ? error.message : "unknown"),
        );
        const thrown = await controller.update({ html: "<p>throw</p>" }).then(
          () => "fulfilled",
          (error: unknown) => (error instanceof Error ? error.message : "unknown"),
        );
        const warning = await controller.update({ html: "<p>warning</p>" }).then(
          () => "fulfilled",
          (error: unknown) => (error instanceof TypeError ? error.message : "unknown"),
        );
        duplicate = core.mountPageDocument(
          duplicateHost,
          { html: "<p>duplicate</p>" },
          { extensions: [{ name: "acme/same" }, { name: "acme/same" }] },
        );
        const duplicateError = await duplicate.ready.then(
          () => "fulfilled",
          (error: unknown) => (error instanceof TypeError ? error.message : "unknown"),
        );
        nonArray = core.mountPageDocument(
          nonArrayHost,
          { html: "<p>non-array</p>" },
          { extensions: {} },
        );
        const nonArrayError = await nonArray.ready.then(
          () => "fulfilled",
          (error: unknown) => (error instanceof TypeError ? error.message : "unknown"),
        );
        const frameText = stable.iframe.contentDocument?.body.textContent ?? "";
        return {
          invalid,
          thrown,
          warning,
          duplicateError,
          nonArrayError,
          currentPreserved: controller.current === stable,
          frameText,
        };
      } finally {
        await controller?.destroy();
        await duplicate?.destroy();
        await nonArray?.destroy();
        host.remove();
        duplicateHost.remove();
        nonArrayHost.remove();
      }
    });

    expect(observation.invalid).toContain("transform html must be a string");
    expect(observation.thrown).toBe("extension callback failed");
    expect(observation.warning).toContain("warning code must start with EXTENSION_");
    expect(observation.duplicateError).toContain("duplicate name");
    expect(observation.nonArrayError).toContain(
      "name must be a lowercase package-style identifier",
    );
    expect(observation.currentPreserved).toBe(true);
    expect(observation.frameText).toContain("stable");
    expect(observation.frameText).not.toContain("invalid");
    expect(observation.frameText).not.toContain("throw");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
