import { type ConsoleMessage, expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const CHROMIUM_SVG_SELF_REFERENCE_CSP_ERROR =
  /^Loading the image 'http:\/\/127\.0\.0\.1:4178\/examples\/book\.html' violates the following Content Security Policy directive: "img-src blob:"\. The action has been blocked\.$/;
const WEBKIT_SVG_SELF_REFERENCE_CSP_ERROR =
  /^Refused to load http:\/\/127\.0\.0\.1:4178\/examples\/book\.html because it does not appear in the img-src directive of the Content Security Policy\.$/;
const FIREFOX_SVG_SELF_REFERENCE_CSP_ERROR =
  /Content-Security-Policy: The page’s settings blocked the loading of a resource \(img-src\) at http:\/\/127\.0\.0\.1:4178\/examples\/book\.html#safe because it violates the following directive: “img-src blob:”/;

function isSvgSelfReferenceCspError(browserName: string, message: ConsoleMessage): boolean {
  if (browserName === "chromium") {
    return (
      message.location().url === "about:srcdoc" &&
      CHROMIUM_SVG_SELF_REFERENCE_CSP_ERROR.test(message.text())
    );
  }
  if (browserName === "firefox") {
    return (
      message.location().url === "http://127.0.0.1:4178/packages/core/dist/index.js" &&
      FIREFOX_SVG_SELF_REFERENCE_CSP_ERROR.test(message.text())
    );
  }
  return (
    browserName === "webkit" &&
    message.location().url === "" &&
    WEBKIT_SVG_SELF_REFERENCE_CSP_ERROR.test(message.text())
  );
}

test("preserves safe head CSS while sanitizing escaped resources", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);

  await page.goto("/examples/book.html");
  try {
    const observation = await page.evaluate(async () => {
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      let controller:
        | {
            ready: Promise<{
              iframe: HTMLIFrameElement;
              warnings: readonly { code: string }[];
            }>;
            destroy(): Promise<void>;
          }
        | undefined;
      try {
        const core = (await import("/packages/core/dist/index.js")) as {
          mountPageDocument(
            container: HTMLElement,
            source: { html: string },
            options: Record<string, never>,
          ): typeof controller;
        };
        controller = core.mountPageDocument(
          host,
          {
            html: `<!doctype html><html><head><style>
              .head-style-probe{color:rgb(1,2,3);font-size:33px;background-image:U\\72L(data:image/svg+xml,%3Csvg%3E)}
            </style></head><body><p class="head-style-probe">Head stylesheet</p></body></html>`,
          },
          {},
        );
        const ready = await controller.ready;
        const frameDocument = ready.iframe.contentDocument;
        if (frameDocument === null) throw new Error("Missing canonical frame document.");
        const probe = frameDocument.querySelector<HTMLElement>(".head-style-probe");
        const computed = probe ? frameDocument.defaultView?.getComputedStyle(probe) : undefined;
        return {
          color: computed?.color ?? "missing",
          fontSize: computed?.fontSize ?? "missing",
          backgroundImage: computed?.backgroundImage ?? "missing",
          styleText: [...frameDocument.querySelectorAll("style")]
            .map((style) => style.textContent ?? "")
            .join("\n"),
          warningCodes: ready.warnings.map((warning) => warning.code),
        };
      } finally {
        await controller?.destroy();
        host.replaceChildren();
      }
    });

    expect(observation.color).toBe("rgb(1, 2, 3)");
    expect(observation.fontSize).toBe("33px");
    expect(observation.backgroundImage).toBe("none");
    expect(observation.styleText).not.toMatch(/url\s*\(/i);
    expect(observation.styleText).not.toMatch(/data:/i);
    expect(observation.warningCodes).toContain("RESOURCE_BLOCKED");
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("sanitizes SVG CSS resources and presentation attributes", async ({ page, browserName }) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName, {
    allowConsoleError: (message) => isSvgSelfReferenceCspError(browserName, message),
  });
  const blockedRequests: string[] = [];
  const blockedRoute = async (route: import("@playwright/test").Route) => {
    blockedRequests.push(route.request().url());
    await route.abort();
  };
  await page.route("https://blocked.invalid/**", blockedRoute);

  let observation:
    | {
        styleText: string;
        dangerMarkup: string;
        svgMarkup: string;
        legacyMarkup: string;
        templateMarkup: string;
        templateImageSrc: string | null;
        templateText: string;
        animationElementCount: number;
        dangerComputed: Record<string, string>;
        safeAttributes: { fill: string | null; stroke: string | null };
        warningCodes: string[];
      }
    | undefined;
  try {
    await page.goto("/examples/book.html");
    observation = await page.evaluate(async () => {
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const core = (await import("/packages/core/dist/index.js")) as {
        mountPageDocument(
          container: HTMLElement,
          source: { html: string },
          options: Record<string, never>,
        ): {
          ready: Promise<{
            iframe: HTMLIFrameElement;
            warnings: readonly { code: string }[];
          }>;
          destroy(): Promise<void>;
        };
      };
      const controller = core.mountPageDocument(
        host,
        {
          html: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
            <style>.danger{fill:U\\72L(https://blocked.invalid/css-fill);stroke:u\\72l(https://blocked.invalid/css-stroke)}</style>
            <image id="animated" href="#safe" width="40" height="40">
              <animate attributeName="href" values="https://blocked.invalid/a.svg;https://blocked.invalid/a2.svg" begin="0s" />
              <set attributeName="href" to="https://blocked.invalid/b.svg" begin="0s" />
            </image>
            <rect id="danger" class="danger" fill="U\\72L(https://blocked.invalid/fill)" stroke="u\\72L(https://blocked.invalid/stroke)" filter="url(https://blocked.invalid/filter)" clip-path="U\\72L(https://blocked.invalid/clip)" mask="u\\72L(https://blocked.invalid/mask)" marker-start="url(https://blocked.invalid/marker)" cursor="U\\72L(https://blocked.invalid/cursor)" width="40" height="40" />
            <rect id="safe" fill="#123456" stroke="#654321" width="40" height="40" />
          </svg><table id="legacy" background="https://blocked.invalid/table"><tr><td background="https://blocked.invalid/cell" lowsrc="https://blocked.invalid/low" dynsrc="https://blocked.invalid/dyn">Legacy</td></tr></table><template id="safe-template" shadowrootmode="open"><span>Safe template text</span><img src="//blocked.invalid/template-escape.png" /></template>`,
        },
        {},
      );
      Object.defineProperty(window, "__imposiaSvgSecurityController", {
        configurable: true,
        value: controller,
      });
      const ready = await controller.ready;
      const frameDocument = ready.iframe.contentDocument;
      if (frameDocument === null) throw new Error("Missing canonical frame document.");
      const danger = frameDocument.querySelector<SVGElement>("#danger");
      const safe = frameDocument.querySelector<SVGElement>("#safe");
      const computed = danger ? frameDocument.defaultView?.getComputedStyle(danger) : undefined;
      return {
        styleText: [...frameDocument.querySelectorAll("style")]
          .map((style) => style.textContent ?? "")
          .join("\n"),
        dangerMarkup: danger?.outerHTML ?? "missing",
        svgMarkup: frameDocument.querySelector("svg")?.outerHTML ?? "missing",
        legacyMarkup: frameDocument.querySelector("#legacy")?.outerHTML ?? "missing",
        templateMarkup:
          frameDocument.querySelector<HTMLTemplateElement>("#safe-template")?.outerHTML ??
          "missing",
        templateImageSrc:
          frameDocument
            .querySelector<HTMLTemplateElement>("#safe-template")
            ?.content.querySelector("img")
            ?.getAttribute("src") ?? null,
        templateText:
          frameDocument.querySelector<HTMLTemplateElement>("#safe-template")?.content.textContent ??
          "",
        animationElementCount: frameDocument.querySelectorAll(
          "animate,animateMotion,animateTransform,set,discard",
        ).length,
        dangerComputed: {
          fill: computed?.fill ?? "missing",
          stroke: computed?.stroke ?? "missing",
          filter: computed?.filter ?? "missing",
          clipPath: computed?.clipPath ?? "missing",
          mask: computed?.mask ?? "missing",
          markerStart: computed?.markerStart ?? "missing",
          cursor: computed?.cursor ?? "missing",
        },
        safeAttributes: {
          fill: safe?.getAttribute("fill") ?? null,
          stroke: safe?.getAttribute("stroke") ?? null,
        },
        warningCodes: ready.warnings.map((warning) => warning.code),
      };
    });

    if (observation === undefined) throw new Error("SVG sanitizer observation was not captured.");
    expect(blockedRequests).toEqual([]);
    expect(observation.styleText).not.toMatch(/url\s*\(/i);
    expect(observation.styleText).not.toMatch(/blocked\.invalid/i);
    expect(observation.dangerMarkup).not.toMatch(/url\s*\(|blocked\.invalid/i);
    expect(observation.svgMarkup).not.toMatch(
      /<(?:animate|set|discard|animatemotion|animatetransform)\b|blocked\.invalid/i,
    );
    expect(observation.legacyMarkup).not.toMatch(/background|lowsrc|dynsrc|blocked\.invalid/i);
    expect(observation.templateMarkup).not.toMatch(/shadowroot|blocked\.invalid/i);
    expect(observation.templateImageSrc).toBeNull();
    expect(observation.templateText).toContain("Safe template text");
    expect(observation.animationElementCount).toBe(0);
    for (const value of Object.values(observation.dangerComputed)) {
      expect(value).not.toMatch(/url\s*\(|blocked\.invalid/i);
    }
    expect(observation.safeAttributes).toEqual({ fill: "#123456", stroke: "#654321" });
    expect(observation.warningCodes).toEqual(["RESOURCE_BLOCKED"]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await page.evaluate(async () => {
      const candidate: unknown = Object.getOwnPropertyDescriptor(
        window,
        "__imposiaSvgSecurityController",
      )?.value;
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        "destroy" in candidate &&
        typeof candidate.destroy === "function"
      ) {
        await candidate.destroy();
      }
      Reflect.deleteProperty(window, "__imposiaSvgSecurityController");
    });
    await page.unroute("https://blocked.invalid/**", blockedRoute);
  }
});
