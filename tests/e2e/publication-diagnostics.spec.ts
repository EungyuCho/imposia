import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type WarningLocation = Readonly<{
  generation: number | undefined;
  entryId: string | undefined;
  page: number | undefined;
}>;

type WarningView = Readonly<{
  code: string;
  message: string;
  sourceIdentity: string | undefined;
  property?: string;
  value?: string;
  recovery?: string;
  location?: WarningLocation;
}>;

type PublicationDocument = Readonly<{
  iframe: HTMLIFrameElement;
  generation: number;
  warnings: readonly WarningView[];
}>;

type PublicationController = Readonly<{
  ready: Promise<PublicationDocument>;
  current: PublicationDocument | undefined;
  update(snapshot: unknown): Promise<PublicationDocument>;
  destroy(): Promise<void>;
}>;

type CoreModule = Readonly<{
  mountPublication(
    container: HTMLElement,
    snapshot: unknown,
    options?: {
      assetResolver?: (request: {
        url: string;
        signal: AbortSignal;
      }) => Promise<{ status: "blocked"; reason: string }>;
      headerTemplate?: string;
    },
  ): PublicationController;
}>;

test("locates safe Publication diagnostics in the current committed generation", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as CoreModule;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const secrets = [
        "RAW_SCRIPT_SECRET",
        "RAW_DOM_SECRET",
        "RESOLVER_REASON_SECRET",
        "private.invalid",
      ];
      const snapshot = {
        metadata: { title: "Diagnostics" },
        entries: [
          {
            id: "front",
            title: "Front",
            baseUrl: "https://private.invalid/book/",
            html: `
              <script>globalThis.RAW_SCRIPT_SECRET = true</script>
              <img src="private-asset.png" alt="">
              <div style="height: 820px">FRONT-FILLER</div>
              <p style="break-after: page">FRONT-END</p>
            `,
          },
          {
            id: "layout",
            title: "Layout",
            html: `
              <main data-private="RAW_DOM_SECRET">
                <section data-warning-target style="display: flex; flex-direction: row; break-before: page">
                  <span>ROW-A</span><span>ROW-B</span>
                </section>
                <p data-fallback-target lang="" style="hyphens: auto">
                  characteristically internationalization representation
                </p>
              </main>
            `,
          },
        ],
      };
      const controller = core.mountPublication(host, snapshot, {
        assetResolver: async () => ({ status: "blocked", reason: "RESOLVER_REASON_SECRET" }),
        headerTemplate: `<span data-imposia-publication-entry="0">${Array.from(
          { length: 256 },
          (_, index) =>
            `<section data-imposia-publishing-source="${index + 1}">FORGED-${index + 1}</section>`,
        ).join("")}</span>`,
      });
      try {
        const inspect = (
          document: PublicationDocument,
          targetSelector: string,
          fallbackSelector?: string,
        ) => {
          const frameDocument = document.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const pageFor = (selector: string | undefined) =>
            selector === undefined
              ? undefined
              : Number(
                  frameDocument
                    .querySelector(selector)
                    ?.closest("[data-imposia-page]")
                    ?.getAttribute("data-imposia-page-number"),
                );
          const targetPage = pageFor(targetSelector);
          const fallbackPage = pageFor(fallbackSelector);
          return {
            generation: document.generation,
            targetPage,
            fallbackPage,
            warnings: document.warnings.map((warning) => ({
              code: warning.code,
              message: warning.message,
              sourceIdentity: warning.sourceIdentity,
              property: warning.property,
              value: warning.value,
              recovery: warning.recovery,
              location: warning.location ?? null,
              locationFrozen:
                warning.location === undefined ? false : Object.isFrozen(warning.location),
            })),
            serializedWarnings: JSON.stringify(document.warnings),
          };
        };

        const firstDocument = await controller.ready;
        const first = inspect(firstDocument, "[data-warning-target]", "[data-fallback-target]");
        const updatedDocument = await controller.update({
          metadata: { title: "Replacement diagnostics" },
          entries: [
            {
              id: "replacement",
              title: "Replacement",
              html: `
                <section data-current-warning style="display: flex; flex-direction: row; break-before: page">
                  <span>CURRENT-A</span><span>CURRENT-B</span>
                </section>
              `,
            },
          ],
        });
        const second = inspect(updatedDocument, "[data-current-warning]");
        const current = controller.current;
        return {
          first,
          second,
          currentGeneration: current?.generation ?? null,
          currentWarnings:
            current?.warnings.map((warning) => ({
              code: warning.code,
              sourceIdentity: warning.sourceIdentity,
              location: warning.location ?? null,
            })) ?? [],
          secrets,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    const firstLocated = observation.first.warnings.find(
      (warning) => warning.code === "UNSUPPORTED_LAYOUT" && warning.sourceIdentity !== undefined,
    );
    expect(observation.first.targetPage).toBeGreaterThan(1);
    expect(firstLocated?.location).toEqual({
      generation: 1,
      entryId: "layout",
      page: observation.first.targetPage,
    });
    expect(firstLocated?.locationFrozen).toBe(true);

    const firstFallback = observation.first.warnings.find(
      (warning) => warning.code === "HYPHENATION_FALLBACK",
    );
    expect(observation.first.fallbackPage).toBeGreaterThan(1);
    expect(firstFallback?.location).toEqual({
      generation: 1,
      entryId: "layout",
      page: observation.first.fallbackPage,
    });
    expect(firstFallback?.locationFrozen).toBe(true);

    const unknown = observation.first.warnings.find(
      (warning) => warning.code === "RESOURCE_BLOCKED",
    );
    expect(unknown?.location).toEqual({ generation: 1, entryId: undefined, page: undefined });
    expect(unknown?.locationFrozen).toBe(true);
    expect(Object.keys(unknown?.location ?? {}).sort()).toEqual(["entryId", "generation", "page"]);
    for (const secret of observation.secrets) {
      expect(observation.first.serializedWarnings).not.toContain(secret);
    }

    const secondLocated = observation.second.warnings.find(
      (warning) => warning.code === "UNSUPPORTED_LAYOUT" && warning.sourceIdentity !== undefined,
    );
    expect(secondLocated?.location).toEqual({
      generation: 2,
      entryId: "replacement",
      page: observation.second.targetPage,
    });
    expect(observation.currentGeneration).toBe(2);
    expect(observation.currentWarnings).toEqual(
      observation.second.warnings.map(({ code, sourceIdentity, location }) => ({
        code,
        sourceIdentity,
        location,
      })),
    );
    expect(
      observation.currentWarnings.every(
        (warning) => warning.location?.generation === 2 && warning.location.entryId !== "layout",
      ),
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("attributes generated warning locations to trusted authored content", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as CoreModule;
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const controller = core.mountPublication(host, {
        metadata: { title: "Generated diagnostic provenance" },
        entries: [
          {
            id: "generated",
            title: "Generated",
            html: `
              <style>
                #generated-host::before {
                  content: target-counter(attr(href), page);
                  display: flex;
                  flex-direction: row;
                }
              </style>
              <div id="generated-host" href="#target">
                <span data-authored-collision style="display: block; break-before: page">
                  AUTHORED-COLLISION
                </span>
              </div>
            `,
          },
          {
            id: "target",
            title: "Target",
            html: '<h1 id="target">TARGET</h1>',
          },
        ],
      });
      try {
        const document = await controller.ready;
        const frameDocument = document.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const pageFor = (selector: string) =>
          Number(
            frameDocument
              .querySelector(selector)
              ?.closest("[data-imposia-page]")
              ?.getAttribute("data-imposia-page-number"),
          );
        const warning = document.warnings.find(
          (candidate) =>
            candidate.code === "UNSUPPORTED_LAYOUT" &&
            candidate.sourceIdentity?.endsWith(":div") === true,
        );
        return {
          generatedPage: pageFor('[data-imposia-generated="target-counter"]'),
          collisionPage: pageFor("[data-authored-collision]"),
          warning:
            warning === undefined
              ? null
              : {
                  sourceIdentity: warning.sourceIdentity,
                  location: warning.location,
                },
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.generatedPage).toBeGreaterThan(0);
    expect(observation.collisionPage).toBeGreaterThan(observation.generatedPage);
    expect(observation.warning?.sourceIdentity).toMatch(/^source-[1-9][0-9]*:div$/u);
    expect(observation.warning?.location).toEqual({
      generation: 1,
      entryId: "generated",
      page: observation.generatedPage,
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
