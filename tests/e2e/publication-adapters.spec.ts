import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type ArchiveEntry = Readonly<{ name: string; bytes: Uint8Array }>;

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

function inspectArchive(bytes: Uint8Array): readonly ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("EPUB ZIP end record is missing.");
  const count = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const entries: ArchiveEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error("EPUB central record is invalid.");
    }
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`EPUB local record is invalid for ${name}.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ name, bytes: bytes.slice(dataOffset, dataOffset + compressedSize) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryText(entries: readonly ArchiveEntry[], name: string): string {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`Missing EPUB entry ${name}.`);
  return new TextDecoder().decode(entry.bytes);
}

test("exports Publication entries as ordered EPUB spine documents with shared outline navigation", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://sources.invalid/")) externalRequests.push(request.url());
  });

  await page.goto("/examples/book.html");
  try {
    const bytes = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPublication(host, {
        metadata: { title: "Field Guide", language: "en", identifier: "urn:field-guide" },
        entries: [
          {
            id: "cover",
            title: "Cover",
            baseUrl: "https://sources.invalid/cover/",
            html: '<h1 id="cover-title">Field Guide</h1><p>Cover copy.</p>',
          },
          {
            id: "chapter-one",
            title: "Chapter\u0001One",
            baseUrl: "https://sources.invalid/chapter-one/",
            html: [
              '<style>.remote{background-image:image-set("https://sources.invalid/tracker.png" 1x);mask-image:cross-fade("https://sources.invalid/mask.png",white 50%)}.vendor{background-image:-webkit-image-set("https://sources.invalid/vendor.png" 1x)}.standard{background-image:image("https://sources.invalid/image.png")}</style>',
              "<!--unsafe\u0001comment-->",
              '<p id="item\u0001">First normalized ID.</p><p id="item\u0002">Second normalized ID.</p>',
              '<p id="imposia-entry-chapter-2d-one--id-section">Collision decoy.</p>',
              '<h1 id="chapter-title" style="break-before:page">Chapter One</h1>',
              '<h2 id="section">First section</h2>',
              '<h2 id="section">Second section</h2>',
              '<p><a href="https://sources.invalid/reference">Reference</a>Chapter copy.</p>',
            ].join(""),
          },
        ],
      });
      try {
        const publication = await controller.ready;
        const epub = await publication.exportEpub({
          metadata: {
            title: "Field Guide",
            language: "en",
            identifier: "urn:field-guide",
            modified: "2026-07-19T00:00:00Z",
          },
        });
        return [...new Uint8Array(await epub.arrayBuffer())];
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    const entries = inspectArchive(Uint8Array.from(bytes));
    expect(entries.map((entry) => entry.name)).toEqual([
      "mimetype",
      "META-INF/container.xml",
      "EPUB/package.opf",
      "EPUB/nav.xhtml",
      "EPUB/entry-0001.xhtml",
      "EPUB/entry-0002.xhtml",
      "EPUB/styles.css",
    ]);
    const packageDocument = entryText(entries, "EPUB/package.opf");
    expect(packageDocument).toContain(
      '<spine><itemref idref="entry-0001"/><itemref idref="entry-0002"/></spine>',
    );
    expect(packageDocument.indexOf('href="entry-0001.xhtml"')).toBeLessThan(
      packageDocument.indexOf('href="entry-0002.xhtml"'),
    );

    const navigation = entryText(entries, "EPUB/nav.xhtml");
    const coverDestination = "entry-0001.xhtml#imposia-entry-cover--id-cover-2d-title";
    const chapterDestination = "entry-0002.xhtml#imposia-entry-chapter-2d-one--id-chapter-2d-title";
    const sectionDestination = "entry-0002.xhtml#imposia-entry-chapter-2d-one--id-section";
    expect(navigation).toContain(`href="${coverDestination}">Field Guide</a>`);
    expect(navigation).toContain(`href="${chapterDestination}">Chapter One</a>`);
    expect(navigation).toContain(`href="${sectionDestination}">First section</a>`);
    expect(navigation.indexOf(coverDestination)).toBeLessThan(
      navigation.indexOf(chapterDestination),
    );
    expect(navigation.indexOf(chapterDestination)).toBeLessThan(
      navigation.indexOf(sectionDestination),
    );
    expect(navigation).toContain("Chapter�One");
    expect(navigation).not.toContain("\u0001");

    const cover = entryText(entries, "EPUB/entry-0001.xhtml");
    const chapter = entryText(entries, "EPUB/entry-0002.xhtml");
    const styles = entryText(entries, "EPUB/styles.css");
    expect(cover).toContain("Cover copy.");
    expect(cover).not.toContain("Chapter copy.");
    expect(chapter).toContain("Chapter copy.");
    expect(chapter).not.toContain("Cover copy.");
    expect(chapter).not.toContain("unsafe");
    expect(chapter).not.toContain("\u0001");
    expect(chapter).not.toContain("\u0002");
    expect(cover).toContain('id="imposia-entry-cover--id-cover-2d-title"');
    expect(chapter).toContain('id="imposia-entry-chapter-2d-one--id-section"');
    const chapterIds = [...chapter.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(chapterIds).size).toBe(chapterIds.length);
    const chapterDestinations = [...navigation.matchAll(/href="entry-0002\.xhtml#([^"]+)"/gu)].map(
      (match) => match[1],
    );
    expect(chapterDestinations.every((destination) => chapterIds.includes(destination))).toBe(true);
    expect(styles).not.toMatch(/sources\.invalid|image-set|cross-fade|\bimage\(/iu);
    expect(externalRequests).toEqual([]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("Client re-exports the Core Publication controller without another runtime boundary", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const importMap = document.createElement("script");
      importMap.type = "importmap";
      importMap.textContent = JSON.stringify({
        imports: {
          "@imposia/core": "/packages/core/dist/index.js",
          "@imposia/viewer": "/packages/viewer/dist/index.js",
          "pdfjs-dist": "/node_modules/pdfjs-dist/build/pdf.mjs",
        },
      });
      document.head.append(importMap);
      const [core, client] = await Promise.all([
        import("/packages/core/dist/index.js"),
        import("/packages/client/dist/index.js"),
      ]);
      const host = document.body.appendChild(document.createElement("div"));
      const sameMount = client.mountPublication === core.mountPublication;
      const controller = client.mountPublication(host, {
        metadata: { title: "Client publication" },
        entries: [{ id: "first", title: "First", html: "<h1>First heading</h1>" }],
      });
      try {
        const first = await controller.ready;
        const second = await controller.update({
          metadata: { title: "Client publication updated" },
          entries: [
            {
              id: "second",
              title: "Second",
              html: '<h1 style="break-before:page">Second heading</h1>',
            },
          ],
        });
        return {
          sameMount,
          first: { title: first.metadata.title, outline: first.outline[0]?.title },
          current: {
            title: controller.current?.metadata.title,
            outline: controller.current?.outline[0]?.title,
            generation: controller.current?.generation,
          },
          secondGeneration: second.generation,
          canonicalFrames: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
            .length,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation).toEqual({
      sameMount: true,
      first: { title: "Client publication", outline: "First" },
      current: {
        title: "Client publication updated",
        outline: "Second",
        generation: 2,
      },
      secondGeneration: 2,
      canonicalFrames: 1,
    });
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("React StrictMode publishes only the latest rapidly replaced Publication", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/react/");
  try {
    const host = page.locator(".react-publication-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await expect(host.locator('iframe[data-imposia-frame="page-document"]')).toHaveCount(1);
    await expect(host.getByRole("button", { name: "Contents" })).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const fixture = (
            globalThis as {
              imposiaPublicationObservation: {
                strictEffectMounts: number;
                strictEffectCleanups: number;
              };
            }
          ).imposiaPublicationObservation;
          return { mounts: fixture.strictEffectMounts, cleanups: fixture.strictEffectCleanups };
        }),
      )
      .toEqual({ mounts: 2, cleanups: 1 });
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(
        '.react-publication-host iframe[data-imposia-frame="page-document"]',
      );
      const observation = (
        globalThis as {
          imposiaPublicationObservation: {
            startSlowReplacement: (() => void) | undefined;
            commitFinalReplacement: (() => void) | undefined;
          };
        }
      ).imposiaPublicationObservation;
      if (frame === null || observation.startSlowReplacement === undefined) {
        throw new Error("React Publication fixture did not initialize.");
      }
      Reflect.set(globalThis, "__imposiaPublicationFrame", frame);
      observation.handle?.openTableOfContents();
      observation.startSlowReplacement();
    });

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as {
                imposiaPublicationObservation: { slowResolverStarted: boolean };
              }
            ).imposiaPublicationObservation.slowResolverStarted,
        ),
      )
      .toBe(true);
    await expect(host.locator('iframe[data-imposia-frame="page-document-staging"]')).toHaveCount(1);
    await expect(host.getByRole("button", { name: "Contents" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaPublicationObservation: {
            commitFinalReplacement: (() => void) | undefined;
          };
        }
      ).imposiaPublicationObservation;
      if (observation.commitFinalReplacement === undefined) {
        throw new Error("React Publication fixture cannot commit its final replacement.");
      }
      observation.commitFinalReplacement();
    });

    await expect(host).toHaveAttribute("data-imposia-generation", "2");
    await expect(host.locator("iframe").contentFrame().locator("body")).toContainText(
      "Final publication copy",
    );
    const observation = await page.evaluate(async () => {
      const fixture = (
        globalThis as {
          imposiaPublicationObservation: {
            readyTitles: string[];
            errors: string[];
            strictEffectMounts: number;
            strictEffectCleanups: number;
            readerReadyGenerations: number[];
            readerReadyStateNavigations: number[];
            deepLinks: Array<string | undefined>;
            handle:
              | {
                  readonly current:
                    | {
                        metadata: { title: string };
                        outline: readonly { title: string; destination: { id: string } }[];
                      }
                    | undefined;
                  resolveDestination(id: string): { id: string; generation: number } | undefined;
                  openTableOfContents(): void;
                  closeTableOfContents(): void;
                  restoreDeepLink(value: string): { id: string; generation: number } | undefined;
                  exportEpub(options: {
                    metadata: { title: string; language: string; identifier: string };
                  }): Promise<Blob>;
                }
              | undefined;
          };
        }
      ).imposiaPublicationObservation;
      const current = fixture.handle?.current;
      const destinationId = current?.outline[0]?.destination.id;
      const destination =
        destinationId === undefined ? undefined : fixture.handle?.resolveDestination(destinationId);
      fixture.handle?.openTableOfContents();
      const tocOpened =
        document
          .querySelector<HTMLButtonElement>(".react-publication-host .imposia-toc-toggle")
          ?.getAttribute("aria-expanded") === "true";
      fixture.handle?.closeTableOfContents();
      const readerRestored =
        destinationId === undefined
          ? undefined
          : fixture.handle?.restoreDeepLink(`v1.${encodeURIComponent(destinationId)}`);
      const epub = await fixture.handle?.exportEpub({
        metadata: {
          title: "React publication",
          language: "en",
          identifier: "urn:react:publication",
        },
      });
      const host = document.querySelector<HTMLElement>(".react-publication-host");
      return {
        readyTitles: fixture.readyTitles,
        errors: fixture.errors,
        strictEffectMounts: fixture.strictEffectMounts,
        strictEffectCleanups: fixture.strictEffectCleanups,
        readerReadyGenerations: fixture.readerReadyGenerations,
        readerReadyStateNavigations: fixture.readerReadyStateNavigations,
        deepLinks: fixture.deepLinks,
        currentTitle: current?.metadata.title,
        outlineTitle: current?.outline[0]?.title,
        destination:
          destination === undefined
            ? undefined
            : { id: destination.id, generation: destination.generation },
        readerRestored:
          readerRestored === undefined
            ? undefined
            : { id: readerRestored.id, generation: readerRestored.generation },
        tocOpened,
        epubType: epub?.type,
        sameFrame:
          Reflect.get(globalThis, "__imposiaPublicationFrame") ===
          host?.querySelector('iframe[data-imposia-frame="page-document"]'),
        canonicalFrames:
          host?.querySelectorAll('iframe[data-imposia-frame="page-document"]').length ?? 0,
        stagingFrames:
          host?.querySelectorAll('iframe[data-imposia-frame="page-document-staging"]').length ?? 0,
      };
    });

    expect([
      [
        "v1.imposia-entry-initial",
        "v1.imposia-entry-initial",
        "v1.imposia-entry-final",
        "v1.imposia-entry-final",
      ],
      [
        "v1.imposia-entry-initial",
        "v1.imposia-entry-initial",
        undefined,
        "v1.imposia-entry-final",
        "v1.imposia-entry-final",
      ],
    ]).toContainEqual(observation.deepLinks);
    expect(observation).toEqual({
      readyTitles: ["Initial publication", "Final publication"],
      errors: [],
      strictEffectMounts: 2,
      strictEffectCleanups: 1,
      readerReadyGenerations: [1, 2],
      readerReadyStateNavigations: [1],
      deepLinks: observation.deepLinks,
      currentTitle: "Final publication",
      outlineTitle: "Final entry",
      destination: { id: "imposia-entry-final", generation: 2 },
      readerRestored: { id: "imposia-entry-final", generation: 2 },
      tocOpened: true,
      epubType: "application/epub+zip",
      sameFrame: true,
      canonicalFrames: 1,
      stagingFrames: 0,
    });

    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".react-publication-host");
      const fixture = (
        globalThis as {
          imposiaPublicationObservation: { bumpOptionsRevision: (() => void) | undefined };
        }
      ).imposiaPublicationObservation;
      const frame = host?.querySelector('iframe[data-imposia-frame="page-document"]');
      if (frame === null || frame === undefined || fixture.bumpOptionsRevision === undefined) {
        throw new Error("React Publication options-revision fixture is unavailable.");
      }
      Reflect.set(globalThis, "__imposiaPublicationOptionsFrame", frame);
      fixture.bumpOptionsRevision();
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Reflect.get(globalThis, "__imposiaPublicationOptionsFrame") !==
            document.querySelector(
              '.react-publication-host iframe[data-imposia-frame="page-document"]',
            ),
        ),
      )
      .toBe(true);
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await expect(host).toHaveAttribute("data-imposia-generation", "1");
    await expect(host.locator('iframe[data-imposia-frame="page-document"]')).toHaveCount(1);
    expect(
      await page.evaluate(
        () =>
          (globalThis as { imposiaPublicationObservation: { errors: string[] } })
            .imposiaPublicationObservation.errors,
      ),
    ).toEqual([]);

    const disposed = await page.evaluate(async () => {
      const fixture = (
        globalThis as {
          imposiaPublicationObservation: {
            handle:
              | {
                  readonly current: unknown;
                  exportEpub(options: {
                    metadata: { title: string; language: string; identifier: string };
                  }): Promise<Blob>;
                }
              | undefined;
          };
          imposiaReactObservation: { unmount: (() => void) | undefined };
        }
      ).imposiaPublicationObservation;
      const handle = fixture.handle;
      (
        globalThis as unknown as {
          imposiaReactObservation: { unmount: (() => void) | undefined };
        }
      ).imposiaReactObservation.unmount?.();
      let exportError = "";
      try {
        await handle?.exportEpub({
          metadata: { title: "Disposed", language: "en", identifier: "urn:disposed" },
        });
      } catch (error: unknown) {
        exportError = error instanceof Error ? error.message : String(error);
      }
      return { currentCleared: handle?.current === undefined, exportError };
    });
    expect(disposed).toEqual({
      currentCleared: true,
      exportError: "ImposiaPublicationViewer is not mounted.",
    });
    await expect(page.locator("#app iframe")).toHaveCount(0);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
