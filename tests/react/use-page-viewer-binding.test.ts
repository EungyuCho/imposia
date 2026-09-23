// @vitest-environment happy-dom
import type { PageDocument, PageViewerOptions, PageViewerState } from "@imposia/client";
import { act, createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePageViewerBinding } from "../../packages/react/src/use-page-viewer-binding.js";

const mocked = vi.hoisted(() => {
  const viewers: Array<{
    state: { generation: number; page: number; mode: string; zoom: number; spreadCover: boolean };
    setZoom(zoom: number): void;
    setMode(mode: string): void;
    setSpreadCover(cover: boolean): void;
    setTheme(theme: unknown): void;
    subscribe(callback: (state: unknown) => void): () => void;
    refresh(document: unknown): void;
    destroy(): void;
  }> = [];
  return {
    viewers,
    mountPageViewer: () => {
      let subscriber: ((state: unknown) => void) | undefined;
      const viewer = {
        state: { generation: 1, page: 1, mode: "continuous", zoom: 1, spreadCover: false },
        setZoom(zoom: number) {
          this.state.zoom = zoom;
          subscriber?.(this.state);
        },
        setMode(mode: string) {
          this.state.mode = mode;
          subscriber?.(this.state);
        },
        setSpreadCover(cover: boolean) {
          this.state.spreadCover = cover;
          subscriber?.(this.state);
        },
        setTheme(_theme: unknown) {},
        subscribe(callback: (state: unknown) => void) {
          subscriber = callback;
          return () => {
            subscriber = undefined;
          };
        },
        refresh(_document: unknown) {},
        destroy() {},
      };
      viewers.push(viewer);
      return viewer;
    },
  };
});

vi.mock("../../packages/client/dist/index.js", () => ({
  mountPageViewer: mocked.mountPageViewer,
  validatePageViewerOptions: () => {},
}));

const iframe = document.createElement("iframe");
const pageDocument = { iframe, generation: 1 } as PageDocument;
let container: HTMLDivElement;
let root: Root;

function Harness() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [, setRevision] = useState(0);
  usePageViewerBinding(
    hostRef,
    pageDocument,
    { controls: true },
    undefined,
    (_state: PageViewerState) => {
      setRevision((revision) => revision + 1);
    },
  );
  return createElement("div", { ref: hostRef });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.viewers.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("preserves user zoom, mode, and spread cover after a callback rerender with inline options", async () => {
  await act(async () => root.render(createElement(Harness)));
  const viewer = mocked.viewers[0];
  expect(viewer).toBeDefined();
  await act(async () => {
    viewer?.setZoom(1.1);
    viewer?.setMode("spread");
    viewer?.setSpreadCover(true);
  });

  expect(mocked.viewers).toHaveLength(1);
  expect(viewer?.state).toMatchObject({ zoom: 1.1, mode: "spread", spreadCover: true });
});

function OptionsHarness(props: { readonly options: PageViewerOptions }) {
  const hostRef = useRef<HTMLDivElement>(null);
  usePageViewerBinding(hostRef, pageDocument, props.options, undefined);
  return createElement("div", { ref: hostRef });
}

it("applies changed layout options and restores defaults when an option is dropped", async () => {
  await act(async () =>
    root.render(
      createElement(OptionsHarness, {
        options: { zoom: 2, mode: "spread", spread: { cover: true } },
      }),
    ),
  );
  const viewer = mocked.viewers[0];
  await act(async () => {
    viewer?.setZoom(2);
    viewer?.setMode("spread");
    viewer?.setSpreadCover(true);
  });

  await act(async () =>
    root.render(createElement(OptionsHarness, { options: { zoom: 1.5, mode: "spread" } })),
  );
  expect(viewer?.state).toMatchObject({ zoom: 1.5, mode: "spread", spreadCover: false });

  await act(async () => root.render(createElement(OptionsHarness, { options: {} })));
  expect(mocked.viewers).toHaveLength(1);
  expect(viewer?.state).toMatchObject({ zoom: 1, mode: "continuous", spreadCover: false });
});
