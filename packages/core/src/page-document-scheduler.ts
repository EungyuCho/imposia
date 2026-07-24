import type { PageComposeOptions } from "./page-document-types.js";

const DEFAULT_YIELD_BUDGET_MS = 8;

export interface PageComposeSettings {
  readonly yieldBudgetMs: number;
  readonly scheduler: () => Promise<void>;
}

export interface PageComposeScheduler {
  checkpoint(signal: AbortSignal): Promise<void> | undefined;
}

function aborted(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function abortable(task: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(aborted());
    };
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      () => {
        cleanup();
        resolve();
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function nextTask(): Promise<void> {
  const schedulerCandidate = Reflect.get(globalThis, "scheduler");
  if (typeof schedulerCandidate === "object" && schedulerCandidate !== null) {
    const yieldCandidate = Reflect.get(schedulerCandidate, "yield");
    if (typeof yieldCandidate === "function") {
      return Promise.resolve(Reflect.apply(yieldCandidate, schedulerCandidate, [])).then(
        () => undefined,
      );
    }
  }
  if (typeof MessageChannel === "function") {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(undefined);
    });
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function normalizeComposeOptions(
  options: PageComposeOptions | undefined,
): PageComposeSettings {
  const yieldBudgetMs = options?.yieldBudgetMs ?? DEFAULT_YIELD_BUDGET_MS;
  if (
    yieldBudgetMs !== Number.POSITIVE_INFINITY &&
    (!Number.isFinite(yieldBudgetMs) || yieldBudgetMs < 0)
  ) {
    throw new TypeError("compose.yieldBudgetMs must be a non-negative finite number or Infinity.");
  }
  return Object.freeze({
    yieldBudgetMs,
    scheduler: options?.scheduler ?? nextTask,
  });
}

export function createComposeScheduler(settings: PageComposeSettings): PageComposeScheduler {
  let sliceStartedAt = performance.now();
  return Object.freeze({
    checkpoint(signal: AbortSignal): Promise<void> | undefined {
      if (
        settings.yieldBudgetMs === Number.POSITIVE_INFINITY ||
        performance.now() - sliceStartedAt < settings.yieldBudgetMs
      ) {
        return undefined;
      }
      return abortable(settings.scheduler(), signal).then(() => {
        sliceStartedAt = performance.now();
      });
    },
  });
}
