import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("derives one committed outline from entry metadata and sanitized heading hierarchy", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPublication(host, {
        metadata: { title: "Field Guide" },
        entries: [
          {
            id: "cover",
            title: "Cover",
            html: '<h1 id="cover-title">Visible cover</h1>',
          },
          {
            id: "chapter",
            title: "Chapter One",
            html: [
              '<h1 id="chapter-title" style="break-before:page">Chapter One heading</h1>',
              '<h2 id="section-a">Section A</h2>',
              "<h3>Detail</h3>",
              '<h2 id="section-b">Section B</h2>',
            ].join(""),
          },
        ],
      });
      try {
        const publication = await controller.ready;
        return {
          outline: publication.outline,
          frozen:
            Array.isArray(publication.outline) &&
            Object.isFrozen(publication.outline) &&
            Object.isFrozen(publication.outline[1]?.children),
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.outline).toEqual([
      {
        kind: "entry",
        title: "Cover",
        level: 0,
        destination: {
          id: "imposia-entry-cover",
          entryId: "cover",
          page: 1,
          generation: 1,
        },
        children: [
          {
            kind: "heading",
            title: "Visible cover",
            level: 1,
            destination: {
              id: "imposia-entry-cover--id-cover-2d-title",
              entryId: "cover",
              page: 1,
              generation: 1,
            },
            children: [],
          },
        ],
      },
      {
        kind: "entry",
        title: "Chapter One",
        level: 0,
        destination: {
          id: "imposia-entry-chapter",
          entryId: "chapter",
          page: 2,
          generation: 1,
        },
        children: [
          {
            kind: "heading",
            title: "Chapter One heading",
            level: 1,
            destination: {
              id: "imposia-entry-chapter--id-chapter-2d-title",
              entryId: "chapter",
              page: 2,
              generation: 1,
            },
            children: [
              {
                kind: "heading",
                title: "Section A",
                level: 2,
                destination: {
                  id: "imposia-entry-chapter--id-section-2d-a",
                  entryId: "chapter",
                  page: 2,
                  generation: 1,
                },
                children: [
                  {
                    kind: "heading",
                    title: "Detail",
                    level: 3,
                    destination: {
                      id: "imposia-entry-chapter--heading-3",
                      entryId: "chapter",
                      page: 2,
                      generation: 1,
                    },
                    children: [],
                  },
                ],
              },
              {
                kind: "heading",
                title: "Section B",
                level: 2,
                destination: {
                  id: "imposia-entry-chapter--id-section-2d-b",
                  entryId: "chapter",
                  page: 2,
                  generation: 1,
                },
                children: [],
              },
            ],
          },
        ],
      },
    ]);
    expect(observation.frozen).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("normalizes unsafe and duplicate heading ids while excluding hidden authored content", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPublication(host, {
        metadata: { title: "Recovered outline" },
        entries: [
          {
            id: "part/one",
            title: "Part One",
            html: [
              '<h1 id="safe title"><script>bad()</script>Safe <em>title</em></h1>',
              '<h3 id="same">Gap level</h3>',
              '<h5 id="same">Duplicate id</h5>',
              '<section hidden><h2 id="hidden">Hidden heading</h2></section>',
              '<script><h2 id="scripted">Script heading</h2></script>',
              '<style>.example::before{content:"not a heading"}#css-hidden{display:none}</style>',
              '<h2>Generated <span style="display:none">secret</span>destination</h2>',
              '<h2 id="css-hidden">CSS hidden heading</h2>',
              '<details><summary>Closed details</summary><h2 id="closed">Closed heading</h2></details>',
              '<h2 id="inert" inert>Inert heading</h2>',
              '<h2 id="aria-hidden" aria-hidden="TRUE">ARIA hidden heading</h2>',
            ].join(""),
          },
        ],
      });
      try {
        const publication = await controller.ready;
        return {
          outline: publication.outline,
          warnings: publication.warnings.map((warning) => warning.code),
          destinationIds: [
            ...publication.outline.flatMap(function collect(item): string[] {
              return [item.destination.id, ...item.children.flatMap(collect)];
            }),
          ],
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.outline).toEqual([
      {
        kind: "entry",
        title: "Part One",
        level: 0,
        destination: {
          id: "imposia-entry-part-2f-one",
          entryId: "part/one",
          page: 1,
          generation: 1,
        },
        children: [
          {
            kind: "heading",
            title: "Safe title",
            level: 1,
            destination: {
              id: "imposia-entry-part-2f-one--id-safe-20-title",
              entryId: "part/one",
              page: 1,
              generation: 1,
            },
            children: [
              {
                kind: "heading",
                title: "Gap level",
                level: 3,
                destination: {
                  id: "imposia-entry-part-2f-one--id-same",
                  entryId: "part/one",
                  page: 1,
                  generation: 1,
                },
                children: [
                  {
                    kind: "heading",
                    title: "Duplicate id",
                    level: 5,
                    destination: {
                      id: "imposia-entry-part-2f-one--id-same-2",
                      entryId: "part/one",
                      page: 1,
                      generation: 1,
                    },
                    children: [],
                  },
                ],
              },
              {
                kind: "heading",
                title: "Generated destination",
                level: 2,
                destination: {
                  id: "imposia-entry-part-2f-one--heading-4",
                  entryId: "part/one",
                  page: 1,
                  generation: 1,
                },
                children: [],
              },
            ],
          },
        ],
      },
    ]);
    expect(observation.warnings).toContain("REFERENCE_DUPLICATE");
    expect(new Set(observation.destinationIds).size).toBe(observation.destinationIds.length);
    expect(
      observation.destinationIds.every((destination) => /^[A-Za-z0-9._~-]+$/u.test(destination)),
    ).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("resolves and moves only current committed destinations across updates", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPublication(host, {
        metadata: { title: "Navigation" },
        entries: [
          {
            id: "chapter",
            title: "Chapter",
            html: [
              '<div data-imposia-publication-destination="imposia-entry-chapter--id-move-2d-here">Spoofed destination</div>',
              '<h1 id="chapter">Chapter</h1>',
              '<h2 id="move-here" style="break-before:page">Move here</h2>',
              '<h2 id="old-only">Old only</h2>',
            ].join(""),
          },
        ],
      });
      try {
        const committed = await controller.ready;
        const moveId = committed.outline[0]?.children[0]?.children[0]?.destination.id;
        const oldOnlyId = committed.outline[0]?.children[0]?.children[1]?.destination.id;
        if (moveId === undefined || oldOnlyId === undefined)
          throw new Error("Missing outline ids.");
        const before = controller.resolveDestination(moveId);
        if (before === undefined) throw new Error("Missing current destination.");
        committed.iframe.contentWindow?.scrollTo(0, 0);
        controller.navigate(before);
        const movedBeforeUpdate = committed.iframe.contentWindow?.scrollY ?? 0;

        const updated = await controller.update({
          metadata: { title: "Navigation updated" },
          entries: [
            {
              id: "chapter",
              title: "Chapter",
              html: [
                '<h1 id="chapter">Chapter</h1>',
                '<h2 id="move-here" style="break-before:page">Move here updated</h2>',
                '<h2 id="replacement">Replacement</h2>',
              ].join(""),
            },
          ],
        });
        const current = controller.resolveDestination(moveId);
        const removed = controller.resolveDestination(oldOnlyId);
        updated.iframe.contentWindow?.scrollTo(0, 0);
        const stale = (() => {
          try {
            controller.navigate(before);
            return { status: "fulfilled" as const, code: "" };
          } catch (error: unknown) {
            return {
              status: "rejected" as const,
              code: error instanceof core.ImposiaError ? error.code : "unknown",
            };
          }
        })();
        const movedByStale = updated.iframe.contentWindow?.scrollY ?? 0;
        if (current === undefined) throw new Error("Missing updated destination.");
        controller.navigate(current);
        return {
          moveId,
          before,
          current,
          movedBeforeUpdate,
          movedAfterUpdate: updated.iframe.contentWindow?.scrollY ?? 0,
          movedByStale,
          removed,
          stale,
          currentOnly:
            controller.current === updated &&
            Object.isFrozen(updated.outline) &&
            Object.isFrozen(current),
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.before.id).toBe(observation.moveId);
    expect(observation.before.generation).toBe(1);
    expect(observation.before.page).toBe(2);
    expect(observation.current.id).toBe(observation.moveId);
    expect(observation.current.generation).toBe(2);
    expect(observation.current.page).toBe(2);
    expect(observation.movedBeforeUpdate).toBeGreaterThan(0);
    expect(observation.movedAfterUpdate).toBeGreaterThan(0);
    expect(observation.movedByStale).toBe(0);
    expect(observation.removed).toBeUndefined();
    expect(observation.stale).toEqual({
      status: "rejected",
      code: "STALE_PUBLICATION_DESTINATION",
    });
    expect(observation.currentOnly).toBe(true);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("preserves a complete visible title when a heading fragments across pages", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const title = Array.from({ length: 80 }, (_, index) => `heading-${index + 1}`).join(" ");
      const controller = core.mountPublication(
        host,
        {
          metadata: { title: "Fragmented heading" },
          entries: [
            {
              id: "long-heading",
              title: "Long heading",
              html: `<h1 id="long" style="margin:0;font:16px/20px Arial,sans-serif">${title}</h1>`,
            },
          ],
        },
        {
          page: {
            size: { width: "180px", height: "160px" },
            margin: "12px",
          },
        },
      );
      try {
        const publication = await controller.ready;
        return {
          title,
          outlineTitle: publication.outline[0]?.children[0]?.title,
          headingFragments: publication.iframe.contentDocument?.querySelectorAll("h1").length ?? 0,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.headingFragments).toBeGreaterThan(1);
    expect(observation.outlineTitle).toBe(observation.title);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("does not duplicate a heading title from repeated table headers", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const rows = Array.from(
        { length: 18 },
        (_, index) => `<tr><td>Inventory row ${index + 1}</td></tr>`,
      ).join("");
      const controller = core.mountPublication(
        host,
        {
          metadata: { title: "Repeated header" },
          entries: [
            {
              id: "inventory",
              title: "Inventory entry",
              html: [
                "<style>table{border-collapse:collapse}tr{height:44px}h2{margin:0;font:16px/20px Arial,sans-serif}</style>",
                '<table><thead><tr><th><h2 id="inventory-title">Inventory</h2></th></tr></thead>',
                `<tbody>${rows}</tbody></table>`,
              ].join(""),
            },
          ],
        },
        {
          page: {
            size: { width: "240px", height: "200px" },
            margin: "12px",
          },
        },
      );
      try {
        const publication = await controller.ready;
        return {
          outlineTitle: publication.outline[0]?.children[0]?.title,
          headerCopies:
            publication.iframe.contentDocument?.querySelectorAll("thead h2").length ?? 0,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.headerCopies).toBeGreaterThan(1);
    expect(observation.outlineTitle).toBe("Inventory");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("publishes current metadata and outline in the same observable commit as canonical pages", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const progress: Array<{ title: string | undefined; text: string }> = [];
      let monitorProgress = false;
      let controller: ReturnType<typeof core.mountPublication> | undefined;
      controller = core.mountPublication(
        host,
        {
          metadata: { title: "Before" },
          entries: [{ id: "before", title: "Before", html: "<h1>Before heading</h1>" }],
        },
        {
          onProgress() {
            if (!monitorProgress) return;
            progress.push({
              title: controller?.current?.metadata.title,
              text: controller?.current?.iframe.contentDocument?.body.textContent ?? "",
            });
          },
        },
      );
      try {
        const before = await controller.ready;
        const frameDocument = before.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const mutations: Array<{
          title: string | undefined;
          generation: number | undefined;
          text: string;
          outline: string | undefined;
        }> = [];
        const observer = new MutationObserver(() => {
          mutations.push({
            title: controller?.current?.metadata.title,
            generation: controller?.current?.generation,
            text: frameDocument.body.textContent ?? "",
            outline: controller?.current?.outline[0]?.title,
          });
        });
        observer.observe(frameDocument.body, { childList: true });
        monitorProgress = true;
        const updated = await controller.update({
          metadata: { title: "After" },
          entries: [
            {
              id: "after",
              title: "After entry",
              html: '<h1 style="break-before:page">After heading</h1>',
            },
          ],
        });
        await Promise.resolve();
        observer.disconnect();
        return {
          progress,
          mutations,
          current: {
            title: controller.current?.metadata.title,
            generation: controller.current?.generation,
            outline: controller.current?.outline[0]?.title,
          },
          updatedGeneration: updated.generation,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.progress.length).toBeGreaterThan(0);
    expect(observation.progress).toEqual(
      observation.progress.map(() => ({
        title: "Before",
        text: expect.stringContaining("Before"),
      })),
    );
    expect(observation.mutations.length).toBeGreaterThan(0);
    for (const mutation of observation.mutations) {
      expect(mutation).toEqual({
        title: "After",
        generation: 2,
        text: expect.stringContaining("After heading"),
        outline: "After entry",
      });
    }
    expect(observation.current).toEqual({ title: "After", generation: 2, outline: "After entry" });
    expect(observation.updatedGeneration).toBe(2);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
