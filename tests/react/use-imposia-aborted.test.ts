// @vitest-environment happy-dom
import type {
  PageDocument,
  PageDocumentOptions,
  PageSource,
  PublicationDocument,
  PublicationOptions,
  PublicationSnapshot,
} from "@imposia/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ImposiaDocumentState,
  useImposiaDocument,
} from "../../packages/react/src/use-imposia-document.js";
import {
  type ImposiaPublicationState,
  useImposiaPublication,
} from "../../packages/react/src/use-imposia-publication.js";

const mocked = vi.hoisted(() => {
  const documentMounts: ReadyControls[] = [];
  const publicationMounts: ReadyControls[] = [];
  const updates: ReadyControls[] = [];
  const abortError = () => new DOMException("The operation was aborted.", "AbortError");

  type ReadyControls = {
    resolve(value: unknown): void;
    reject(error: unknown): void;
  };

  const controlled = (registry: ReadyControls[], signal: AbortSignal | undefined) => {
    let controls: ReadyControls = { resolve: () => {}, reject: () => {} };
    const promise = new Promise((resolve, reject) => {
      controls = { resolve, reject };
    });
    // Mirror the confirmed reach path: mountPageDocument hands options.signal to begin,
    // so aborting the caller's signal rejects the live run's ready with an AbortError.
    signal?.addEventListener("abort", () => controls.reject(abortError()), { once: true });
    registry.push(controls);
    promise.then(
      () => {},
      () => {},
    );
    return promise;
  };

  const mountController = (
    registry: ReadyControls[],
    options: { signal?: AbortSignal } | undefined,
  ) => ({
    ready: controlled(registry, options?.signal),
    update: () => controlled(updates, undefined),
    destroy: () => Promise.resolve(),
  });

  return {
    documentMounts,
    publicationMounts,
    updates,
    mountPageDocument: (
      _host: unknown,
      _source: unknown,
      options?: { signal?: AbortSignal },
    ): unknown => mountController(documentMounts, options),
    mountPublication: (
      _host: unknown,
      _snapshot: unknown,
      options?: { signal?: AbortSignal },
    ): unknown => mountController(publicationMounts, options),
  };
});

// The hooks resolve "@imposia/client" through packages/react/node_modules, which this test
// file cannot resolve from tests/. Mocking the resolved module path keys the mock onto the
// same id the hooks' import resolves to.
vi.mock("../../packages/client/dist/index.js", () => ({
  mountPageDocument: mocked.mountPageDocument,
  mountPublication: mocked.mountPublication,
}));

function DocumentHarness(props: {
  readonly source: PageSource;
  readonly documentOptions?: PageDocumentOptions;
  readonly onStateChange: (state: ImposiaDocumentState) => void;
}) {
  const { hostRef } = useImposiaDocument({
    source: props.source,
    documentOptions: props.documentOptions,
    onStateChange: props.onStateChange,
  });
  return createElement("div", { ref: hostRef });
}

function PublicationHarness(props: {
  readonly snapshot: PublicationSnapshot;
  readonly publicationOptions?: PublicationOptions;
  readonly onStateChange: (state: ImposiaPublicationState) => void;
}) {
  const { hostRef } = useImposiaPublication({
    snapshot: props.snapshot,
    publicationOptions: props.publicationOptions,
    onStateChange: props.onStateChange,
  });
  return createElement("div", { ref: hostRef });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.documentMounts.length = 0;
  mocked.publicationMounts.length = 0;
  mocked.updates.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("useImposiaDocument aborted state", () => {
  // Regression: an options.signal abort of the live run used to be swallowed by the
  // isAbortError guard, leaving the caller stranded in `loading` forever.
  it("transitions to aborted when the caller's options.signal aborts the live run", async () => {
    const states: ImposiaDocumentState[] = [];
    const controller = new AbortController();

    await act(async () => {
      root.render(
        createElement(DocumentHarness, {
          source: { html: "<p>one</p>" },
          documentOptions: { signal: controller.signal },
          onStateChange: (state) => states.push(state),
        }),
      );
    });
    expect(states.at(-1)?.status).toBe("loading");

    await act(async () => {
      controller.abort();
    });

    expect(states.at(-1)?.status).toBe("aborted");
    expect(states.at(-1)?.document).toBeUndefined();
  });

  it("keeps the previously committed document, matching loading and error", async () => {
    const states: ImposiaDocumentState[] = [];
    const committed = { pages: [] } as unknown as PageDocument;

    await act(async () => {
      root.render(
        createElement(DocumentHarness, {
          source: { html: "<p>one</p>" },
          onStateChange: (state) => states.push(state),
        }),
      );
    });
    await act(async () => {
      mocked.documentMounts[0]?.resolve(committed);
    });
    expect(states.at(-1)?.status).toBe("ready");

    // A source change starts an update run; aborting that live run must end in
    // `aborted` while the committed document stays available.
    await act(async () => {
      root.render(
        createElement(DocumentHarness, {
          source: { html: "<p>two</p>" },
          onStateChange: (state) => states.push(state),
        }),
      );
    });
    expect(states.at(-1)?.status).toBe("loading");
    expect(states.at(-1)?.document).toBe(committed);

    await act(async () => {
      mocked.updates[0]?.reject(new DOMException("The operation was aborted.", "AbortError"));
    });

    expect(states.at(-1)?.status).toBe("aborted");
    expect(states.at(-1)?.document).toBe(committed);
  });

  it("stays silent when the abort arrives after unmount", async () => {
    const states: ImposiaDocumentState[] = [];
    const controller = new AbortController();

    await act(async () => {
      root.render(
        createElement(DocumentHarness, {
          source: { html: "<p>one</p>" },
          documentOptions: { signal: controller.signal },
          onStateChange: (state) => states.push(state),
        }),
      );
    });
    await act(async () => {
      root.unmount();
    });
    const settled = states.length;

    await act(async () => {
      controller.abort();
    });

    expect(states.length).toBe(settled);
  });
});

describe("useImposiaPublication aborted state", () => {
  it("transitions to aborted when the caller's options.signal aborts the live run", async () => {
    const states: ImposiaPublicationState[] = [];
    const controller = new AbortController();

    await act(async () => {
      root.render(
        createElement(PublicationHarness, {
          snapshot: {} as unknown as PublicationSnapshot,
          publicationOptions: { signal: controller.signal } as PublicationOptions,
          onStateChange: (state) => states.push(state),
        }),
      );
    });
    expect(states.at(-1)?.status).toBe("loading");

    await act(async () => {
      controller.abort();
    });

    expect(states.at(-1)?.status).toBe("aborted");
    expect(states.at(-1)?.publication).toBeUndefined();
  });

  it("keeps the previously committed publication", async () => {
    const states: ImposiaPublicationState[] = [];
    const committed = { entries: [] } as unknown as PublicationDocument;

    await act(async () => {
      root.render(
        createElement(PublicationHarness, {
          snapshot: {} as unknown as PublicationSnapshot,
          onStateChange: (state) => states.push(state),
        }),
      );
    });
    await act(async () => {
      mocked.publicationMounts[0]?.resolve(committed);
    });
    expect(states.at(-1)?.status).toBe("ready");

    await act(async () => {
      root.render(
        createElement(PublicationHarness, {
          snapshot: { revision: 2 } as unknown as PublicationSnapshot,
          onStateChange: (state) => states.push(state),
        }),
      );
    });
    expect(states.at(-1)?.status).toBe("loading");

    await act(async () => {
      mocked.updates[0]?.reject(new DOMException("The operation was aborted.", "AbortError"));
    });

    expect(states.at(-1)?.status).toBe("aborted");
    expect(states.at(-1)?.publication).toBe(committed);
  });
});
