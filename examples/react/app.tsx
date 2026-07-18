import { ImposiaPageViewer } from "@imposia/react";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";

type Observation = {
  ready: number;
  errors: string[];
  states: string[];
  setSource: ((source: { html: string }) => void) | undefined;
  unmount: (() => void) | undefined;
};

const observation: Observation = {
  ready: 0,
  errors: [],
  states: [],
  setSource: undefined,
  unmount: undefined,
};
globalThis.imposiaReactObservation = observation;

function App() {
  const [source, setSource] = useState({ html: "<h1>React document</h1><p>Initial page</p>" });
  observation.setSource = setSource;
  return React.createElement(ImposiaPageViewer, {
    source,
    className: "react-adapter-host",
    onReady: () => {
      observation.ready += 1;
    },
    onError: (error) => {
      observation.errors.push(error instanceof Error ? error.message : String(error));
    },
    onStateChange: (state) => {
      observation.states.push(state.status);
    },
  });
}

const app = document.querySelector("#app");
if (app === null) throw new Error("React fixture host is missing.");
const root = createRoot(app);
observation.unmount = () => root.unmount();
root.render(React.createElement(App));
