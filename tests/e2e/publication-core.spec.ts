import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("commits ordered Publication entries as one global page sequence", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const chapter = document.createElement("article");
      chapter.style.breakBefore = "page";
      chapter.innerHTML = "<h1>First chapter</h1><p>Chapter text.</p>";
      const controller = core.mountPublication(host, {
        metadata: { title: "Field Notes", language: "en" },
        entries: [
          { id: "preface", title: "Preface", html: "<h1>Preface</h1><p>Opening note.</p>" },
          {
            id: "chapter-1",
            title: "First chapter",
            lightDom: chapter,
          },
        ],
      });
      try {
        const publication = await controller.ready;
        const frameDocument = publication.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        return {
          metadata: publication.metadata,
          entries: publication.entries,
          pageCount: publication.pageCount,
          pageNumbers: publication.pages.map((item) => item.number),
          canonicalCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
            .length,
          stagingCount: host.querySelectorAll('iframe[data-imposia-frame="page-document-staging"]')
            .length,
          text: frameDocument.body.textContent ?? "",
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.metadata).toEqual({ title: "Field Notes", language: "en" });
    expect(observation.entries).toEqual([
      { id: "preface", title: "Preface", pageRange: { start: 1, end: 1 } },
      { id: "chapter-1", title: "First chapter", pageRange: { start: 2, end: 2 } },
    ]);
    expect(observation.pageCount).toBe(2);
    expect(observation.pageNumbers).toEqual([1, 2]);
    expect(observation.canonicalCount).toBe(1);
    expect(observation.stagingCount).toBe(0);
    expect(observation.text.indexOf("Opening note.")).toBeLessThan(
      observation.text.indexOf("Chapter text."),
    );
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("rejects invalid snapshots before staging and preserves the committed Publication", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const invalidMount = (() => {
        try {
          core.mountPublication(host, { metadata: { title: "Invalid" }, entries: [] });
          return { status: "fulfilled" as const, code: "" };
        } catch (error: unknown) {
          return {
            status: "rejected" as const,
            code: error instanceof core.ImposiaError ? error.code : "unknown",
          };
        }
      })();
      const frameCountAfterInvalidMount = host.querySelectorAll("iframe").length;
      const unsupportedExtension = (() => {
        try {
          Reflect.apply(core.mountPublication, undefined, [
            host,
            {
              metadata: { title: "Unsupported extension" },
              entries: [{ id: "entry", title: "Entry", html: "<p>Entry.</p>" }],
            },
            {
              extensions: [
                {
                  name: "legacy/document-transform",
                  transform() {
                    return { html: "<p>Unsafe composed transform.</p>" };
                  },
                },
              ],
            },
          ]);
          return { status: "fulfilled" as const, code: "" };
        } catch (error: unknown) {
          return {
            status: "rejected" as const,
            code: error instanceof core.ImposiaError ? error.code : "unknown",
          };
        }
      })();
      const frameCountAfterUnsupportedExtension = host.querySelectorAll("iframe").length;
      const controller = core.mountPublication(host, {
        metadata: { title: "Committed" },
        entries: [
          { id: "one", title: "One", html: "<p>Committed one.</p>" },
          { id: "two", title: "Two", html: "<p>Committed two.</p>" },
        ],
      });
      try {
        const committed = await controller.ready;
        const failed = await controller
          .update({
            metadata: { title: "Rejected" },
            entries: [
              { id: "duplicate", title: "Duplicate one", html: "<p>Rejected one.</p>" },
              { id: "duplicate", title: "Duplicate two", html: "<p>Rejected two.</p>" },
            ],
          })
          .then(
            () => ({ status: "fulfilled" as const, code: "" }),
            (error: unknown) => ({
              status: "rejected" as const,
              code: error instanceof core.ImposiaError ? error.code : "unknown",
            }),
          );
        return {
          invalidMount,
          frameCountAfterInvalidMount,
          unsupportedExtension,
          frameCountAfterUnsupportedExtension,
          failed,
          sameCurrent: controller.current === committed,
          metadata: controller.current?.metadata,
          entries: controller.current?.entries,
          generation: controller.current?.generation,
          text: committed.iframe.contentDocument?.body.textContent ?? "",
          canonicalCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
            .length,
          stagingCount: host.querySelectorAll('iframe[data-imposia-frame="page-document-staging"]')
            .length,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.invalidMount).toEqual({ status: "rejected", code: "INVALID_PUBLICATION" });
    expect(observation.frameCountAfterInvalidMount).toBe(0);
    expect(observation.unsupportedExtension).toEqual({
      status: "rejected",
      code: "INVALID_PUBLICATION",
    });
    expect(observation.frameCountAfterUnsupportedExtension).toBe(0);
    expect(observation.failed).toEqual({ status: "rejected", code: "INVALID_PUBLICATION" });
    expect(observation.sameCurrent).toBe(true);
    expect(observation.metadata).toEqual({ title: "Committed" });
    expect(observation.entries).toEqual([
      { id: "one", title: "One", pageRange: { start: 1, end: 1 } },
      { id: "two", title: "Two", pageRange: { start: 1, end: 1 } },
    ]);
    expect(observation.generation).toBe(1);
    expect(observation.text).toContain("Committed one.");
    expect(observation.text).toContain("Committed two.");
    expect(observation.text).not.toContain("Rejected one.");
    expect(observation.canonicalCount).toBe(1);
    expect(observation.stagingCount).toBe(0);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("a staged generation failure rolls back to the committed Publication", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const controller = core.mountPublication(
        host,
        {
          metadata: { title: "Committed" },
          entries: [{ id: "committed", title: "Committed", html: "<p>Committed text.</p>" }],
        },
        {
          assetResolver: async () => {
            throw new Error("resolver failed");
          },
        },
      );
      try {
        const committed = await controller.ready;
        const failed = await controller
          .update({
            metadata: { title: "Failed" },
            entries: [
              {
                id: "failed",
                title: "Failed",
                html: '<p>Failed text.</p><img src="failure.png" alt="">',
              },
            ],
          })
          .then(
            () => ({ status: "fulfilled" as const, code: "" }),
            (error: unknown) => ({
              status: "rejected" as const,
              code: error instanceof core.ImposiaError ? error.code : "unknown",
            }),
          );
        return {
          failed,
          sameCurrent: controller.current === committed,
          generation: controller.current?.generation,
          metadata: controller.current?.metadata,
          text: committed.iframe.contentDocument?.body.textContent ?? "",
          canonicalCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
            .length,
          stagingCount: host.querySelectorAll('iframe[data-imposia-frame="page-document-staging"]')
            .length,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.failed).toEqual({
      status: "rejected",
      code: "RESOURCE_RESOLUTION_FAILED",
    });
    expect(observation.sameCurrent).toBe(true);
    expect(observation.generation).toBe(1);
    expect(observation.metadata).toEqual({ title: "Committed" });
    expect(observation.text).toContain("Committed text.");
    expect(observation.text).not.toContain("Failed text.");
    expect(observation.canonicalCount).toBe(1);
    expect(observation.stagingCount).toBe(0);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("atomically replaces the whole snapshot and resolves assets against each entry base URL", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      const requests: Array<{ url: string; baseUrl?: string }> = [];
      const controller = core.mountPublication(
        host,
        {
          metadata: { title: "Old snapshot" },
          entries: [
            {
              id: "front",
              title: "Front",
              baseUrl: "https://assets.example.test/front/",
              html: '<h1>Old front</h1><img src="art.png" alt="">',
            },
            {
              id: "body",
              title: "Body",
              baseUrl: "https://assets.example.test/body/",
              html: '<h1>Old body</h1><img src="art.png" alt="">',
            },
          ],
        },
        {
          assetResolver: async ({ url, baseUrl }) => {
            requests.push({ url, ...(baseUrl === undefined ? {} : { baseUrl }) });
            return { status: "blocked" };
          },
        },
      );
      try {
        const initial = await controller.ready;
        const nextSnapshot = {
          metadata: { title: "New snapshot" },
          entries: [{ id: "replacement", title: "Replacement", html: "<h1>Replacement text</h1>" }],
        };
        const updating = controller.update(nextSnapshot);
        nextSnapshot.metadata.title = "Mutated after update";
        const mutableEntry = nextSnapshot.entries[0];
        if (mutableEntry === undefined) throw new Error("Missing mutable entry.");
        mutableEntry.title = "Mutated entry";
        mutableEntry.html = "<h1>Mutated text</h1>";
        const updated = await updating;
        return {
          requests,
          sameIframe: initial.iframe === updated.iframe,
          generation: updated.generation,
          metadata: updated.metadata,
          entries: updated.entries,
          sameCurrent: controller.current === updated,
          text: updated.iframe.contentDocument?.body.textContent ?? "",
          canonicalCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
            .length,
          stagingCount: host.querySelectorAll('iframe[data-imposia-frame="page-document-staging"]')
            .length,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.requests).toEqual([
      { url: "https://assets.example.test/front/art.png" },
      { url: "https://assets.example.test/body/art.png" },
    ]);
    expect(observation.sameIframe).toBe(true);
    expect(observation.generation).toBe(2);
    expect(observation.metadata).toEqual({ title: "New snapshot" });
    expect(observation.entries).toEqual([
      { id: "replacement", title: "Replacement", pageRange: { start: 1, end: 1 } },
    ]);
    expect(observation.sameCurrent).toBe(true);
    expect(observation.text).toContain("Replacement text");
    expect(observation.text).not.toContain("Old front");
    expect(observation.text).not.toContain("Mutated text");
    expect(observation.canonicalCount).toBe(1);
    expect(observation.stagingCount).toBe(0);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("caller abort preserves the committed Publication and removes staged resources", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      let assetStarted: (() => void) | undefined;
      let blobCreated: (() => void) | undefined;
      const waitingForAsset = new Promise<void>((resolve) => {
        assetStarted = resolve;
      });
      const waitingForBlob = new Promise<void>((resolve) => {
        blobCreated = resolve;
      });
      const originalCreateObjectUrl = URL.createObjectURL;
      const originalRevokeObjectUrl = URL.revokeObjectURL;
      const createdBlobUrls: string[] = [];
      const revokedBlobUrls: string[] = [];
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: (blob: Blob) => {
          const url = originalCreateObjectUrl(blob);
          createdBlobUrls.push(url);
          blobCreated?.();
          return url;
        },
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: (url: string) => {
          revokedBlobUrls.push(url);
          originalRevokeObjectUrl(url);
        },
      });
      const image = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      const controller = core.mountPublication(
        host,
        {
          metadata: { title: "Preserved" },
          entries: [
            { id: "one", title: "One", html: "<p>Preserved one.</p>" },
            { id: "two", title: "Two", html: "<p>Preserved two.</p>" },
          ],
        },
        {
          assetResolver: async ({ url, signal }) => {
            if (url.endsWith("resolved.png")) {
              return { status: "resolved", bytes: image, mimeType: "image/png" };
            }
            assetStarted?.();
            await new Promise<never>((_resolve, reject) => {
              const abort = () => reject(new DOMException("aborted", "AbortError"));
              if (signal.aborted) abort();
              else signal.addEventListener("abort", abort, { once: true });
            });
            return { status: "blocked" };
          },
        },
      );
      try {
        const committed = await controller.ready;
        const caller = new AbortController();
        const update = controller.update(
          {
            metadata: { title: "Aborted" },
            entries: [
              {
                id: "aborted",
                title: "Aborted",
                html: '<p>Aborted text.</p><img src="resolved.png" alt=""><img src="abort.png" alt="">',
              },
            ],
          },
          { signal: caller.signal },
        );
        await Promise.all([waitingForAsset, waitingForBlob]);
        const stagingBeforeAbort = host.querySelectorAll(
          'iframe[data-imposia-frame="page-document-staging"]',
        ).length;
        caller.abort();
        const result = await update.then(
          () => ({ status: "fulfilled" as const, name: "" }),
          (error: unknown) => ({
            status: "rejected" as const,
            name: error instanceof DOMException ? error.name : "unknown",
          }),
        );
        return {
          result,
          stagingBeforeAbort,
          stagingAfterAbort: host.querySelectorAll(
            'iframe[data-imposia-frame="page-document-staging"]',
          ).length,
          sameCurrent: controller.current === committed,
          generation: controller.current?.generation,
          metadata: controller.current?.metadata,
          text: committed.iframe.contentDocument?.body.textContent ?? "",
          canonicalCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
            .length,
          createdBlobUrls,
          revokedBlobUrls,
        };
      } finally {
        await controller.destroy();
        Object.defineProperty(URL, "createObjectURL", {
          configurable: true,
          value: originalCreateObjectUrl,
        });
        Object.defineProperty(URL, "revokeObjectURL", {
          configurable: true,
          value: originalRevokeObjectUrl,
        });
        host.remove();
      }
    });

    expect(observation.result).toEqual({ status: "rejected", name: "AbortError" });
    expect(observation.stagingBeforeAbort).toBe(1);
    expect(observation.stagingAfterAbort).toBe(0);
    expect(observation.sameCurrent).toBe(true);
    expect(observation.generation).toBe(1);
    expect(observation.metadata).toEqual({ title: "Preserved" });
    expect(observation.text).toContain("Preserved one.");
    expect(observation.text).not.toContain("Aborted text.");
    expect(observation.canonicalCount).toBe(1);
    expect(observation.createdBlobUrls.length).toBeGreaterThan(0);
    expect(observation.revokedBlobUrls).toEqual(observation.createdBlobUrls);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("a newer Publication update supersedes stale work without leaking its DOM", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      let staleStarted: (() => void) | undefined;
      const waitingForStale = new Promise<void>((resolve) => {
        staleStarted = resolve;
      });
      const controller = core.mountPublication(
        host,
        {
          metadata: { title: "Initial" },
          entries: [{ id: "initial", title: "Initial", html: "<p>Initial text.</p>" }],
        },
        {
          assetResolver: async ({ url, signal }) => {
            if (url.endsWith("stale.png")) {
              staleStarted?.();
              await new Promise<void>((_resolve, reject) => {
                const abort = () => reject(new DOMException("aborted", "AbortError"));
                if (signal.aborted) abort();
                else signal.addEventListener("abort", abort, { once: true });
              });
            }
            return { status: "blocked" };
          },
        },
      );
      try {
        const initial = await controller.ready;
        const staleUpdate = controller.update({
          metadata: { title: "Stale" },
          entries: [
            {
              id: "stale",
              title: "Stale",
              html: '<p>Stale text.</p><img src="stale.png" alt="">',
            },
          ],
        });
        const staleResult = staleUpdate.then(
          () => ({ status: "fulfilled" as const, name: "" }),
          (error: unknown) => ({
            status: "rejected" as const,
            name: error instanceof DOMException ? error.name : "unknown",
          }),
        );
        await waitingForStale;
        const winner = await controller.update({
          metadata: { title: "Winner" },
          entries: [{ id: "winner", title: "Winner", html: "<p>Winning text.</p>" }],
        });
        const stale = await staleResult;
        return {
          stale,
          sameIframe: initial.iframe === winner.iframe,
          sameCurrent: controller.current === winner,
          generation: winner.generation,
          metadata: winner.metadata,
          entries: winner.entries,
          text: winner.iframe.contentDocument?.body.textContent ?? "",
          canonicalCount: host.querySelectorAll('iframe[data-imposia-frame="page-document"]')
            .length,
          stagingCount: host.querySelectorAll('iframe[data-imposia-frame="page-document-staging"]')
            .length,
        };
      } finally {
        await controller.destroy();
        host.remove();
      }
    });

    expect(observation.stale).toEqual({ status: "rejected", name: "AbortError" });
    expect(observation.sameIframe).toBe(true);
    expect(observation.sameCurrent).toBe(true);
    expect(observation.generation).toBe(2);
    expect(observation.metadata).toEqual({ title: "Winner" });
    expect(observation.entries).toEqual([
      { id: "winner", title: "Winner", pageRange: { start: 1, end: 1 } },
    ]);
    expect(observation.text).toContain("Winning text.");
    expect(observation.text).not.toContain("Stale text.");
    expect(observation.canonicalCount).toBe(1);
    expect(observation.stagingCount).toBe(0);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("destroy aborts active Publication work and removes canonical and staging frames", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const core = await import("/packages/core/dist/index.js");
      const host = document.body.appendChild(document.createElement("div"));
      let assetStarted: (() => void) | undefined;
      const waitingForAsset = new Promise<void>((resolve) => {
        assetStarted = resolve;
      });
      const controller = core.mountPublication(
        host,
        {
          metadata: { title: "Initial" },
          entries: [{ id: "initial", title: "Initial", html: "<p>Initial text.</p>" }],
        },
        {
          assetResolver: async ({ signal }) => {
            assetStarted?.();
            await new Promise<void>((_resolve, reject) => {
              const abort = () => reject(new DOMException("aborted", "AbortError"));
              if (signal.aborted) abort();
              else signal.addEventListener("abort", abort, { once: true });
            });
            return { status: "blocked" };
          },
        },
      );
      await controller.ready;
      const active = controller.update({
        metadata: { title: "Destroying" },
        entries: [
          {
            id: "destroying",
            title: "Destroying",
            html: '<p>Destroying text.</p><img src="destroy.png" alt="">',
          },
        ],
      });
      const activeResult = active.then(
        () => ({ status: "fulfilled" as const, name: "" }),
        (error: unknown) => ({
          status: "rejected" as const,
          name: error instanceof DOMException ? error.name : "unknown",
        }),
      );
      await waitingForAsset;
      const framesBeforeDestroy = {
        canonical: host.querySelectorAll('iframe[data-imposia-frame="page-document"]').length,
        staging: host.querySelectorAll('iframe[data-imposia-frame="page-document-staging"]').length,
      };
      await controller.destroy();
      const result = await activeResult;
      const updateAfterDestroy = await controller
        .update({
          metadata: { title: "Too late" },
          entries: [{ id: "late", title: "Late", html: "<p>Late text.</p>" }],
        })
        .then(
          () => ({ status: "fulfilled" as const, message: "" }),
          (error: unknown) => ({
            status: "rejected" as const,
            message: error instanceof Error ? error.message : "unknown",
          }),
        );
      const framesAfterDestroy = host.querySelectorAll("iframe").length;
      const currentAfterDestroy = controller.current;
      host.remove();
      return {
        result,
        updateAfterDestroy,
        framesBeforeDestroy,
        framesAfterDestroy,
        currentAfterDestroy,
      };
    });

    expect(observation.result).toEqual({ status: "rejected", name: "AbortError" });
    expect(observation.updateAfterDestroy).toEqual({
      status: "rejected",
      message: "Page document controller has been destroyed.",
    });
    expect(observation.framesBeforeDestroy).toEqual({ canonical: 1, staging: 1 });
    expect(observation.framesAfterDestroy).toBe(0);
    expect(observation.currentAfterDestroy).toBeUndefined();
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
