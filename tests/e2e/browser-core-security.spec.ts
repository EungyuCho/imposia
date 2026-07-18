import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("serializes light DOM inertly without copying custom-element runtime state", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const tagName = "x-imposia-runtime-card";
      let constructorCount = 0;
      class RuntimeCard extends HTMLElement {
        constructor() {
          super();
          constructorCount += 1;
          this.attachShadow({ mode: "open" }).innerHTML = "<span>private shadow runtime</span>";
        }
      }
      customElements.define(tagName, RuntimeCard);

      const source = document.createElement("section");
      const card = document.createElement(tagName);
      card.textContent = "visible light DOM";
      Object.defineProperty(card, "runtimeState", { value: { secret: true } });
      let sourceListenerCalls = 0;
      card.addEventListener("click", () => {
        sourceListenerCalls += 1;
      });
      source.append(card);
      const sourceMarkupBefore = source.innerHTML;
      const constructorCountBefore = constructorCount;
      const host = document.createElement("div");
      document.body.replaceChildren(host);

      let controller:
        | {
            ready: Promise<{ iframe: HTMLIFrameElement; warnings: readonly { code: string }[] }>;
            destroy(): Promise<void>;
          }
        | undefined;
      try {
        const core = (await import("/packages/core/dist/index.js")) as {
          mountPageDocument(
            container: HTMLElement,
            source: { lightDom: Element | DocumentFragment },
            options: Record<string, never>,
          ): typeof controller;
        };
        controller = core.mountPageDocument(host, { lightDom: source }, {});
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const frameCard = frameDocument.querySelector<HTMLElement>(tagName);
        frameCard?.dispatchEvent(new Event("click", { bubbles: true }));
        const foreignDocument = document.implementation.createHTMLDocument("foreign");
        const foreignSource = foreignDocument.createElement("article");
        foreignSource.innerHTML = "<p>cross realm light DOM</p>";
        const foreignHost = document.createElement("div");
        document.body.append(foreignHost);
        const foreignController = core.mountPageDocument(
          foreignHost,
          { lightDom: foreignSource },
          {},
        );
        const foreignReady = await foreignController.ready;
        const foreignText = foreignReady.pages[0]?.bodyText ?? [];
        await foreignController.destroy();
        foreignHost.remove();
        return {
          constructorCountBefore,
          constructorCountAfter: constructorCount,
          sourceMarkupBefore,
          sourceMarkupAfter: source.innerHTML,
          sourceListenerCalls,
          frameCardPresent: frameCard !== null,
          frameShadowCopied: frameCard?.shadowRoot !== null,
          frameRuntimeStateCopied: frameCard !== null && "runtimeState" in frameCard,
          frameText: frameCard?.textContent,
          frameShadowText: frameCard?.shadowRoot?.textContent ?? null,
          foreignText,
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.constructorCountAfter).toBe(observation.constructorCountBefore);
    expect(observation.sourceMarkupAfter).toBe(observation.sourceMarkupBefore);
    expect(observation.sourceListenerCalls).toBe(0);
    expect(observation.frameCardPresent).toBe(true);
    expect(observation.frameShadowCopied).toBe(false);
    expect(observation.frameRuntimeStateCopied).toBe(false);
    expect(observation.frameText).toContain("visible light DOM");
    expect(observation.frameShadowText).toBeNull();
    expect(observation.foreignText).toContain("cross realm light DOM");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("blocks caller CSS resources that bypass the asset resolver boundary", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      let controller:
        | {
            ready: Promise<{
              iframe: HTMLIFrameElement;
              warnings: readonly { code: string; message: string }[];
            }>;
            destroy(): Promise<void>;
          }
        | undefined;
      try {
        const core = (await import("/packages/core/dist/index.js")) as {
          mountPageDocument(
            container: HTMLElement,
            source: { html: string },
            options: { css: readonly string[] },
          ): typeof controller;
        };
        controller = core.mountPageDocument(
          host,
          {
            html: `<div class="probe">Resource probe</div>`,
          },
          { css: [".caller{background:u\\72l(blob:https://example.invalid/asset)}"] },
        );
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const probe = frameDocument.querySelector<HTMLElement>(".probe");
        const image = frameDocument.querySelector("img");
        const computedBackground = probe
          ? (frameDocument.defaultView?.getComputedStyle(probe).backgroundImage ?? "")
          : "missing";
        return {
          computedBackground,
          imageSrc: image?.getAttribute("src") ?? null,
          styleText: [...frameDocument.querySelectorAll("style")]
            .map((style) => style.textContent ?? "")
            .join("\n"),
          csp: frameDocument
            .querySelector('meta[http-equiv="Content-Security-Policy"]')
            ?.getAttribute("content"),
          warningCodes: ready.warnings.map((warning) => warning.code),
          warningsFrozen: Object.isFrozen(ready.warnings),
          warningElementsFrozen: ready.warnings.every((warning) => Object.isFrozen(warning)),
          warningMessageBeforeMutation: ready.warnings[0]?.message ?? null,
          warningMutationResult:
            ready.warnings[0] === undefined
              ? null
              : Reflect.set(ready.warnings[0], "message", "mutated warning"),
          warningMessageAfterMutation: ready.warnings[0]?.message ?? null,
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.computedBackground).toBe("none");
    expect(observation.imageSrc).toBeNull();
    expect(observation.styleText).not.toMatch(/url\s*\(/i);
    expect(observation.styleText).not.toMatch(/blob:|data:/i);
    expect(observation.csp).toContain("img-src blob:");
    expect(observation.csp).toContain("font-src blob:");
    expect(observation.csp).toContain("media-src blob:");
    expect(observation.csp).not.toMatch(/(?:img|font|media)-src[^;]*data:/);
    expect(observation.warningCodes).toContain("RESOURCE_BLOCKED");
    expect(observation.warningsFrozen).toBe(true);
    expect(observation.warningElementsFrozen).toBe(true);
    expect(observation.warningMutationResult).toBe(false);
    expect(observation.warningMessageAfterMutation).toBe(observation.warningMessageBeforeMutation);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
test("enforces input, node, and resolver deadline limits", async ({ page, browserName }) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const failures = await page.evaluate(async () => {
      type Failure = { name: string; code: string | null; message: string };
      type Controller = { ready: Promise<unknown>; destroy(): Promise<void> };
      const core = (await import("/packages/core/dist/index.js")) as {
        ImposiaError: new (code: string, message: string) => Error & { code: string };
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, unknown>,
        ): Controller;
      };
      const failure = async (html: string, options: Record<string, unknown>): Promise<Failure> => {
        const host = document.body.appendChild(document.createElement("div"));
        let controller: Controller | undefined;
        try {
          controller = core.mountPageDocument(host, { html }, options);
          await controller.ready;
          throw new Error("Expected the page document operation to reject.");
        } catch (error: unknown) {
          const value = error instanceof Error ? error : new Error("unknown");
          return {
            name: value.name,
            code: value instanceof core.ImposiaError ? value.code : null,
            message: value.message,
          };
        } finally {
          await controller?.destroy();
          host.remove();
        }
      };
      let resolverAborted = false;
      return {
        input: await failure("<p>bytes</p>", { limits: { maxInputBytes: 10 } }),
        nodes: await failure("<div><span>one</span><span>two</span></div>", {
          limits: { maxNodes: 2 },
        }),
        deadline: await failure('<img src="late.png">', {
          limits: { resourceDeadlineMs: 50 },
          assetResolver: ({ signal }: { signal: AbortSignal }) =>
            new Promise<{ status: "blocked" }>((resolve) => {
              signal.addEventListener(
                "abort",
                () => {
                  resolverAborted = true;
                  resolve({ status: "blocked" });
                },
                { once: true },
              );
            }),
        }),
        resolverAborted,
      };
    });
    expect(failures.input).toEqual({
      name: "Error",
      code: null,
      message: "Page source exceeds the 10-byte input limit.",
    });
    expect(failures.nodes).toEqual({
      name: "ImposiaError",
      code: "NODE_LIMIT",
      message: "Page node limit exceeded.",
    });
    expect(failures.deadline).toEqual({
      name: "ImposiaError",
      code: "RESOURCE_TIMEOUT",
      message: "Resource loading timed out.",
    });
    expect(failures.resolverAborted).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
