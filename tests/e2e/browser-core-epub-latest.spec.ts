import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

type Metadata = Readonly<{
  title: string;
  language: string;
  identifier: string;
  modified: string;
}>;

type ExportOptions = Readonly<{ metadata: Metadata; signal?: AbortSignal }>;

type PageDocument = Readonly<{
  generation: number;
  exportEpub(options: ExportOptions): Promise<Blob>;
}>;

type Source = Readonly<{ html: string }>;

type Controller = Readonly<{
  ready: Promise<PageDocument>;
  current: PageDocument | undefined;
  update(source: Source): Promise<PageDocument>;
  destroy(): Promise<void>;
}>;

type LatestExportProbe = Readonly<{
  pendingBeforeRelease: boolean;
  exportGeneration: number;
  currentGeneration: number;
  content: string;
}>;

type SupersedingProbe = Readonly<{
  pendingBeforeWinnerRelease: boolean;
  supersededError: string;
  content: string;
}>;

type DestroyExportProbe = Readonly<{
  assetExportStarted: boolean;
  exportStatus: "fulfilled" | "rejected";
  exportErrorName: string;
  destroyResolvedBeforeExport: boolean;
  destroyResolved: boolean;
}>;

async function writeProbeArtifact(fileName: string, value: unknown): Promise<void> {
  const artifactPath = path.resolve(".omo/evidence/browser-publishing-coverage", fileName);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(value, null, 2) ?? ""}\n`, "utf8");
}

async function latestExportProbeInPage(): Promise<LatestExportProbe> {
  const metadata: Metadata = {
    title: "Latest EPUB generation",
    language: "en",
    identifier: "urn:imposia:test:latest-epub",
    modified: "2026-07-19T00:00:00Z",
  };
  const core = (await import("/packages/core/dist/index.js")) as {
    mountPageDocument(
      container: HTMLElement,
      source: Source,
      options: Readonly<{
        assetResolver: (request: {
          url: string;
          kind: "font" | "image" | "media" | "stylesheet";
          signal: AbortSignal;
        }) => Promise<{
          status: "resolved";
          bytes: Uint8Array;
          mimeType: string;
        }>;
      }>,
    ): Controller;
  };
  const host = document.body.appendChild(document.createElement("div"));
  const pngBytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (character) => character.charCodeAt(0),
  );
  let releaseResolver: (() => void) | undefined;
  let resolverStarted: (() => void) | undefined;
  const resolverReady = new Promise<void>((resolve) => {
    resolverStarted = resolve;
  });
  const resolver = async ({
    url,
    signal,
  }: {
    url: string;
    kind: "font" | "image" | "media" | "stylesheet";
    signal: AbortSignal;
  }): Promise<{ status: "resolved"; bytes: Uint8Array; mimeType: string }> => {
    if (url === "new.png") {
      resolverStarted?.();
      await new Promise<void>((resolve, reject) => {
        releaseResolver = resolve;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        });
      });
    }
    return { status: "resolved", bytes: pngBytes, mimeType: "image/png" };
  };
  let controller: Controller | undefined;
  try {
    controller = core.mountPageDocument(
      host,
      { html: "<p>OLD EPUB content</p>" },
      { assetResolver: resolver },
    );
    const oldDocument = await controller.ready;
    const update = controller.update({ html: '<p>NEW EPUB content</p><img src="new.png">' });
    await resolverReady;
    let exportSettled = false;
    const exportPromise = oldDocument.exportEpub({ metadata }).then(async (blob) => {
      exportSettled = true;
      return new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const pendingBeforeRelease = !exportSettled;
    releaseResolver?.();
    const latestDocument = await update;
    const content = await exportPromise;
    return {
      pendingBeforeRelease,
      exportGeneration: oldDocument.generation,
      currentGeneration: latestDocument.generation,
      content,
    };
  } finally {
    await controller?.destroy();
    host.remove();
  }
}

async function supersedingExportProbeInPage(): Promise<SupersedingProbe> {
  const metadata: Metadata = {
    title: "Superseding EPUB generation",
    language: "en",
    identifier: "urn:imposia:test:superseding-epub",
    modified: "2026-07-19T00:00:00Z",
  };
  const core = (await import("/packages/core/dist/index.js")) as {
    mountPageDocument(
      container: HTMLElement,
      source: Source,
      options: Readonly<{
        assetResolver: (request: {
          url: string;
          kind: "font" | "image" | "media" | "stylesheet";
          signal: AbortSignal;
        }) => Promise<{
          status: "resolved";
          bytes: Uint8Array;
          mimeType: string;
        }>;
      }>,
    ): Controller;
  };
  const host = document.body.appendChild(document.createElement("div"));
  const pngBytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (character) => character.charCodeAt(0),
  );
  const releases = new Map<string, () => void>();
  let staleResolverStarted: (() => void) | undefined;
  let winnerResolverStarted: (() => void) | undefined;
  const staleResolverReady = new Promise<void>((resolve) => {
    staleResolverStarted = resolve;
  });
  const winnerResolverReady = new Promise<void>((resolve) => {
    winnerResolverStarted = resolve;
  });
  const resolver = async ({
    url,
    signal,
  }: {
    url: string;
    kind: "font" | "image" | "media" | "stylesheet";
    signal: AbortSignal;
  }): Promise<{ status: "resolved"; bytes: Uint8Array; mimeType: string }> => {
    if (url === "stale.png") {
      staleResolverStarted?.();
      await new Promise<void>((resolve, reject) => {
        releases.set(url, resolve);
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        });
      });
    } else if (url === "winner.png") {
      winnerResolverStarted?.();
      await new Promise<void>((resolve, reject) => {
        releases.set(url, resolve);
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        });
      });
    }
    return { status: "resolved", bytes: pngBytes, mimeType: "image/png" };
  };
  let controller: Controller | undefined;
  try {
    controller = core.mountPageDocument(
      host,
      { html: "<p>OLD EPUB content</p>" },
      { assetResolver: resolver },
    );
    const oldDocument = await controller.ready;
    const staleUpdate = controller.update({
      html: '<p>STALE EPUB content</p><img src="stale.png">',
    });
    await staleResolverReady;
    const supersededErrorPromise = staleUpdate.then(
      () => "fulfilled",
      (error: unknown) => (error instanceof DOMException ? error.name : String(error)),
    );
    let exportSettled = false;
    const exportPromise = oldDocument.exportEpub({ metadata }).then(async (blob) => {
      exportSettled = true;
      return new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    });
    const winnerUpdate = controller.update({
      html: '<p>WINNER EPUB content</p><img src="winner.png">',
    });
    await winnerResolverReady;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const pendingBeforeWinnerRelease = !exportSettled;
    releases.get("winner.png")?.();
    const supersededError = await supersededErrorPromise;
    await winnerUpdate;
    const content = await exportPromise;
    return { pendingBeforeWinnerRelease, supersededError, content };
  } finally {
    await controller?.destroy();
    host.remove();
  }
}

async function destroyInFlightExportProbeInPage(): Promise<DestroyExportProbe> {
  const metadata: Metadata = {
    title: "Destroyed EPUB generation",
    language: "en",
    identifier: "urn:imposia:test:destroyed-epub",
    modified: "2026-07-19T00:00:00Z",
  };
  const core = (await import("/packages/core/dist/index.js")) as {
    mountPageDocument(
      container: HTMLElement,
      source: Source,
      options: Readonly<{
        assetResolver: (request: {
          url: string;
          kind: "font" | "image" | "media" | "stylesheet";
          signal: AbortSignal;
        }) => Promise<{
          status: "resolved";
          bytes: Uint8Array;
          mimeType: string;
        }>;
      }>,
    ): Controller;
  };
  const host = document.body.appendChild(document.createElement("div"));
  const pngBytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (character) => character.charCodeAt(0),
  );
  let controller: Controller | undefined;
  let releaseArrayBuffer: (() => void) | undefined;
  let resolveAssetExportStarted: (() => void) | undefined;
  const assetExportStarted = new Promise<void>((resolve) => {
    resolveAssetExportStarted = resolve;
  });
  const originalArrayBufferDescriptor = Object.getOwnPropertyDescriptor(
    Blob.prototype,
    "arrayBuffer",
  );
  if (originalArrayBufferDescriptor === undefined) {
    throw new Error("Blob.prototype.arrayBuffer is unavailable.");
  }
  const originalArrayBuffer = Blob.prototype.arrayBuffer;
  let gated = false;
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    value: function delayedArrayBuffer(this: Blob): Promise<ArrayBuffer> {
      if (!gated && this.type === "image/png") {
        gated = true;
        resolveAssetExportStarted?.();
        return new Promise<ArrayBuffer>((resolve) => {
          releaseArrayBuffer = () => {
            void originalArrayBuffer.call(this).then(resolve);
          };
        });
      }
      return originalArrayBuffer.call(this);
    },
  });
  try {
    controller = core.mountPageDocument(
      host,
      { html: '<p>DESTROY EPUB content</p><img src="cover.png">' },
      {
        assetResolver: async () => ({
          status: "resolved",
          bytes: pngBytes,
          mimeType: "image/png",
        }),
      },
    );
    const pageDocument = await controller.ready;
    let exportSettled = false;
    let exportErrorName = "";
    const exportPromise = pageDocument.exportEpub({ metadata }).then(
      () => {
        exportSettled = true;
        return "fulfilled" as const;
      },
      (error: unknown) => {
        exportSettled = true;
        exportErrorName = error instanceof Error ? error.name : String(error);
        return "rejected" as const;
      },
    );
    await assetExportStarted;
    let destroyResolved = false;
    let destroyResolvedBeforeExport = false;
    const destroyPromise = controller.destroy().then(() => {
      destroyResolved = true;
      destroyResolvedBeforeExport = !exportSettled;
    });
    await Promise.resolve();
    releaseArrayBuffer?.();
    const exportStatus = await exportPromise;
    await destroyPromise;
    return {
      assetExportStarted: gated,
      exportStatus,
      exportErrorName,
      destroyResolvedBeforeExport,
      destroyResolved,
    };
  } finally {
    releaseArrayBuffer?.();
    await controller?.destroy();
    Object.defineProperty(Blob.prototype, "arrayBuffer", originalArrayBufferDescriptor);
    host.remove();
  }
}

test("EPUB export waits for the latest committed generation", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Latest-generation EPUB timing is Chromium-focused.");
  const captured = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  const result = await page.evaluate(latestExportProbeInPage);
  await writeProbeArtifact("epub-latest-green-observations.json", {
    scenario: "delayed NEW update and first-document EPUB export",
    result,
    browserErrors: captured.errors,
    pageErrors: captured.pageErrors,
  });
  expect(result.pendingBeforeRelease).toBe(true);
  expect(result.exportGeneration).toBe(1);
  expect(result.currentGeneration).toBe(2);
  expect(result.content).toContain("NEW EPUB content");
  expect(result.content).not.toContain("OLD EPUB content");
  expect(captured.errors).toEqual([]);
  expect(captured.pageErrors).toEqual([]);
});

test("EPUB export follows a superseding update to its final winner", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Latest-generation EPUB timing is Chromium-focused.");
  const captured = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  const result = await page.evaluate(supersedingExportProbeInPage);
  await writeProbeArtifact("epub-latest-superseding-green-observations.json", {
    scenario: "superseding STALE and WINNER updates during EPUB export",
    result,
    browserErrors: captured.errors,
    pageErrors: captured.pageErrors,
  });
  expect(result.pendingBeforeWinnerRelease).toBe(true);
  expect(result.supersededError).toBe("AbortError");
  expect(result.content).toContain("WINNER EPUB content");
  expect(result.content).not.toContain("STALE EPUB content");
  expect(captured.errors).toEqual([]);
  expect(captured.pageErrors).toEqual([]);
});

test("destroy aborts and waits for an in-flight EPUB export", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Destroy/export timing is Chromium-focused.");
  const captured = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");
  const result = await page.evaluate(destroyInFlightExportProbeInPage);
  await writeProbeArtifact("epub-latest-destroy-green-observations.json", {
    scenario: "destroy during delayed retained-asset EPUB export",
    result,
    browserErrors: captured.errors,
    pageErrors: captured.pageErrors,
  });
  expect(result.assetExportStarted).toBe(true);
  expect(result.exportStatus).toBe("rejected");
  expect(result.exportErrorName).toBe("AbortError");
  expect(result.destroyResolvedBeforeExport).toBe(false);
  expect(result.destroyResolved).toBe(true);
  expect(captured.errors).toEqual([]);
  expect(captured.pageErrors).toEqual([]);
});
