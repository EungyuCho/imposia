import { expect, test } from "@playwright/test";
import { assertNoBrowserErrors, openAssetPage } from "./browser-core-assets-support.js";

// SVG is accepted as an image only after the file passes the SVG policy and decodes the way
// it will be drawn. The policy refuses, rather than repairs, anything that runs code or
// reaches beyond the image; every refusal is a RESOURCE_BLOCKED warning that names the
// element (sourceIdentity) and the reason, with nothing taken from the file itself.

const GOOD =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#06c"/><stop offset="1" stop-color="#c06"/></linearGradient></defs><rect width="120" height="60" fill="url(#g)"/></svg>';
const NS = 'xmlns="http://www.w3.org/2000/svg" width="20" height="20"';
const REFUSED: Record<string, { svg: string; reason: RegExp }> = {
  script: {
    svg: `<svg ${NS}><script>alert(1)</script></svg>`,
    reason: /script element/,
  },
  handler: {
    svg: `<svg ${NS} onload="alert(1)"><rect width="20" height="20"/></svg>`,
    reason: /event-handler attribute/,
  },
  foreign: {
    svg: `<svg ${NS}><foreignObject width="20" height="20"><div>x</div></foreignObject></svg>`,
    reason: /foreignObject/,
  },
  externalHref: {
    svg: `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><image width="20" height="20" xlink:href="https://blocked.invalid/a.png"/></svg>`,
    reason: /external resource reference/,
  },
  externalUse: {
    svg: `<svg ${NS}><use href="https://blocked.invalid/sprite.svg#a"/></svg>`,
    reason: /external resource reference/,
  },
  externalUrl: {
    svg: `<svg ${NS}><rect width="20" height="20" style="fill:url(https://blocked.invalid/p#x)"/></svg>`,
    reason: /external resource reference/,
  },
  importRule: {
    svg: `<svg ${NS}><style>@import url("https://blocked.invalid/a.css");</style></svg>`,
    reason: /@import/,
  },
  animatedHref: {
    svg: `<svg ${NS}><a href="#x"><set attributeName="href" to="https://blocked.invalid/"/></a></svg>`,
    reason: /animates a reference/,
  },
  entity: {
    svg: `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "x">]><svg ${NS}><text>&a;</text></svg>`,
    reason: /declares entities/,
  },
  escapedUrl: {
    svg: `<svg ${NS}><rect width="20" height="20" style="fill:u\\72l(https://blocked.invalid/p#x)"/></svg>`,
    reason: /external resource reference/,
  },
  escapedUrlInStyleElement: {
    svg: `<svg ${NS}><style>rect{fill:\\75rl("https://blocked.invalid/p")}</style></svg>`,
    reason: /external resource reference/,
  },
  escapedImport: {
    svg: `<svg ${NS}><style>@\\69mport "https://blocked.invalid/a.css";</style></svg>`,
    reason: /@import|could not be parsed/,
  },
  otherXlinkPrefix: {
    svg: `<svg ${NS} xmlns:q="http://www.w3.org/1999/xlink"><image width="20" height="20" q:href="https://blocked.invalid/a.png"/></svg>`,
    reason: /external resource reference/,
  },
  escapedLineBreak: {
    svg: `<svg ${NS}><style>rect{fill:url("https://blocked.invalid/ex\\\nample.svg#g")}</style></svg>`,
    reason: /external resource reference/,
  },
  stylesheetInstruction: {
    svg: `<?xml-stylesheet href="https://blocked.invalid/a.css" type="text/css"?><svg ${NS}><rect width="20" height="20"/></svg>`,
    reason: /external resource reference/,
  },
  animatedPaint: {
    svg: `<svg ${NS}><rect width="20" height="20"><set attributeName="fill" to="url(https://blocked.invalid/p.svg#g)"/></rect></svg>`,
    reason: /external resource reference/,
  },
  animatedStyle: {
    svg: `<svg ${NS}><rect width="20" height="20"><animate attributeName="style" values="fill:red;fill:url(https://blocked.invalid/p#x)"/></rect></svg>`,
    reason: /external resource reference/,
  },
  malformed: { svg: `<svg ${NS}><rect></svg>`, reason: /not well-formed/ },
  notSvg: {
    svg: '<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>',
    reason: /does not have an svg root/,
  },
};

test("shows a valid SVG, keeps its authored size in the preview and the export", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors, authoredHostRequests } = await openAssetPage(page, browserName);
  try {
    const result = await page.evaluate(async (good) => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const host = document.body.appendChild(document.createElement("div"));
      const requests: string[] = [];
      const controller = core.mountPageDocument(
        host,
        {
          html: '<p>before</p><img id="logo" src="logo.svg" style="width: 240px" alt="logo"><img id="sized" src="logo.svg" width="60" height="30" alt="sized"><img id="data" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIvPg==" alt="inline">',
          baseUrl: "https://assets.example.test/",
        },
        {
          assetResolver: async ({ url }) => {
            requests.push(url);
            return {
              status: "resolved",
              bytes: new TextEncoder().encode(good),
              mimeType: "image/svg+xml",
            };
          },
        },
      );
      const doc = await controller.ready;
      const frame = doc.iframe.contentDocument as Document;
      for (const image of frame.querySelectorAll("img"))
        await image.decode().catch(() => undefined);
      const read = (id: string) => {
        const image = frame.getElementById(id) as HTMLImageElement | null;
        return image === null
          ? null
          : {
              src: image.getAttribute("src")?.slice(0, 5),
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              width: image.getBoundingClientRect().width,
              height: image.getBoundingClientRect().height,
            };
      };
      const exported = await core.exportPageDocumentHtml(doc);
      const copy = new DOMParser().parseFromString(exported, "text/html");
      return {
        requests,
        logo: read("logo"),
        sized: read("sized"),
        warnings: doc.warnings.map((warning) => warning.code),
        exportedLogo: copy.getElementById("logo")?.getAttribute("src")?.slice(0, 26),
        exportedSized: copy.getElementById("sized")?.getAttribute("width"),
      };
    }, GOOD);
    expect(result.requests).toContain("logo.svg");
    expect(result.logo?.src).toBe("blob:");
    expect(result.logo?.complete).toBe(true);
    // The authored display size wins, and the aspect ratio of the file (2:1) is kept.
    expect(result.logo?.width).toBe(240);
    expect(result.logo?.height).toBeCloseTo(120, 0);
    expect(result.sized?.width).toBe(60);
    expect(result.sized?.height).toBe(30);
    expect(result.exportedLogo).toBe("data:image/svg+xml;base64,");
    expect(result.exportedSized).toBe("60");
    expect(result.warnings).not.toContain("RESOURCE_BLOCKED");
    expect(authoredHostRequests).toEqual([]);
    assertNoBrowserErrors(errors, pageErrors);
  } finally {
    await page.close();
  }
});

test("does not mistake descriptive text for CSS", async ({ page, browserName }) => {
  const { errors, pageErrors } = await openAssetPage(page, browserName);
  const svg = `<svg ${NS} aria-label="CSS @import example, url(https://example.test/x)"><title>@import url(https://example.test/y)</title><rect width="20" height="20" fill="url(#g)" data-note="u\\72l(https://example.test/z)"/><defs><linearGradient id="g"/></defs></svg>`;
  const warnings = await page.evaluate(async (markup) => {
    const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
    const host = document.body.appendChild(document.createElement("div"));
    const doc = await core.mountPageDocument(
      host,
      { html: '<img id="d" src="d.svg" alt="d">', baseUrl: "https://assets.example.test/" },
      {
        assetResolver: async () => ({
          status: "resolved",
          bytes: new TextEncoder().encode(markup),
          mimeType: "image/svg+xml",
        }),
      },
    ).ready;
    const image = (doc.iframe.contentDocument as Document).getElementById("d");
    return {
      codes: doc.warnings.map((warning) => warning.code),
      src: image?.getAttribute("src")?.slice(0, 5),
    };
  }, svg);
  expect(warnings.codes).not.toContain("RESOURCE_BLOCKED");
  expect(warnings.src).toBe("blob:");
  assertNoBrowserErrors(errors, pageErrors);
});

test("refuses unsafe or broken SVG with the element and the reason, without a request", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors, authoredHostRequests } = await openAssetPage(page, browserName);
  const outcomes = await page.evaluate(
    async (refused) => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const result: Record<string, { reason: string; identity: string; code: string }[]> = {};
      for (const [name, { svg }] of Object.entries(refused)) {
        const host = document.body.appendChild(document.createElement("div"));
        const controller = core.mountPageDocument(
          host,
          {
            html: '<img src="bad.svg" alt="bad"><p>after</p>',
            baseUrl: "https://assets.example.test/",
          },
          {
            assetResolver: async () => ({
              status: "resolved",
              bytes: new TextEncoder().encode(svg),
              mimeType: "image/svg+xml",
            }),
          },
        );
        const doc = await controller.ready;
        result[name] = doc.warnings
          .filter((warning) => warning.code === "RESOURCE_BLOCKED")
          .map((warning) => ({
            reason: `${warning.recovery}`,
            identity: `${warning.sourceIdentity}`,
            code: warning.code,
          }));
        host.remove();
      }
      return result;
    },
    Object.fromEntries(Object.entries(REFUSED).map(([name, { svg }]) => [name, { svg }])),
  );
  for (const [name, { reason }] of Object.entries(REFUSED)) {
    const warnings = outcomes[name] ?? [];
    expect(warnings, name).toHaveLength(1);
    expect(warnings[0]?.reason, name).toMatch(reason);
    expect(warnings[0]?.reason, name).toMatch(/^SVG .* and was not loaded$/);
    expect(warnings[0]?.identity, name).not.toBe("undefined");
    // Nothing from the file is quoted in the diagnostic.
    expect(warnings[0]?.reason, name).not.toMatch(/blocked\.invalid|alert/);
  }
  expect(authoredHostRequests).toEqual([]);
  // Firefox reports a parse failure of malformed XML on its own console; that is the browser
  // describing the rejected file, not a fault of the page.
  assertNoBrowserErrors(
    errors.filter((error) => !/XML Parsing Error/.test(error.text)),
    pageErrors,
  );
});
