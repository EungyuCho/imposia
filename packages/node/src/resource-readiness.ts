import type { Page, Request } from "playwright";

export interface ResourceTracker {
  dispose(): void;
  waitForReady(): Promise<void>;
}

export function trackPageResources(page: Page): ResourceTracker {
  const active = new Set<Request>();
  let disposed = false;
  let notify: (() => void) | undefined;
  const signal = () => {
    const pending = notify;
    notify = undefined;
    pending?.();
  };
  const onRequest = (request: Request) => {
    active.add(request);
    signal();
  };
  const onSettled = (request: Request) => {
    active.delete(request);
    signal();
  };
  page.on("request", onRequest);
  page.on("requestfailed", onSettled);
  page.on("requestfinished", onSettled);

  return {
    dispose() {
      disposed = true;
      active.clear();
      page.off("request", onRequest);
      page.off("requestfailed", onSettled);
      page.off("requestfinished", onSettled);
      signal();
    },
    async waitForReady() {
      await page.evaluate(async () => {
        document.documentElement.getBoundingClientRect().height;
        await document.fonts.ready;
      });
      while (!disposed && active.size > 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    },
  };
}
