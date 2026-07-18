import { ImposiaPageViewer, type ImposiaPageViewerHandle } from "@imposia/react";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";

type Observation = {
  ready: number;
  errors: string[];
  states: string[];
  setSource: ((source: { html: string }) => void) | undefined;
  unmount: (() => void) | undefined;
  handle: ImposiaPageViewerHandle | undefined;
  retainedHandle: ImposiaPageViewerHandle | undefined;
};

const observation: Observation = {
  ready: 0,
  errors: [],
  states: [],
  setSource: undefined,
  unmount: undefined,
  handle: undefined,
  retainedHandle: undefined,
};
(globalThis as unknown as { imposiaReactObservation: Observation }).imposiaReactObservation =
  observation;

const pageViewerHandle = React.createRef<ImposiaPageViewerHandle>();

function App() {
  const [source, setSource] = useState({ html: "<h1>React document</h1><p>Initial page</p>" });
  observation.setSource = setSource;
  return React.createElement(ImposiaPageViewer, {
    source,
    ref: pageViewerHandle,
    className: "react-adapter-host",
    onReady: () => {
      observation.ready += 1;
      observation.handle = pageViewerHandle.current ?? undefined;
    },
    onError: (error: unknown) => {
      observation.errors.push(error instanceof Error ? error.message : String(error));
    },
    onStateChange: (state: { status: string }) => {
      observation.states.push(state.status);
    },
  });
}

const app = document.querySelector("#app");
if (app === null) throw new Error("React fixture host is missing.");
const root = createRoot(app);
observation.unmount = () => root.unmount();
root.render(React.createElement(App));
