import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const workspace = path.resolve(import.meta.dirname, "../..");
let consumer = "";

async function run(
  command: string,
  args: readonly string[],
  cwd = workspace,
): Promise<Readonly<{ stdout: string; stderr: string }>> {
  try {
    return await execFileAsync(command, args, { cwd, env: process.env });
  } catch (error: unknown) {
    const stdout =
      typeof error === "object" && error !== null ? String(Reflect.get(error, "stdout") ?? "") : "";
    const stderr =
      typeof error === "object" && error !== null ? String(Reflect.get(error, "stderr") ?? "") : "";
    throw new Error(
      [error instanceof Error ? error.message : String(error), stdout, stderr].join("\n"),
    );
  }
}

async function pack(packageName: "core" | "viewer" | "client" | "react"): Promise<string> {
  const before = new Set(await readdir(consumer));
  await run("pnpm", [
    "--dir",
    path.join(workspace, "packages", packageName),
    "pack",
    "--pack-destination",
    consumer,
  ]);
  const tarball = (await readdir(consumer)).find(
    (entry) => entry.endsWith(".tgz") && !before.has(entry),
  );
  if (tarball === undefined) throw new Error(`Packed ${packageName} tarball is missing.`);
  return path.join(consumer, tarball);
}

async function extract(tarball: string, packageName: string): Promise<void> {
  const target = path.join(consumer, "node_modules", "@imposia", packageName);
  await mkdir(target, { recursive: true });
  await run("tar", ["-xzf", tarball, "-C", target, "--strip-components=1"]);
}

beforeAll(async () => {
  await run(path.join(workspace, "node_modules", ".bin", "tsc"), [
    "-b",
    "--pretty",
    "false",
    "packages/core",
    "packages/viewer",
    "packages/client",
    "packages/react",
  ]);
  consumer = await mkdtemp(path.join(os.tmpdir(), "imposia-packed-publication-"));
  await mkdir(path.join(consumer, "node_modules", "@imposia"), { recursive: true });
  for (const packageName of ["core", "viewer", "client", "react"] as const) {
    await extract(await pack(packageName), packageName);
  }
  const dependencies = new Map([
    ["parse5", path.join(workspace, "packages", "core", "node_modules", "parse5")],
    ["postcss", path.join(workspace, "packages", "core", "node_modules", "postcss")],
    ["pdfjs-dist", path.join(workspace, "packages", "viewer", "node_modules", "pdfjs-dist")],
    ["react", path.join(workspace, "packages", "react", "node_modules", "react")],
    ["react-dom", path.join(workspace, "packages", "react", "node_modules", "react-dom")],
  ]);
  for (const [dependency, source] of dependencies) {
    await symlink(source, path.join(consumer, "node_modules", dependency), "junction");
  }
  await symlink(
    path.join(workspace, "node_modules", "@types"),
    path.join(consumer, "node_modules", "@types"),
    "junction",
  );
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({ name: "packed-publication-consumer", private: true, type: "module" }),
    "utf8",
  );
}, 30_000);

afterAll(async () => {
  if (consumer !== "") await rm(consumer, { recursive: true, force: true });
});

describe("packed Publication adapters", () => {
  test("browser-targeted ESM executes Client and React Publication exports", async () => {
    const script = path.join(consumer, "consumer.mjs");
    const bundle = path.join(consumer, "consumer-esm.js");
    await writeFile(
      script,
      [
        'import { mountPageDocument, mountPublication as coreMount } from "@imposia/core";',
        'import { mountPageViewer, mountPublication as clientMount, serializePublicationDeepLink as clientSerialize } from "@imposia/client";',
        'import { restorePublicationDeepLink, serializePublicationDeepLink as viewerSerialize } from "@imposia/viewer";',
        'import { ImposiaPublicationViewer, useImposiaPublication } from "@imposia/react";',
        'if (clientMount !== coreMount) throw new Error("Client wrapped mountPublication.");',
        'if (clientSerialize !== viewerSerialize) throw new Error("Client wrapped Reader deep links.");',
        'if (typeof ImposiaPublicationViewer !== "object" && typeof ImposiaPublicationViewer !== "function") throw new Error("Missing Publication component.");',
        'if (typeof useImposiaPublication !== "function") throw new Error("Missing Publication hook.");',
        'const destination = { id: "packed destination", entryId: "entry", page: 1, generation: 1 };',
        "const deepLink = clientSerialize(destination);",
        "const restored = restorePublicationDeepLink(deepLink, { resolveDestination: (id) => id === destination.id ? destination : undefined });",
        'const host = document.body.appendChild(document.createElement("div"));',
        'const pageController = mountPageDocument(host, { html: "<h1>Packed Inspector</h1>" }, { extensions: [{ name: "packed/inspector", decoratePage(_page, context) { context.warn({ code: "EXTENSION_PACKED_SMOKE", message: "Packed Inspector smoke warning." }); } }] });',
        "const pageDocument = await pageController.ready;",
        'const packedViewer = mountPageViewer(host, pageDocument, { inspector: true, mode: "single" });',
        "packedViewer.inspector?.open();",
        "const packedWarning = packedViewer.inspector?.state.warnings[0];",
        'if (packedWarning === undefined) throw new Error("Packed Inspector warning is missing.");',
        "packedViewer.inspector?.select(packedWarning);",
        'const inspector = { code: packedViewer.inspector?.state.selected?.code, page: packedViewer.state.page, panel: host.querySelectorAll(".imposia-inspector-panel").length, canonicalFrames: host.querySelectorAll(\'iframe[data-imposia-frame="page-document"]\').length };',
        "packedViewer.destroy();",
        "await pageController.destroy();",
        "const destroyedInspectorNodes = host.querySelectorAll('[class*=\"imposia-inspector\"]').length;",
        "host.remove();",
        "globalThis.__imposiaPackedEsm = { sameMount: true, sameReader: true, deepLink, restored: restored?.id, component: typeof ImposiaPublicationViewer, hook: typeof useImposiaPublication, inspector, destroyedInspectorNodes };",
      ].join("\n"),
      "utf8",
    );
    await run(
      "pnpm",
      [
        "exec",
        "esbuild",
        script,
        "--bundle",
        "--platform=browser",
        "--format=esm",
        "--target=es2022",
        `--outfile=${bundle}`,
      ],
      workspace,
    );
    expect(await readFile(bundle, "utf8")).toContain("__imposiaPackedEsm");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ path: bundle, type: "module" });
      await page.waitForFunction(() => Reflect.has(globalThis, "__imposiaPackedEsm"));
      expect(await page.evaluate(() => Reflect.get(globalThis, "__imposiaPackedEsm"))).toEqual({
        sameMount: true,
        sameReader: true,
        deepLink: "v1.packed%20destination",
        restored: "packed destination",
        component: "object",
        hook: "function",
        inspector: {
          code: "EXTENSION_PACKED_SMOKE",
          page: 1,
          panel: 1,
          canonicalFrames: 1,
        },
        destroyedInspectorNodes: 0,
      });
    } finally {
      await browser.close();
    }
  }, 60_000);

  test("browser-targeted CommonJS consumer executes the packed ESM exports", async () => {
    const script = path.join(consumer, "consumer.cjs");
    const bundle = path.join(consumer, "consumer-cjs.js");
    await writeFile(
      script,
      [
        "void (async () => {",
        '  const core = await import("@imposia/core");',
        '  const client = await import("@imposia/client");',
        '  const react = await import("@imposia/react");',
        '  if (client.mountPublication !== core.mountPublication) throw new Error("Client wrapped mountPublication.");',
        '  if (client.serializePublicationDeepLink !== (await import("@imposia/viewer")).serializePublicationDeepLink) throw new Error("Client wrapped Reader deep links.");',
        '  if (typeof react.useImposiaPublication !== "function") throw new Error("Missing Publication hook.");',
        '  const deepLink = client.serializePublicationDeepLink({ id: "packed destination", entryId: "entry", page: 1, generation: 1 });',
        '  const host = document.body.appendChild(document.createElement("div"));',
        '  const controller = client.mountPublication(host, { metadata: { title: "Packed CJS" }, entries: [{ id: "entry", title: "Entry", html: "<h1>Packed CJS token</h1><h2>Detail</h2>" }] });',
        "  const publication = await controller.ready;",
        '  const viewer = client.mountPageViewer(host, publication, { inspector: true, mode: "single", reader: { controller } });',
        "  viewer.reader.openTableOfContents();",
        '  const tocOpen = host.querySelector(".imposia-toc-panel")?.hidden === false;',
        "  viewer.reader.closeTableOfContents();",
        "  viewer.reader.openThumbnails();",
        "  const thumbnailCount = viewer.reader.state.thumbnails.length;",
        "  viewer.reader.closeThumbnails();",
        "  viewer.reader.openSearch();",
        '  const results = viewer.reader.search("Packed CJS token");',
        "  const firstResult = viewer.reader.nextSearchResult();",
        "  viewer.reader.closeSearch();",
        '  viewer.setMode("continuous");',
        "  viewer.inspector.open();",
        '  const inspectorFocused = document.activeElement === host.querySelector(".imposia-inspector-panel");',
        "  const runtime = { tocOpen, thumbnailCount, resultCount: results.length, firstResult: firstResult?.entry.id, mode: viewer.state.mode, inspectorOpen: viewer.inspector.state.open, inspectorFocused, canonicalFrames: host.querySelectorAll('iframe[data-imposia-frame=\"page-document\"]').length };",
        "  viewer.destroy();",
        "  await controller.destroy();",
        '  const destroyedNodes = host.querySelectorAll("iframe, .imposia-toc-panel, .imposia-search-panel, .imposia-thumbnail-panel, .imposia-inspector-panel").length;',
        "  host.remove();",
        "  globalThis.__imposiaPackedCjs = { sameMount: true, sameReader: true, deepLink, component: typeof react.ImposiaPublicationViewer, hook: typeof react.useImposiaPublication, runtime, destroyedNodes };",
        "})();",
      ].join("\n"),
      "utf8",
    );
    await run(
      "pnpm",
      [
        "exec",
        "esbuild",
        script,
        "--bundle",
        "--platform=browser",
        "--format=iife",
        "--target=es2022",
        `--outfile=${bundle}`,
      ],
      workspace,
    );
    expect(await readFile(bundle, "utf8")).toContain("__imposiaPackedCjs");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ path: bundle });
      await page.waitForFunction(() => Reflect.has(globalThis, "__imposiaPackedCjs"));
      expect(await page.evaluate(() => Reflect.get(globalThis, "__imposiaPackedCjs"))).toEqual({
        sameMount: true,
        sameReader: true,
        deepLink: "v1.packed%20destination",
        component: "object",
        hook: "function",
        runtime: {
          tocOpen: true,
          thumbnailCount: 1,
          resultCount: 1,
          firstResult: "entry",
          mode: "continuous",
          inspectorOpen: true,
          inspectorFocused: true,
          canonicalFrames: 1,
        },
        destroyedNodes: 0,
      });
    } finally {
      await browser.close();
    }
  }, 60_000);

  test("browser-targeted React consumer renders and drives packed Publication APIs", async () => {
    const script = path.join(consumer, "consumer-react.mjs");
    const bundle = path.join(consumer, "consumer-react.js");
    await writeFile(
      script,
      [
        'import { createElement, createRef } from "react";',
        'import { createRoot } from "react-dom/client";',
        'import { ImposiaPublicationViewer } from "@imposia/react";',
        'const host = document.body.appendChild(document.createElement("div"));',
        "const ref = createRef();",
        "let resolveReady;",
        "const ready = new Promise((resolve) => { resolveReady = resolve; });",
        "const root = createRoot(host);",
        'root.render(createElement(ImposiaPublicationViewer, { ref, snapshot: { metadata: { title: "Packed React" }, entries: [{ id: "opening", title: "Opening", html: "<h1>Packed React token</h1><h2>Context</h2>" }, { id: "chapter", title: "Chapter", html: "<h1 style=\\"break-before: page\\">Packed React chapter</h1>" }] }, viewerOptions: { inspector: true, mode: "single" }, style: { width: "960px", height: "720px" }, onReady: resolveReady }));',
        "const publication = await ready;",
        "const handle = ref.current;",
        'if (handle === null) throw new Error("Packed React handle is unavailable.");',
        "handle.openTableOfContents();",
        'const tocOpen = host.querySelector(".imposia-toc-panel")?.hidden === false;',
        "handle.closeTableOfContents();",
        "handle.openThumbnails();",
        "const thumbnailCount = handle.getThumbnails().length;",
        "handle.closeThumbnails();",
        "handle.openSearch();",
        'const results = handle.search("Packed React");',
        "const firstResult = handle.nextSearchResult();",
        "handle.closeSearch();",
        "const destination = handle.current?.outline[0]?.destination;",
        'if (destination === undefined) throw new Error("Packed React destination is missing.");',
        "handle.navigate(destination);",
        'handle.setMode("spread");',
        "handle.setSpreadCover(false);",
        "handle.openInspector();",
        'const inspectorFocused = document.activeElement === host.querySelector(".imposia-inspector-panel");',
        'const observation = { generation: publication.generation, samePublication: handle.current === publication, tocOpen, thumbnailCount, resultCount: results.length, firstResult: firstResult?.entry.id, inspectorFocused, canonicalFrames: host.querySelectorAll(\'iframe[data-imposia-frame="page-document"]\').length, reactStatus: host.firstElementChild?.getAttribute("data-imposia-react-status") };',
        "root.unmount();",
        "await Promise.resolve();",
        "globalThis.__imposiaPackedReact = { ...observation, remainingChildren: host.childElementCount };",
      ].join("\n"),
      "utf8",
    );
    await run(
      "pnpm",
      [
        "exec",
        "esbuild",
        script,
        "--bundle",
        "--platform=browser",
        "--format=esm",
        "--target=es2022",
        `--outfile=${bundle}`,
      ],
      workspace,
    );
    expect(await readFile(bundle, "utf8")).toContain("__imposiaPackedReact");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ path: bundle, type: "module" });
      await page.waitForFunction(() => Reflect.has(globalThis, "__imposiaPackedReact"));
      expect(await page.evaluate(() => Reflect.get(globalThis, "__imposiaPackedReact"))).toEqual({
        generation: 1,
        samePublication: true,
        tocOpen: true,
        thumbnailCount: 2,
        resultCount: 2,
        firstResult: "opening",
        inspectorFocused: true,
        canonicalFrames: 1,
        reactStatus: "ready",
        remainingChildren: 0,
      });
    } finally {
      await browser.close();
    }
  }, 60_000);

  test("TypeScript consumes Publication declarations from packed artifacts", async () => {
    const script = path.join(consumer, "consumer-types.ts");
    await writeFile(
      script,
      [
        'import { mountPublication, pageWarningTargetBounds, restorePublicationDeepLink, serializePublicationDeepLink, validatePageViewerOptions, type PageViewerMode, type PageViewerOptions, type PageWarning, type PageWarningTargetBounds, type PublicationDestination, type PublicationReaderController, type PublicationReaderOptions, type PublicationReaderState, type PublicationSearchResult, type PublicationSnapshot, type PublicationThumbnail, type ViewerInspectorController, type ViewerInspectorState } from "@imposia/client";',
        'import { ImposiaPublicationViewer, type ImposiaPublicationViewerHandle, useImposiaPublication } from "@imposia/react";',
        'import { createElement } from "react";',
        "declare const host: HTMLElement;",
        'const snapshot = { metadata: { title: "Packed" }, entries: [{ id: "entry", title: "Entry", html: "<h1>Packed</h1>" }] } satisfies PublicationSnapshot;',
        "const controller = mountPublication(host, snapshot);",
        "void controller.update(snapshot);",
        'const searchResults: readonly PublicationSearchResult[] = controller.search("Packed");',
        "const destination: PublicationDestination | undefined = controller.current?.outline[0]?.destination;",
        "if (destination !== undefined) { controller.navigate(destination); restorePublicationDeepLink(serializePublicationDeepLink(destination), controller); }",
        'const readerOptions = { controller, initialDeepLink: "v1.imposia-entry-entry" } satisfies PublicationReaderOptions;',
        'const pageViewerMode: PageViewerMode = "spread";',
        "const pageViewerOptions = { mode: pageViewerMode, spread: { cover: true }, inspector: true, reader: readerOptions } satisfies PageViewerOptions;",
        "if (controller.current !== undefined) validatePageViewerOptions(controller.current, pageViewerOptions);",
        "declare const inspector: ViewerInspectorController; const inspectorState: ViewerInspectorState = inspector.state; inspector.open(); inspector.close(); inspector.toggle(); const warnings: readonly PageWarning[] = inspectorState.warnings; if (warnings[0] !== undefined) inspector.select(warnings[0]);",
        "const targetBounds: PageWarningTargetBounds | undefined = controller.current?.warnings[0] === undefined ? undefined : pageWarningTargetBounds(controller.current, controller.current.warnings[0]); void targetBounds;",
        "declare const reader: PublicationReaderController;",
        "const readerState: PublicationReaderState = reader.state;",
        "declare const handle: ImposiaPublicationViewerHandle;",
        "handle.openTableOfContents(); handle.closeTableOfContents(); handle.toggleTableOfContents(); handle.restoreDeepLink(readerOptions.initialDeepLink);",
        "handle.openThumbnails(); handle.closeThumbnails(); handle.toggleThumbnails(); const thumbnails: readonly PublicationThumbnail[] = handle.getThumbnails(); if (thumbnails[0] !== undefined) handle.selectThumbnail(thumbnails[0]);",
        'handle.openSearch(); handle.closeSearch(); handle.toggleSearch(); const handleResults = handle.search("Packed"); handle.nextSearchResult(); handle.previousSearchResult(); if (handleResults[0] !== undefined) handle.selectSearchResult(handleResults[0]);',
        'reader.openSearch(); reader.closeSearch(); reader.toggleSearch(); const readerResults = reader.search("Packed"); reader.nextSearchResult(); reader.previousSearchResult(); if (readerResults[0] !== undefined) reader.selectSearchResult(readerResults[0]);',
        "reader.openThumbnails(); reader.closeThumbnails(); reader.toggleThumbnails(); const readerThumbnails: readonly PublicationThumbnail[] = reader.state.thumbnails; if (readerThumbnails[0] !== undefined) reader.selectThumbnail(readerThumbnails[0]);",
        'handle.setMode("spread"); handle.setSpreadCover(true);',
        "handle.openInspector(); handle.closeInspector(); handle.toggleInspector(); const currentWarning = handle.current?.warnings[0]; if (currentWarning !== undefined) handle.selectWarning(currentWarning);",
        "void pageViewerOptions; void readerState; void searchResults;",
        "void controller.destroy();",
        "void createElement(ImposiaPublicationViewer, { snapshot, viewerOptions: { inspector: true }, readerOptions: { initialDeepLink: readerOptions.initialDeepLink } });",
        "const hook: typeof useImposiaPublication = useImposiaPublication;",
        "void hook;",
      ].join("\n"),
      "utf8",
    );
    await run(
      "pnpm",
      [
        "exec",
        "tsc",
        "--noEmit",
        "--pretty",
        "false",
        "--strict",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--lib",
        "ES2022,DOM",
        script,
      ],
      workspace,
    );
  });
});
