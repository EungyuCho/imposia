import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

test("React adapter updates the canonical iframe, reports failures, and cleans up on unmount", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Canonical page presentation is Chromium-reference only.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    await expect(
      page.locator(".react-adapter-host[data-imposia-react-status='ready']"),
    ).toBeVisible();
    await expect(page.locator(".react-adapter-host iframe")).toHaveCount(1);

    const initial = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".react-adapter-host");
      const frame = host?.querySelector("iframe");
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            ready: number;
            errors: string[];
            states: string[];
            setSource: ((source: { html: string }) => void) | undefined;
          };
        }
      ).imposiaReactObservation;
      if (host === null || frame === null || observation.setSource === undefined) {
        throw new Error("React fixture did not initialize.");
      }
      (globalThis as { initialReactFrame?: HTMLIFrameElement }).initialReactFrame = frame;
      return { ready: observation.ready, text: frame.contentDocument?.body.textContent ?? "" };
    });

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setSource: (source: { html: string }) => void;
          };
        }
      ).imposiaReactObservation;
      observation.setSource({ html: "<h1>Updated React document</h1><p>Second generation</p>" });
    });
    await expect(page.locator(".react-adapter-host[data-imposia-generation='2']")).toHaveCount(1);

    const updated = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".react-adapter-host");
      const observation = (globalThis as { imposiaReactObservation: { ready: number } })
        .imposiaReactObservation;
      const frame = host?.querySelector("iframe");
      return {
        sameFrame:
          frame === (globalThis as { initialReactFrame?: HTMLIFrameElement }).initialReactFrame,
        text: frame?.contentDocument?.body.textContent ?? "",
        ready: observation.ready,
      };
    });

    await page.evaluate(() => {
      const observation = (
        globalThis as {
          imposiaReactObservation: {
            setSource: (source: { html: string }) => void;
          };
        }
      ).imposiaReactObservation;
      observation.setSource({ html: null } as unknown as { html: string });
    });
    await expect(
      page.locator(".react-adapter-host[data-imposia-react-status='error']"),
    ).toHaveCount(1);

    const failed = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".react-adapter-host");
      const observation = (globalThis as { imposiaReactObservation: { errors: string[] } })
        .imposiaReactObservation;
      return {
        frameCount: host?.querySelectorAll("iframe").length ?? 0,
        text: host?.querySelector("iframe")?.contentDocument?.body.textContent ?? "",
        errors: observation.errors,
        states: (globalThis as { imposiaReactObservation: { states: string[] } })
          .imposiaReactObservation.states,
      };
    });

    await page.evaluate(() => {
      const observation = (globalThis as { imposiaReactObservation: { unmount: () => void } })
        .imposiaReactObservation;
      observation.unmount();
    });
    await expect(page.locator(".react-adapter-host")).toHaveCount(0);

    expect(initial.ready).toBe(1);
    expect(initial.text).toContain("Initial page");
    expect(updated.text).toContain("Second generation");
    expect(updated.ready).toBe(2);
    expect(updated.sameFrame).toBe(true);
    expect(failed.frameCount).toBe(1);
    expect(failed.text).toContain("Second generation");
    expect(failed.errors).toEqual(["Page source html must be a string."]);
    expect(failed.states).toEqual(["loading", "ready", "loading", "ready", "loading", "error"]);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
