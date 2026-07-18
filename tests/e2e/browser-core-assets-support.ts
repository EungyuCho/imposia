import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

export type AssetKind = "font" | "image" | "media" | "stylesheet";

export type AssetResolution =
  | {
      readonly status: "resolved";
      readonly bytes: Uint8Array;
      readonly mimeType: string;
      readonly resolvedUrl?: string;
    }
  | { readonly status: "blocked"; readonly reason?: string };

export type AssetResolver = (request: {
  readonly url: string;
  readonly kind: AssetKind;
  readonly baseUrl?: string;
  readonly signal: AbortSignal;
}) => Promise<AssetResolution>;

export type Warning = {
  readonly code: string;
  readonly message: string;
  readonly sourceIdentity: string | undefined;
};

export type PageSnapshot = {
  readonly iframe: HTMLIFrameElement;
  readonly warnings: readonly Warning[];
};

export type Controller = {
  readonly ready: Promise<PageSnapshot>;
  destroy(): Promise<void>;
};

export type CoreModule = {
  mountPageDocument(
    container: HTMLElement,
    source: { readonly html: string; readonly baseUrl?: string },
    options: { readonly assetResolver: AssetResolver },
  ): Controller;
};

export type RequestRecord = {
  readonly url: string;
  readonly kind: AssetKind;
  readonly baseUrl: string | undefined;
  readonly hasSignal: boolean;
};

export async function openAssetPage(page: Page, browserName: string) {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  const authoredHostRequests: string[] = [];
  await page.route("https://assets.example.test/**", async (route) => {
    authoredHostRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto("/examples/book.html");
  return { errors, pageErrors, authoredHostRequests };
}

export function assertNoBrowserErrors(
  errors: readonly { readonly text: string; readonly url: string }[],
  pageErrors: readonly string[],
): void {
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
}
