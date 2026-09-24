// @vitest-environment happy-dom
import type { PublicationOptions, PublicationSnapshot } from "@imposia/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useImposiaPublication } from "../../packages/react/src/use-imposia-publication.js";

const mocked = vi.hoisted(() => {
  const received: unknown[] = [];
  return {
    received,
    mountPublication: (_host: unknown, _snapshot: unknown, options?: unknown): unknown => {
      received.push(options);
      return {
        ready: new Promise(() => {}),
        update: () => new Promise(() => {}),
        destroy: () => Promise.resolve(),
      };
    },
  };
});

// See use-imposia-aborted.test.ts: the hooks resolve "@imposia/client" through
// packages/react/node_modules, so the mock is keyed on the resolved path.
vi.mock("../../packages/client/dist/index.js", () => ({
  mountPageDocument: () => {
    throw new Error("Not used by this test.");
  },
  mountPublication: mocked.mountPublication,
}));

function PublicationHarness(props: {
  readonly snapshot: PublicationSnapshot;
  readonly publicationOptions?: PublicationOptions;
}) {
  const { hostRef } = useImposiaPublication({
    snapshot: props.snapshot,
    publicationOptions: props.publicationOptions,
  });
  return createElement("div", { ref: hostRef });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.received.length = 0;
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

describe("useImposiaPublication options", () => {
  it("forwards pageNumbering and the raised limits to mountPublication unchanged", async () => {
    const snapshot: PublicationSnapshot = {
      metadata: { title: "Invoices", language: "en" },
      entries: [{ id: "inv-1", title: "Invoice 1", html: "<p>One</p>" }],
    };
    await act(async () => {
      root.render(
        createElement(PublicationHarness, {
          snapshot,
          publicationOptions: {
            pageNumbering: "entry",
            limits: { maxInputBytes: 16 * 1024 * 1024 },
          },
        }),
      );
    });

    expect(mocked.received).toHaveLength(1);
    expect(mocked.received[0]).toMatchObject({
      pageNumbering: "entry",
      limits: { maxInputBytes: 16 * 1024 * 1024 },
    });
  });
});
