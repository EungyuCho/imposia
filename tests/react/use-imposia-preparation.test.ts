// @vitest-environment happy-dom
import type { PageDocument } from "@imposia/client";
import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ImposiaDocumentState,
  type UseImposiaDocumentResult,
  useImposiaDocument,
} from "../../packages/react/src/use-imposia-document.js";

const mocked = vi.hoisted(() => {
  const state = {
    mounts: 0,
    updates: 0,
    destroys: 0,
    failNextMount: false,
    deferReady: undefined as ((value: PageDocument) => void) | undefined,
  };
  const pageDocument = (generation: number) => ({ generation }) as unknown as PageDocument;
  return {
    state,
    mountPageDocument: (): unknown => {
      state.mounts += 1;
      if (state.failNextMount) {
        state.failNextMount = false;
        throw new Error("mount failed");
      }
      return {
        ready: state.deferReady
          ? new Promise<PageDocument>((resolve) => {
              state.deferReady = resolve;
            })
          : Promise.resolve(pageDocument(1)),
        update: () => {
          state.updates += 1;
          return Promise.resolve(pageDocument(2));
        },
        destroy: () => {
          state.destroys += 1;
          return Promise.resolve();
        },
      };
    },
  };
});

vi.mock("../../packages/client/dist/index.js", () => ({
  mountPageDocument: mocked.mountPageDocument,
}));

const source = { html: "<p>Hello</p>" };
let container: HTMLDivElement;
let root: Root;
let latest: UseImposiaDocumentResult;

function Harness(props: { readonly preparation: "immediate" | "idle" | "manual" }) {
  latest = useImposiaDocument({ source, preparation: props.preparation });
  return createElement("div", { ref: latest.hostRef });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(mocked.state, { mounts: 0, updates: 0, destroys: 0, failNextMount: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  container.remove();
});

describe("useImposiaDocument preparation", () => {
  it("labels a ready document with the source it was mounted with, not a suspended render's", async () => {
    mocked.state.deferReady = () => {};
    const sourceA = { html: "<p>A</p>" };
    const sourceB = { html: "<p>B</p>" };
    const never = new Promise<never>(() => {});
    function Host(props: { readonly source: { html: string }; readonly suspend: boolean }) {
      latest = useImposiaDocument({ source: props.source });
      // Suspending after the hook ran: the render wrote sourceRef but never commits.
      if (props.suspend) throw never;
      return createElement("div", { ref: latest.hostRef });
    }
    const tree = (source: { html: string }, suspend: boolean) =>
      createElement(Suspense, { fallback: null }, createElement(Host, { source, suspend }));
    await act(async () => root.render(tree(sourceA, false)));
    await act(async () => root.render(tree(sourceB, true)));
    await act(async () => {
      (mocked.state.deferReady as (value: PageDocument) => void)({ generation: 1 } as PageDocument);
    });
    expect(latest.state.status).toBe("ready");
    expect(latest.state.source).toBe(sourceA);
    mocked.state.deferReady = undefined;
    await act(async () => root.unmount());
  });

  it("waits for prepare(), recovers from a synchronous mount failure with retry()", async () => {
    await act(async () => root.render(createElement(Harness, { preparation: "manual" })));
    expect(mocked.state.mounts).toBe(0);
    expect(latest.state.status).toBe("idle");

    mocked.state.failNextMount = true;
    await act(async () => latest.prepare());
    expect(mocked.state.mounts).toBe(1);
    expect(latest.state.status).toBe("error");

    await act(async () => latest.retry());
    expect(mocked.state.mounts).toBe(2);
    const ready: ImposiaDocumentState = latest.state;
    expect(ready.status).toBe("ready");
    expect(ready.source).toBe(source);

    await act(async () => latest.prepare());
    expect(mocked.state.mounts).toBe(2);

    await act(async () => latest.retry());
    expect(mocked.state.mounts).toBe(2);
    expect(mocked.state.updates).toBe(1);
    expect(latest.state.document?.generation).toBe(2);

    await act(async () => root.unmount());
    expect(mocked.state.destroys).toBe(1);
  });

  it("mounts immediately by default and when idle callbacks are unavailable falls back to a timer", async () => {
    await act(async () => root.render(createElement(Harness, { preparation: "immediate" })));
    expect(mocked.state.mounts).toBe(1);
    await act(async () => root.unmount());

    vi.useFakeTimers();
    try {
      root = createRoot(container);
      Object.assign(mocked.state, { mounts: 0 });
      const idle = globalThis as { requestIdleCallback?: unknown };
      const saved = idle.requestIdleCallback;
      idle.requestIdleCallback = undefined;
      await act(async () => root.render(createElement(Harness, { preparation: "idle" })));
      expect(mocked.state.mounts).toBe(0);
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(mocked.state.mounts).toBe(1);
      idle.requestIdleCallback = saved;
    } finally {
      vi.useRealTimers();
    }
    await act(async () => root.unmount());
  });
});
