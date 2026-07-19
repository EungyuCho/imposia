import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
  ImposiaPublicationViewer,
  type ImposiaPublicationViewerHandle,
  type PageViewerOptions,
  type PublicationOptions,
  type PublicationSnapshot,
  type ViewerTheme,
} from "@imposia/react";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";

type Observation = {
  ready: number;
  readyViewerControls: number;
  errors: string[];
  states: string[];
  setSource: ((source: { html: string }) => void) | undefined;
  setTheme: ((theme: ViewerTheme | undefined) => void) | undefined;
  setViewerOptions: ((options: PageViewerOptions) => void) | undefined;
  bumpSourceRevision: (() => void) | undefined;
  bumpDocumentOptionsRevision: (() => void) | undefined;
  unmount: (() => void) | undefined;
  handle: ImposiaPageViewerHandle | undefined;
  retainedHandle: ImposiaPageViewerHandle | undefined;
};

const observation: Observation = {
  ready: 0,
  readyViewerControls: 0,
  errors: [],
  states: [],
  setSource: undefined,
  setTheme: undefined,
  setViewerOptions: undefined,
  bumpSourceRevision: undefined,
  bumpDocumentOptionsRevision: undefined,
  unmount: undefined,
  handle: undefined,
  retainedHandle: undefined,
};
(globalThis as unknown as { imposiaReactObservation: Observation }).imposiaReactObservation =
  observation;

const pageViewerHandle = React.createRef<ImposiaPageViewerHandle>();

type PublicationObservation = {
  readyTitles: string[];
  errors: string[];
  strictEffectMounts: number;
  strictEffectCleanups: number;
  startSlowReplacement: (() => void) | undefined;
  commitFinalReplacement: (() => void) | undefined;
  bumpOptionsRevision: (() => void) | undefined;
  slowResolverStarted: boolean;
  readerReadyGenerations: number[];
  readerReadyStateNavigations: number[];
  deepLinks: Array<string | undefined>;
  handle: ImposiaPublicationViewerHandle | undefined;
};

const publicationObservation: PublicationObservation = {
  readyTitles: [],
  errors: [],
  strictEffectMounts: 0,
  strictEffectCleanups: 0,
  startSlowReplacement: undefined,
  commitFinalReplacement: undefined,
  bumpOptionsRevision: undefined,
  slowResolverStarted: false,
  readerReadyGenerations: [],
  readerReadyStateNavigations: [],
  deepLinks: [],
  handle: undefined,
};
(
  globalThis as unknown as { imposiaPublicationObservation: PublicationObservation }
).imposiaPublicationObservation = publicationObservation;

const publicationHandle = React.createRef<ImposiaPublicationViewerHandle>();
const initialPublication: PublicationSnapshot = {
  metadata: { title: "Initial publication" },
  entries: [{ id: "initial", title: "Initial entry", html: "<h1>Initial publication copy</h1>" }],
};
const slowPublication: PublicationSnapshot = {
  metadata: { title: "Stale slow publication" },
  entries: [
    {
      id: "stale",
      title: "Stale entry",
      baseUrl: "https://fixture.invalid/stale/",
      html: '<h1>Stale publication copy</h1><img src="slow.png" alt="slow">',
    },
  ],
};
const finalPublication: PublicationSnapshot = {
  metadata: { title: "Final publication" },
  entries: [{ id: "final", title: "Final entry", html: "<h1>Final publication copy</h1>" }],
};
const publicationOptions: PublicationOptions = {
  async assetResolver(request) {
    if (request.url.endsWith("/slow.png")) {
      publicationObservation.slowResolverStarted = true;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2_000);
        request.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      });
    }
    return { status: "blocked", reason: "Fixture blocks authored assets." };
  },
};

function PublicationStrictModeProbe({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    publicationObservation.strictEffectMounts += 1;
    return () => {
      publicationObservation.strictEffectCleanups += 1;
    };
  }, []);
  return children;
}

function App() {
  const [source, setSource] = useState({ html: "<h1>React document</h1><p>Initial page</p>" });
  const [sourceRevision, setSourceRevision] = useState(0);
  const [documentOptionsRevision, setDocumentOptionsRevision] = useState(0);
  const [viewerOptions, setViewerOptions] = useState<PageViewerOptions>({});
  const [publicationSnapshot, setPublicationSnapshot] = useState(initialPublication);
  const [publicationOptionsRevision, setPublicationOptionsRevision] = useState(0);
  const [readerInitialDeepLink, setReaderInitialDeepLink] = useState<string>();
  observation.setSource = setSource;
  observation.setTheme = (theme) => setViewerOptions((options) => ({ ...options, theme }));
  observation.setViewerOptions = setViewerOptions;
  observation.bumpSourceRevision = () => setSourceRevision((revision) => revision + 1);
  observation.bumpDocumentOptionsRevision = () =>
    setDocumentOptionsRevision((revision) => revision + 1);
  publicationObservation.startSlowReplacement = () => setPublicationSnapshot(slowPublication);
  publicationObservation.commitFinalReplacement = () => setPublicationSnapshot(finalPublication);
  publicationObservation.bumpOptionsRevision = () =>
    setPublicationOptionsRevision((revision) => revision + 1);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(ImposiaPageViewer, {
      source,
      sourceRevision,
      viewerOptions,
      documentOptions:
        documentOptionsRevision === 0
          ? undefined
          : {
              extensions: [
                {
                  name: "fixture/options-revision",
                  transform: ({ html }) => ({ html: `${html}<p>Options revision applied</p>` }),
                },
              ],
            },
      documentOptionsRevision,
      ref: pageViewerHandle,
      className: "react-adapter-host",
      onReady: () => {
        const handle = pageViewerHandle.current;
        handle?.setSpreadCover(viewerOptions.spread?.cover ?? false);
        handle?.setMode(viewerOptions.mode ?? "continuous");
        observation.readyViewerControls += 1;
        observation.ready += 1;
        observation.handle = handle ?? undefined;
      },
      onError: (error: unknown) => {
        observation.errors.push(error instanceof Error ? error.message : String(error));
      },
      onStateChange: (state: { status: string }) => {
        observation.states.push(state.status);
      },
    }),
    React.createElement(
      PublicationStrictModeProbe,
      null,
      React.createElement(ImposiaPublicationViewer, {
        snapshot: publicationSnapshot,
        publicationOptions,
        publicationOptionsRevision,
        readerOptions: {
          ...(readerInitialDeepLink === undefined
            ? {}
            : { initialDeepLink: readerInitialDeepLink }),
          onDeepLinkChange: (value) => {
            publicationObservation.deepLinks.push(value);
            setReaderInitialDeepLink(value);
          },
        },
        ref: publicationHandle,
        className: "react-publication-host",
        onReady: (publication) => {
          publicationObservation.readyTitles.push(publication.metadata.title);
          publicationObservation.handle = publicationHandle.current ?? undefined;
          const handle = publicationHandle.current;
          const destination = publication.outline[0]?.destination;
          try {
            handle?.openTableOfContents();
            handle?.closeTableOfContents();
            const restored =
              destination === undefined
                ? undefined
                : handle?.restoreDeepLink(`v1.${encodeURIComponent(destination.id)}`);
            if (restored?.generation === publication.generation) {
              publicationObservation.readerReadyGenerations.push(restored.generation);
            }
          } catch (error: unknown) {
            publicationObservation.errors.push(
              error instanceof Error ? error.message : String(error),
            );
          }
        },
        onError: (error: unknown) => {
          publicationObservation.errors.push(
            error instanceof Error ? error.message : String(error),
          );
        },
        onStateChange: (state) => {
          if (
            state.status !== "ready" ||
            publicationObservation.readerReadyStateNavigations.length > 0
          ) {
            return;
          }
          const destination = state.publication.outline[0]?.destination;
          if (destination !== undefined) {
            publicationHandle.current?.navigate(destination);
            publicationObservation.readerReadyStateNavigations.push(destination.generation);
          }
        },
      }),
    ),
  );
}

const app = document.querySelector("#app");
if (app === null) throw new Error("React fixture host is missing.");
const root = createRoot(app);
observation.unmount = () => root.unmount();
root.render(React.createElement(React.StrictMode, null, React.createElement(App)));
