import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// ASA-438 regression gate (originally the reproduction harness).
//
// Under full-suite load the React adapter test once observed an uncaught
// "Invalid PageDocument: canonical page markers do not match pageCount." from
// the Viewer. Core's commit is atomic (one synchronous replaceChildren), so no
// mid-swap DOM state exists; the failure was the Viewer/React boundary gap:
// between Core committing the next generation into the canonical iframe and
// the React adapter's passive effect calling viewer.refresh(), the Viewer
// still held the previous generation's pageCount, and any Viewer entry point
// running inside that gap — the ResizeObserver's rAF callback, a toolbar
// click, a keyboard handler — measured the new iframe against the old
// pageCount and threw. Under load the gap spans multiple frames, which is why
// the flake only appeared in full-suite runs.
//
// The barrier that closes the gap: Core stamps the committed generation on
// the canonical frame's root at commit time, and the Viewer's ambient
// synchronization defers whenever the frame's stamp is ahead of the Viewer's
// committed document — a newer commit awaiting delivery is not an invariant
// violation. Explicit APIs (mount, refresh) keep strict validation, and a
// marker mismatch without a newer stamp still throws as real corruption.
//
// This spec drives the gap deterministically instead of waiting for load: a
// MutationObserver on the canonical frame body is delivered in a microtask
// queued during commitGeneration's replaceChildren, which the HTML event loop
// guarantees to run before the update promise's own reaction microtasks — and
// therefore before React can schedule the render whose passive effect calls
// viewer.refresh(). A real user-equivalent interaction (the imperative
// next-page handle, identical to a toolbar click) issued at that instant
// exercises the barrier: it must NOT throw, and the adapter must still
// converge atomically on the new generation. If the barrier regresses, the
// interaction throws again and the `threw` expectation below fails.
test("Viewer interaction between Core commit and adapter refresh observes the generation gap deterministically", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/react/");

  try {
    const host = page.locator(".react-adapter-host");
    await expect(host).toHaveAttribute("data-imposia-react-status", "ready");
    await expect(host).toHaveAttribute("data-imposia-generation", "1");

    const observed = await page.evaluate(async () => {
      type ViewerState = { readonly pageCount: number; readonly generation: number };
      type Handle = {
        readonly current: { pageCount: number; generation: number } | undefined;
        readonly viewerState: ViewerState | undefined;
        nextPage(): void;
      };
      const observation = (
        globalThis as unknown as {
          imposiaReactObservation: {
            handle: Handle | undefined;
            setSource: ((source: { html: string }) => void) | undefined;
          };
        }
      ).imposiaReactObservation;
      const handle = observation.handle;
      const setSource = observation.setSource;
      const frame = document.querySelector<HTMLIFrameElement>(
        '.react-adapter-host iframe[data-imposia-frame="page-document"]',
      );
      const frameBody = frame?.contentDocument?.body;
      if (handle === undefined || setSource === undefined || frameBody === undefined) {
        throw new Error("React generation race fixture is unavailable.");
      }
      const committedBefore = handle.current;
      if (committedBefore === undefined) throw new Error("React document is not ready.");
      const previousPageCount = committedBefore.pageCount;
      const previousGeneration = committedBefore.generation;
      type Probe = {
        threw: boolean;
        message: string;
        markerCount: number;
        viewerGenerationAtObservation: number | undefined;
        viewerPageCountAtObservation: number | undefined;
      };
      const probe = await new Promise<Probe>((resolve) => {
        const observer = new MutationObserver(() => {
          const markerCount =
            frame?.contentDocument?.querySelectorAll("[data-imposia-page]").length ?? -1;
          if (markerCount === previousPageCount) return;
          observer.disconnect();
          const viewerState = handle.viewerState;
          try {
            handle.nextPage();
            resolve({
              threw: false,
              message: "",
              markerCount,
              viewerGenerationAtObservation: viewerState?.generation,
              viewerPageCountAtObservation: viewerState?.pageCount,
            });
          } catch (error: unknown) {
            resolve({
              threw: true,
              message: error instanceof Error ? error.message : String(error),
              markerCount,
              viewerGenerationAtObservation: viewerState?.generation,
              viewerPageCountAtObservation: viewerState?.pageCount,
            });
          }
        });
        observer.observe(frameBody, { childList: true });
        setSource({
          html: '<h1>Race probe</h1><section style="break-before: page"><p>Second page</p></section>',
        });
      });
      return { ...probe, previousPageCount, previousGeneration };
    });

    // The canonical iframe already carried the next generation's markers…
    expect(observed.previousPageCount).toBe(1);
    expect(observed.markerCount).toBe(2);
    // …while the Viewer still held the previous generation at that instant —
    // the ASA-438 gap really was open when the interaction ran:
    expect(observed.viewerGenerationAtObservation).toBe(observed.previousGeneration);
    expect(observed.viewerPageCountAtObservation).toBe(observed.previousPageCount);
    // The generation barrier absorbs the transient: the interaction defers
    // instead of throwing. (Before the barrier this threw "Invalid
    // PageDocument: canonical page markers do not match pageCount (expected
    // 1, found 2, generation 1)." — a regression here reintroduces ASA-438.)
    expect(observed.threw).toBe(false);
    expect(observed.message).toBe("");

    // The gap is observation-only: the commit itself stays atomic and the
    // adapter converges on the new generation with one canonical iframe.
    await expect(host).toHaveAttribute("data-imposia-generation", "2");
    await expect(host.getByTestId("page-indicator")).toHaveText("1 / 2");
    await expect(host.locator('iframe[data-imposia-frame="page-document"]')).toHaveCount(1);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
