import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImposiaError } from "@imposia/core";
import type { JSHandle, Page } from "playwright";
import { assertFileWithinRoot } from "./input-boundary.js";
import type { CoreRenderOptions, RenderOptions } from "./types.js";

interface CoreDocumentSnapshot {
  pageCount: number;
  resourceMs: number;
  token: string;
  warnings: readonly { code: string; message: string }[];
  controller: JSHandle<CoreController>;
}

interface CoreController {
  current:
    | {
        iframe: HTMLIFrameElement;
        pageCount: number;
        timings: { resourceMs: number };
        warnings: readonly { code: string; message: string }[];
      }
    | undefined;
  destroy(): Promise<void>;
}

interface CoreBuildOutcome {
  controller: CoreController;
  failure?: { code?: string; message: string };
}

interface CoreAssetRequest {
  url: string;
  kind: "font" | "image" | "media" | "stylesheet";
  baseUrl?: string;
}

type CoreAssetResponse =
  | { status: "blocked" }
  | { status: "resolved"; bytes: number[]; mimeType: string; resolvedUrl?: string };

let coreModuleUrlPromise: Promise<string> | undefined;
const assetResolvers = new WeakMap<
  Page,
  Map<string, (request: CoreAssetRequest) => Promise<CoreAssetResponse>>
>();

function mimeType(file: string): string | undefined {
  const extension = path.extname(file).toLowerCase();
  return new Map<string, string>([
    [".css", "text/css"],
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".gif", "image/gif"],
    [".webp", "image/webp"],
    [".avif", "image/avif"],
    [".woff", "font/woff"],
    [".woff2", "font/woff2"],
    [".ttf", "font/ttf"],
    [".otf", "font/otf"],
    [".mp3", "audio/mpeg"],
    [".mp4", "video/mp4"],
    [".ogg", "audio/ogg"],
    [".wav", "audio/wav"],
    [".webm", "video/webm"],
  ]).get(extension);
}

async function resolveAsset(
  request: CoreAssetRequest,
  options: RenderOptions,
): Promise<CoreAssetResponse> {
  let resolvedUrl: URL;
  try {
    resolvedUrl = new URL(request.url, request.baseUrl);
  } catch {
    return { status: "blocked" };
  }
  try {
    if (resolvedUrl.protocol === "file:") {
      const requestedFile = fileURLToPath(resolvedUrl);
      const file =
        options.allowFileRoot === undefined
          ? requestedFile
          : await assertFileWithinRoot(requestedFile, options.allowFileRoot);
      const type = mimeType(file);
      if (type === undefined) return { status: "blocked" };
      return {
        status: "resolved",
        bytes: [...(await readFile(file))],
        mimeType: type,
        resolvedUrl: resolvedUrl.href,
      };
    }
    if (/^https?:$/.test(resolvedUrl.protocol) && !options.allowRemoteResources) {
      return { status: "blocked" };
    }
    if (!/^(?:data:|https?:)$/.test(resolvedUrl.protocol)) return { status: "blocked" };
    const response = await fetch(resolvedUrl);
    if (!response.ok) return { status: "blocked" };
    const type =
      response.headers.get("content-type")?.split(";", 1)[0] ?? mimeType(resolvedUrl.pathname);
    if (type === undefined) return { status: "blocked" };
    return {
      status: "resolved",
      bytes: [...new Uint8Array(await response.arrayBuffer())],
      mimeType: type,
      resolvedUrl: response.url,
    };
  } catch {
    return { status: "blocked" };
  }
}

async function installAssetBridge(
  page: Page,
): Promise<Map<string, (request: CoreAssetRequest) => Promise<CoreAssetResponse>>> {
  const existing = assetResolvers.get(page);
  if (existing !== undefined) return existing;
  const resolvers = new Map<string, (request: CoreAssetRequest) => Promise<CoreAssetResponse>>();
  await page.exposeBinding("__imposiaResolveCoreAsset", async (_source, value: unknown) => {
    if (typeof value !== "object" || value === null || !("token" in value))
      return { status: "blocked" };
    const { token, ...request } = value as { token: unknown } & CoreAssetRequest;
    if (typeof token !== "string") return { status: "blocked" };
    return (await resolvers.get(token)?.(request)) ?? { status: "blocked" };
  });
  assetResolvers.set(page, resolvers);
  return resolvers;
}

async function coreModuleUrl(): Promise<string> {
  coreModuleUrlPromise ??= readFile(
    fileURLToPath(import.meta.resolve("@imposia/core")),
    "utf8",
  ).then((source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return coreModuleUrlPromise;
}

export async function buildCoreDocument(
  page: Page,
  source: { html: string; baseUrl?: string },
  options: {
    headerTemplate?: string;
    footerTemplate?: string;
    core?: CoreRenderOptions;
    timeoutMs?: number;
    maxInputBytes?: number;
  },
  renderOptions: RenderOptions,
): Promise<CoreDocumentSnapshot> {
  await page.setContent("<!doctype html><html><body></body></html>");
  const moduleUrl = await coreModuleUrl();
  const resolvers = await installAssetBridge(page);
  const token = crypto.randomUUID();
  resolvers.set(token, (request) => resolveAsset(request, renderOptions));
  const outcome: JSHandle<CoreBuildOutcome> = await page.evaluateHandle(
    async ({ moduleUrl: url, source: pageSource, options: pageOptions, token: resolverToken }) => {
      type BrowserAssetResponse =
        | { status: "blocked" }
        | { status: "resolved"; bytes: number[]; mimeType: string; resolvedUrl?: string };
      const loadModule = new Function("moduleUrl", "return import(moduleUrl)") as (
        moduleUrl: string,
      ) => Promise<unknown>;
      const core = (await loadModule(url)) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string; baseUrl?: string },
          options: {
            headerTemplate?: string;
            footerTemplate?: string;
            css?: readonly string[];
            page?: { size?: "A4"; margin?: "20mm" };
            limits?: {
              maxInputBytes?: number;
              resourceDeadlineMs?: number;
            };
            assetResolver: (
              request: CoreAssetRequest,
            ) => Promise<
              | { status: "blocked" }
              | { status: "resolved"; bytes: Uint8Array; mimeType: string; resolvedUrl?: string }
            >;
          },
        ): {
          ready: Promise<{
            iframe: HTMLIFrameElement;
            pageCount: number;
            timings: { resourceMs: number };
            warnings: readonly { code: string; message: string }[];
          }>;
          destroy(): Promise<void>;
          current:
            | {
                iframe: HTMLIFrameElement;
                pageCount: number;
                timings: { resourceMs: number };
                warnings: readonly { code: string; message: string }[];
              }
            | undefined;
        };
      };
      const resolver = Reflect.get(window, "__imposiaResolveCoreAsset") as (
        value: CoreAssetRequest & { token: string },
      ) => Promise<BrowserAssetResponse>;
      const host = document.body.appendChild(document.createElement("div"));
      host.style.cssText = "margin:0;padding:0";
      const controller = core.mountPageDocument(host, pageSource, {
        ...pageOptions,
        assetResolver: async (request) => {
          const response = await resolver({ ...request, token: resolverToken });
          if (response.status === "blocked") return response;
          return { ...response, bytes: new Uint8Array(response.bytes) };
        },
      });
      try {
        await controller.ready;
        return { controller };
      } catch (error: unknown) {
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : undefined;
        return {
          controller,
          failure: {
            ...(code === undefined ? {} : { code }),
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      moduleUrl,
      source,
      options: {
        ...(options.headerTemplate === undefined ? {} : { headerTemplate: options.headerTemplate }),
        ...(options.footerTemplate === undefined ? {} : { footerTemplate: options.footerTemplate }),
        ...(options.core?.css === undefined ? {} : { css: options.core.css }),
        ...(options.core?.page === undefined ? {} : { page: options.core.page }),
        limits: {
          ...(options.core?.limits ?? {}),
          ...(options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes }),
          ...(options.timeoutMs === undefined ? {} : { resourceDeadlineMs: options.timeoutMs }),
        },
      },
      token,
    },
  );
  const failure = await outcome.evaluate((result) => result.failure);
  if (failure !== undefined) {
    try {
      await outcome.evaluate(async (result) => result.controller.destroy());
    } finally {
      await outcome.dispose();
      assetResolvers.get(page)?.delete(token);
    }
    throw new ImposiaError(failure.code ?? "CORE_RENDER_FAILED", failure.message);
  }
  const controller = (await outcome.getProperty("controller")) as JSHandle<CoreController>;
  await outcome.dispose();
  const snapshot = await controller.evaluate((coreController) => {
    const ready = coreController.current;
    const frameDocument = ready?.iframe.contentDocument;
    if (ready === undefined || frameDocument == null) {
      throw new Error("The canonical page document is unavailable.");
    }
    document.replaceChild(
      document.importNode(frameDocument.documentElement, true),
      document.documentElement,
    );
    return {
      pageCount: ready.pageCount,
      resourceMs: ready.timings.resourceMs,
      warnings: ready.warnings,
    };
  });
  return { ...snapshot, token, controller };
}

export async function discardCoreDocument(
  page: Page,
  document: CoreDocumentSnapshot,
): Promise<void> {
  await document.controller.evaluate(async (controller) => controller.destroy());
  await document.controller.dispose();
  assetResolvers.get(page)?.delete(document.token);
}
