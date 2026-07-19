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
        warnings: readonly {
          code: string;
          message: string;
          extension?: string;
          location: { generation?: number; entryId?: string; page?: number };
        }[];
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
          warningLocationsFrozen: ready.warnings.every((warning) =>
            Object.isFrozen(warning.location),
          ),
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
        location: { generation: 1, entryId: undefined, page: undefined },
      },
      {
        code: "EXTENSION_POLICY",
        message: "Audited asset policy.",
        sourceIdentity: undefined,
        location: { generation: 1, entryId: undefined, page: undefined },
        extension: "acme/audit",
      },
      {
        code: "EXTENSION_POLICY",
        message: "Blocked asset policy.",
        sourceIdentity: undefined,
        location: { generation: 1, entryId: undefined, page: undefined },
        extension: "acme/block",
      },
    ]);
    expect(observation.warningsFrozen).toBe(true);
    expect(observation.warningElementsFrozen).toBe(true);
    expect(observation.warningLocationsFrozen).toBe(true);
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
        const calls: Array<{
          number: number;
          totalPages: number;
          blank: boolean;
          mutable: boolean;
        }> = [];
        let controller: Controller | undefined;
        try {
          controller = core.mountPageDocument(
            host,
            {
              html: '<section><a id="extension-page-ref" href="#extension-target">FIRST</a></section><section id="extension-target" style="break-before:right">SECOND</section>',
            },
            {
              css: ["#extension-page-ref::after { content: target-counter(attr(href), page); }"],
              decorateBlankPages,
              headerTemplate: "CORE {{pageNumber}} / {{totalPages}}",
              extensions: [
                {
                  name: "acme/running-head",
                  decoratePage(pageInfo: { number: number; totalPages: number; blank: boolean }) {
                    calls.push({
                      number: pageInfo.number,
                      totalPages: pageInfo.totalPages,
                      blank: pageInfo.blank,
                      mutable: Reflect.set(pageInfo, "number", 99),
                    });
                    return {
                      headerHtml:
                        '<img src="https://assets.example.test/decorator.png">EXT {{pageNumber}} / {{totalPages}}',
                      ...(pageInfo.number === pageInfo.totalPages
                        ? { footerHtml: "LAST {{pageNumber}} / {{totalPages}}" }
                        : {}),
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
      { number: 1, totalPages: 3, blank: false, mutable: false },
      { number: 2, totalPages: 3, blank: true, mutable: false },
      { number: 3, totalPages: 3, blank: false, mutable: false },
    ]);
    expect(observation.decorated.pages.map((page) => page.header)).toEqual([
      "CORE 1 / 3EXT 1 / 3",
      "CORE 2 / 3EXT 2 / 3",
      "CORE 3 / 3EXT 3 / 3",
    ]);
    expect(observation.decorated.pages.map((page) => page.footer)).toEqual(["", "", "LAST 3 / 3"]);
    expect(observation.undecorated.calls).toEqual([
      { number: 1, totalPages: 3, blank: false, mutable: false },
      { number: 3, totalPages: 3, blank: false, mutable: false },
    ]);
    expect(observation.undecorated.pages[1]).toEqual({ blank: "true", header: "", footer: "" });
    expect(observation.undecorated.pages[2]?.footer).toBe("LAST 3 / 3");
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

test("runs capability-bounded Publication entry extensions with provenance and cleanup", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const calls: Array<Record<string, unknown>> = [];
      let cleanups = 0;
      let interExtensionSanitized = true;
      let releaseHold: (() => void) | undefined;
      let holdStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        holdStarted = resolve;
      });
      const extension = {
        name: "acme/publication-policy",
        async transformEntry(
          input: {
            html: string;
            css: readonly string[];
            publication: { title: string; entryCount: number };
            entry: { id: string; title: string; index: number; totalEntries: number };
          },
          context: {
            signal: AbortSignal;
            warn(value: object): void;
            onCleanup(cleanup: () => void): void;
          },
        ) {
          calls.push({
            publication: input.publication.title,
            entryCount: input.publication.entryCount,
            id: input.entry.id,
            index: input.entry.index,
            totalEntries: input.entry.totalEntries,
            frozen:
              Object.isFrozen(input) &&
              Object.isFrozen(input.publication) &&
              Object.isFrozen(input.entry) &&
              Object.isFrozen(input.css),
            hasDom: Object.values(input).some(
              (value) => value instanceof Node || value instanceof Document,
            ),
            sanitizedInput: !/<script|onload\s*=/i.test(input.html),
          });
          if (input.html.includes("HOLD")) {
            holdStarted?.();
            await new Promise<void>((resolve) => {
              releaseHold = resolve;
            });
            context.onCleanup(() => {
              cleanups += 1;
            });
            return;
          }
          context.onCleanup(() => {
            cleanups += 1;
          });
          if (input.html.includes("FAIL")) throw new Error("entry policy failed");
          if (input.entry.id === "chapter") {
            context.warn({ code: "EXTENSION_ENTRY_POLICY", message: "Chapter policy applied." });
          }
          return {
            html: `${input.html}<script>globalThis.extensionEscaped=true</script><p>SAFE-${input.entry.id}</p>`,
            css: ["p { color: rgb(1, 2, 3) }"] as const,
          };
        },
        decoratePage(pageInfo: { number: number }, context: { warn(value: object): void }) {
          if (pageInfo.number === 1) {
            context.warn({ code: "EXTENSION_PAGE_POLICY", message: "First page decorated." });
            return { footerHtml: "Policy page {{pageNumber}}" };
          }
        },
      };
      const auditExtension = {
        name: "acme/sanitized-input-audit",
        transformEntry(input: { html: string }) {
          interExtensionSanitized &&= !/<script|onload\s*=/i.test(input.html);
        },
      };
      const controller = core.mountPublication(
        host,
        {
          metadata: { title: "Policy book", language: "en", identifier: "urn:policy" },
          entries: [
            {
              id: "cover",
              title: "Cover",
              html: '<script>globalThis.rawEscaped=true</script><h1 onload="bad()">Cover</h1>',
            },
            { id: "chapter", title: "Chapter", html: "<h1>Chapter</h1>" },
          ],
        },
        { extensions: [extension, auditExtension] },
      );
      try {
        const committed = await controller.ready;
        const committedHtml = committed.iframe.contentDocument?.documentElement.outerHTML ?? "";
        const stable = controller.current;
        const abortController = new AbortController();
        const holding = controller.update(
          {
            metadata: { title: "Policy book" },
            entries: [{ id: "hold", title: "Hold", html: "<p>HOLD</p>" }],
          },
          { signal: abortController.signal },
        );
        await started;
        abortController.abort();
        const aborted = await holding.then(
          () => "fulfilled",
          (error: unknown) => (error instanceof DOMException ? error.name : "unknown"),
        );
        releaseHold?.();
        const failed = await controller
          .update({
            metadata: { title: "Policy book" },
            entries: [{ id: "fail", title: "Fail", html: "<p>FAIL</p>" }],
          })
          .then(
            () => ({ code: "fulfilled", message: "fulfilled" }),
            (error: unknown) => ({
              code:
                error !== null && typeof error === "object"
                  ? String(Reflect.get(error, "code"))
                  : "unknown",
              message: error instanceof Error ? error.message : "unknown",
            }),
          );
        return {
          calls,
          cleanups,
          warnings: committed.warnings,
          pageRanges: committed.entries.map((entry) => entry.pageRange),
          committedText: committed.pages.flatMap((item) => item.bodyText),
          committedHtml,
          aborted,
          failed,
          preserved: controller.current === stable,
          escaped: Reflect.get(globalThis, "extensionEscaped"),
          rawEscaped: Reflect.get(globalThis, "rawEscaped"),
          interExtensionSanitized,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.calls.slice(0, 2)).toEqual([
      {
        publication: "Policy book",
        entryCount: 2,
        id: "cover",
        index: 0,
        totalEntries: 2,
        frozen: true,
        hasDom: false,
        sanitizedInput: true,
      },
      {
        publication: "Policy book",
        entryCount: 2,
        id: "chapter",
        index: 1,
        totalEntries: 2,
        frozen: true,
        hasDom: false,
        sanitizedInput: true,
      },
    ]);
    expect(observation.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "EXTENSION_ENTRY_POLICY",
          extension: "acme/publication-policy",
          location: { generation: 1, entryId: "chapter", page: undefined },
        }),
        expect.objectContaining({
          code: "EXTENSION_PAGE_POLICY",
          extension: "acme/publication-policy",
          location: { generation: 1, entryId: undefined, page: 1 },
        }),
      ]),
    );
    expect(observation.committedText.join(" ")).toContain("SAFE-cover");
    expect(observation.committedText.join(" ")).toContain("SAFE-chapter");
    expect(observation.committedHtml).not.toMatch(/<script|extensionEscaped/i);
    expect(observation.pageRanges).toHaveLength(2);
    expect(observation.aborted).toBe("AbortError");
    expect(observation.failed).toEqual({
      code: "EXTENSION_FAILED",
      message: "entry policy failed",
    });
    expect(observation.preserved).toBe(true);
    expect(observation.cleanups).toBeGreaterThanOrEqual(4);
    expect(observation.escaped).toBeUndefined();
    expect(observation.rawEscaped).toBeUndefined();
    expect(observation.interExtensionSanitized).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
