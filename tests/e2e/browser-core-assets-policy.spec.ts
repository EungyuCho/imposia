import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.describe("blockedResourcePolicy", () => {
  test("warn keeps blocked documents, error fails them before commit", async ({
    page,
    browserName,
  }) => {
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    const authoredHostRequests: string[] = [];
    await page.route("https://assets.example.test/**", async (route) => {
      authoredHostRequests.push(route.request().url());
      await route.abort();
    });
    await page.goto("/examples/book.html");
    const result = await page.evaluate(async (png) => {
      const core = (await import("/packages/core/dist/index.js")) as typeof import("@imposia/core");
      const good = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const html = '<p>Body</p><img src="https://assets.example.test/a.png" alt="a">';
      type Mode = "blocked" | "invalid" | "good";
      const run = async (
        mode: Mode | "none",
        policy: "warn" | "error" | undefined,
        options: { update?: boolean } = {},
      ) => {
        const host = document.body.appendChild(document.createElement("div"));
        const resolver: import("@imposia/core").AssetResolver | undefined =
          mode === "none"
            ? undefined
            : async () =>
                mode === "blocked"
                  ? { status: "blocked", reason: "private-proxy-secret" }
                  : {
                      status: "resolved",
                      bytes: mode === "invalid" ? new Uint8Array([1, 2, 3]) : good,
                      mimeType: "image/png",
                    };
        const controller = core.mountPageDocument(
          host,
          { html: options.update ? "<p>first</p>" : html },
          {
            ...(resolver === undefined ? {} : { assetResolver: resolver }),
            ...(policy === undefined ? {} : { blockedResourcePolicy: policy }),
          },
        );
        let readyError: string | undefined;
        let first: import("@imposia/core").PageDocument | undefined;
        try {
          first = await controller.ready;
        } catch (error) {
          readyError = String((error as Error).message);
        }
        let updateError: string | undefined;
        let sameCurrent = false;
        let nextGeneration: number | undefined;
        if (options.update && first !== undefined) {
          try {
            await controller.update({ html });
          } catch (error) {
            updateError = String((error as Error).message);
          }
          sameCurrent = controller.current === first;
        }
        const summary = {
          readyError,
          updateError,
          sameCurrent,
          currentUndefined: controller.current === undefined,
          codes: first?.warnings.map((w) => w.code) ?? [],
          frames: host.querySelectorAll("iframe").length,
          nextGeneration,
        };
        await controller.destroy();
        return summary;
      };
      const out = {
        default: await run("blocked", undefined),
        warn: await run("blocked", "warn"),
        blocked: await run("blocked", "error"),
        invalid: await run("invalid", "error"),
        missing: await run("none", "error"),
        good: await run("good", "error"),
        updateFail: await run("blocked", "error", { update: true }),
      };
      let policyError = "";
      try {
        core.mountPageDocument(
          document.body,
          { html: "x" },
          {
            blockedResourcePolicy: "strict" as never,
          },
        );
      } catch (error) {
        policyError = (error as Error).message;
      }
      // Recovery: a failed update keeps the previous generation; a later good update succeeds.
      const host = document.body.appendChild(document.createElement("div"));
      let mode: Mode = "blocked";
      const controller = core.mountPageDocument(
        host,
        { html: "<p>first</p>" },
        {
          blockedResourcePolicy: "error",
          assetResolver: async () =>
            mode === "blocked"
              ? { status: "blocked" }
              : { status: "resolved", bytes: good, mimeType: "image/png" },
        },
      );
      const first = await controller.ready;
      await controller.update({ html }).catch(() => undefined);
      const afterFail = controller.current === first;
      mode = "good";
      const second = await controller.update({ html });
      const recovered = {
        afterFail,
        generation: second.generation - first.generation,
        blobImage: host.querySelector("iframe")?.contentDocument?.querySelector("img")?.src ?? "",
      };
      await controller.destroy();
      return { out, policyError, recovered };
    }, PNG);

    expect(result.out.default.codes).toContain("RESOURCE_BLOCKED");
    expect(result.out.warn.codes).toContain("RESOURCE_BLOCKED");
    for (const key of ["blocked", "invalid", "missing"] as const) {
      expect(result.out[key].readyError).toBe("A required document resource was blocked.");
      expect(result.out[key].currentUndefined).toBe(true);
      expect(result.out[key].readyError).not.toContain("private-proxy-secret");
    }
    expect(result.out.good.readyError).toBeUndefined();
    expect(result.out.updateFail.updateError).toBe("A required document resource was blocked.");
    expect(result.out.updateFail.sameCurrent).toBe(true);
    expect(result.policyError).toBe('blockedResourcePolicy must be "warn" or "error".');
    expect(result.recovered.afterFail).toBe(true);
    expect(result.recovered.generation).toBeGreaterThanOrEqual(1);
    expect(result.recovered.blobImage).toMatch(/^blob:/);
    expect(authoredHostRequests).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
