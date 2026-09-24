import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// ASA-434 stage 1: right-to-left documents keep their text direction and warn
// that page progression stays left to right.

test("keeps the declared text direction and warns about left-to-right page progression", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      type Warning = { code: string; property?: string; value?: string; recovery?: string };
      type Ready = {
        iframe: HTMLIFrameElement;
        warnings: readonly Warning[];
      };
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          host: HTMLElement,
          source: { html: string },
        ): { ready: Promise<Ready>; destroy(): Promise<void> };
        mountPublication(
          host: HTMLElement,
          snapshot: unknown,
        ): { ready: Promise<Ready>; destroy(): Promise<void> };
      };
      const read = async (
        mount: (host: HTMLElement) => { ready: Promise<Ready>; destroy(): Promise<void> },
      ) => {
        const host = document.body.appendChild(document.createElement("div"));
        const controller = mount(host);
        try {
          const ready = await controller.ready;
          const frame = ready.iframe.contentDocument;
          if (frame === null) throw new Error("Missing canonical frame.");
          const target = frame.getElementById("t");
          return {
            direction:
              target === null
                ? null
                : (frame.defaultView?.getComputedStyle(target).direction ?? null),
            warnings: ready.warnings
              .filter((warning) => warning.code === "UNSUPPORTED_FRAGMENTATION_CONTEXT")
              .map((warning) => ({ property: warning.property, value: warning.value })),
          };
        } finally {
          await controller.destroy();
          host.remove();
        }
      };
      const documentCase = (html: string) => read((host) => core.mountPageDocument(host, { html }));
      return {
        htmlDir: await documentCase(
          '<!doctype html><html dir="rtl" lang="ar"><body><p id="t">مرحبا بالعالم</p></body></html>',
        ),
        bodyDir: await documentCase(
          '<!doctype html><html lang="he"><body dir="rtl"><p id="t">שלום עולם</p></body></html>',
        ),
        cssDirection: await documentCase(
          '<style>body { direction: rtl; }</style><p id="t">مرحبا</p>',
        ),
        leftToRight: await documentCase('<p id="t">Hello</p>'),
        nestedRtl: await documentCase('<p>Hello</p><div dir="rtl"><p id="t">مرحبا</p></div>'),
        publicationEntry: await read((host) =>
          core.mountPublication(host, {
            metadata: { title: "Mixed", language: "en" },
            entries: [
              { id: "en", title: "English", html: "<p>Hello</p>" },
              {
                id: "ar",
                title: "Arabic",
                html: '<!doctype html><html dir="rtl"><body><p id="t">مرحبا</p></body></html>',
              },
            ],
          }),
        ),
      };
    });

    const warned = [{ property: "direction", value: "rtl" }];
    expect(observation.htmlDir).toEqual({ direction: "rtl", warnings: warned });
    expect(observation.bodyDir).toEqual({ direction: "rtl", warnings: warned });
    expect(observation.cssDirection).toEqual({ direction: "rtl", warnings: warned });
    expect(observation.publicationEntry).toEqual({ direction: "rtl", warnings: warned });
    expect(observation.leftToRight).toEqual({ direction: "ltr", warnings: [] });
    // A right-to-left passage inside a left-to-right document does not change
    // page progression, so it keeps its direction without a warning.
    expect(observation.nestedRtl).toEqual({ direction: "rtl", warnings: [] });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("carries a declared right-to-left direction into the reflowable EPUB", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  try {
    const archiveText = await page.evaluate(async () => {
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          host: HTMLElement,
          source: { html: string },
        ): {
          ready: Promise<{
            exportEpub(options: {
              metadata: { title: string; language: string; identifier: string };
            }): Promise<Blob>;
          }>;
          destroy(): Promise<void>;
        };
      };
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPageDocument(host, {
        html: '<!doctype html><html dir="rtl" lang="ar"><body><p>مرحبا</p></body></html>',
      });
      try {
        const ready = await controller.ready;
        const blob = await ready.exportEpub({
          metadata: { title: "RTL", language: "ar", identifier: "urn:test:rtl" },
        });
        // Store-mode archive: entry bytes are uncompressed and searchable.
        return new TextDecoder().decode(await blob.arrayBuffer());
      } finally {
        await controller.destroy();
        host.remove();
      }
    });
    expect(archiveText).toContain('dir="rtl"');
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
