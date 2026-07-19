import { expect, test } from "@playwright/test";
import type {
  AssetResolver,
  Controller,
  CoreModule,
  RequestRecord,
} from "./browser-core-assets-support.js";
import { assertNoBrowserErrors, openAssetPage } from "./browser-core-assets-support.js";

test("resolves HTML and CSS assets only through the resolver", async ({ page, browserName }) => {
  const { errors, pageErrors, authoredHostRequests } = await openAssetPage(page, browserName);
  try {
    const observation = await page.evaluate(async () => {
      const baseUrl = "https://assets.example.test/book/";
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      const requests: RequestRecord[] = [];
      const resolver: AssetResolver = async ({ url, kind, baseUrl: requestBase, signal }) => {
        requests.push({
          url,
          kind,
          baseUrl: requestBase,
          hasSignal: signal instanceof AbortSignal,
        });
        if (kind === "stylesheet") {
          return {
            status: "resolved",
            bytes: new TextEncoder().encode(".linked { color: rgb(1 2 3); }"),
            mimeType: "text/css",
          };
        }
        return { status: "resolved", bytes: png, mimeType: "image/png" };
      };
      const host = document.body.appendChild(document.createElement("div"));
      let controller: Controller | undefined;
      try {
        const core = (await import("/packages/core/dist/index.js")) as CoreModule;
        controller = core.mountPageDocument(
          host,
          {
            html: `
              <img class="cover" src="cover.png" alt="cover">
              <link rel="stylesheet" href="styles/book.css">
              <style>.hero { background-image: url("images/paper.png"); }</style>
              <div class="hero">Resolved assets</div>
            `,
            baseUrl,
          },
          { assetResolver: resolver },
        );
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const frameHtml = frameDocument.documentElement.outerHTML;
        return {
          requests,
          frameHtml,
          csp: frameDocument
            .querySelector('meta[http-equiv="Content-Security-Policy"]')
            ?.getAttribute("content"),
          sandbox: ready.iframe.getAttribute("sandbox"),
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.sandbox).toBe("allow-same-origin allow-modals");
    expect(observation.csp).toContain("img-src blob:");
    expect(observation.csp).toContain("font-src blob:");
    expect(observation.csp).toContain("media-src blob:");
    expect(observation.csp).not.toMatch(/(?:img|font|media)-src[^;]*data:/);
    expect(observation.requests).toHaveLength(3);
    for (const expected of [
      { url: "cover.png", kind: "image", baseUrl: "https://assets.example.test/book/" },
      { url: "styles/book.css", kind: "stylesheet", baseUrl: "https://assets.example.test/book/" },
      { url: "images/paper.png", kind: "image", baseUrl: "https://assets.example.test/book/" },
    ]) {
      expect(observation.requests).toContainEqual({ ...expected, hasSignal: true });
    }
    expect(observation.frameHtml).toContain("blob:");
    expect(observation.frameHtml).not.toMatch(/(?:src|href)="(?!blob:)[^"]+"/);
    expect(observation.frameHtml).not.toMatch(/url\(\s*["']?(?!blob:)[^"')\s]+/i);
    for (const authoredUrl of [
      "https://assets.example.test/book/",
      "cover.png",
      "styles/book.css",
      "images/paper.png",
    ]) {
      expect(observation.frameHtml).not.toContain(authoredUrl);
    }
    expect(authoredHostRequests).toEqual([]);
  } finally {
    assertNoBrowserErrors(errors, pageErrors);
  }
});

test("blocks resolver results with one deterministic frozen warning", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors, authoredHostRequests } = await openAssetPage(page, browserName);
  try {
    const observation = await page.evaluate(async () => {
      const blockedReason = "host-private-secret";
      const source = {
        html: '<img src="blocked.png" alt="blocked">',
        baseUrl: "https://assets.example.test/book/",
      };
      const core = (await import("/packages/core/dist/index.js")) as CoreModule;
      const run = async () => {
        const requests: RequestRecord[] = [];
        const host = document.body.appendChild(document.createElement("div"));
        let controller: Controller | undefined;
        try {
          const resolver: AssetResolver = async ({ url, kind, baseUrl, signal }) => {
            requests.push({ url, kind, baseUrl, hasSignal: signal instanceof AbortSignal });
            return { status: "blocked", reason: blockedReason };
          };
          controller = core.mountPageDocument(host, source, { assetResolver: resolver });
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const warning = ready.warnings[0];
          return {
            requests,
            warnings: ready.warnings,
            warningsFrozen: Object.isFrozen(ready.warnings),
            warningFrozen: warning !== undefined && Object.isFrozen(warning),
            frameHtml: frameDocument.documentElement.outerHTML,
          };
        } finally {
          await controller?.destroy();
          host.remove();
        }
      };
      return { first: await run(), second: await run(), blockedReason };
    });

    expect(observation.first.requests).toEqual([
      {
        url: "blocked.png",
        kind: "image",
        baseUrl: "https://assets.example.test/book/",
        hasSignal: true,
      },
    ]);
    expect(observation.first.warnings).toHaveLength(1);
    expect(observation.first.warnings[0]).toMatchObject({
      code: "RESOURCE_BLOCKED",
      message: "Resource was blocked by the loading policy.",
    });
    expect(observation.first.warnings[0]?.sourceIdentity).toEqual(expect.stringMatching(/\S/));
    expect(observation.second.warnings).toEqual(observation.first.warnings);
    expect(observation.first.warningsFrozen).toBe(true);
    expect(observation.first.warningFrozen).toBe(true);
    expect(JSON.stringify(observation.first.warnings)).not.toContain(observation.blockedReason);
    expect(observation.first.frameHtml).not.toMatch(
      new RegExp(`${observation.blockedReason}|blocked\\.png`),
    );
    expect(authoredHostRequests).toEqual([]);
  } finally {
    assertNoBrowserErrors(errors, pageErrors);
  }
});

test("uses resolved stylesheet bases while discovering nested resources breadth-first", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = await openAssetPage(page, browserName);
  try {
    const observation = await page.evaluate(async () => {
      const sourceBase = "https://assets.example.test/book/";
      const rootBase = "https://cdn.example.test/css/book.css";
      const themeBase = "https://cdn.example.test/css/theme.css";
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      const requests: RequestRecord[] = [];
      const resolver: AssetResolver = async ({ url, kind, baseUrl, signal }) => {
        requests.push({ url, kind, baseUrl, hasSignal: signal instanceof AbortSignal });
        if (url === "styles/book.css") {
          return {
            status: "resolved",
            bytes: new TextEncoder().encode(
              '@import "./theme.css"; .paper { background-image: url("../images/paper.png"); }',
            ),
            mimeType: "text/css",
            resolvedUrl: rootBase,
          };
        }
        if (url === "./theme.css") {
          return {
            status: "resolved",
            bytes: new TextEncoder().encode('.theme { background-image: url("./texture.png"); }'),
            mimeType: "text/css",
            resolvedUrl: themeBase,
          };
        }
        return { status: "resolved", bytes: png, mimeType: "image/png" };
      };
      const host = document.body.appendChild(document.createElement("div"));
      let controller: Controller | undefined;
      try {
        const core = (await import("/packages/core/dist/index.js")) as CoreModule;
        controller = core.mountPageDocument(
          host,
          {
            html: '<link rel="stylesheet" href="styles/book.css"><div class="paper theme">Paper</div>',
            baseUrl: sourceBase,
          },
          { assetResolver: resolver },
        );
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        return {
          requests,
          frameHtml: frameDocument.documentElement.outerHTML,
          rootBase,
          themeBase,
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.requests).toEqual([
      {
        url: "styles/book.css",
        kind: "stylesheet",
        baseUrl: "https://assets.example.test/book/",
        hasSignal: true,
      },
      { url: "./theme.css", kind: "stylesheet", baseUrl: observation.rootBase, hasSignal: true },
      { url: "../images/paper.png", kind: "image", baseUrl: observation.rootBase, hasSignal: true },
      { url: "./texture.png", kind: "image", baseUrl: observation.themeBase, hasSignal: true },
    ]);
    expect(observation.frameHtml).not.toMatch(
      /styles\/book\.css|\.\/theme\.css|\.\.\/images\/paper\.png|\.\/texture\.png/,
    );
    expect(observation.frameHtml).not.toMatch(/assets\.example\.test|cdn\.example\.test/);
  } finally {
    assertNoBrowserErrors(errors, pageErrors);
  }
});
