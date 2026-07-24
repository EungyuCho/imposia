import * as React from "react";
import type {
  EpubExportOptions,
  ExtensionPageWarning,
  PageComposeOptions,
  PageComposeProgress,
  PageDocument,
  PageExtension,
  PageExtensionContext,
  PageExtensionFinalizePageInput,
  PageExtensionPage,
  PageExtensionTableFragment,
  PageViewerController,
  PageViewerMode,
  PageViewerOptions,
  PageViewerState,
  PageWarning,
  PageWarningLocation,
  PageWarningTargetBounds,
  PublicationDestination,
  PublicationExtension,
  PublicationReaderController,
  PublicationReaderOptions,
  PublicationReaderState,
  PublicationSearchResult,
  PublicationSnapshot,
  PublicationThumbnail,
  TableColgroupExtensionOptions,
  ViewerInspectorController,
  ViewerInspectorState,
  ViewerTheme,
} from "../../packages/client/src/index.js";
import {
  createTableColgroupExtension,
  mountPublication,
  pageWarningTargetBounds,
  restorePublicationDeepLink,
  serializePublicationDeepLink,
  validatePageViewerOptions,
} from "../../packages/client/src/index.js";
import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
  ImposiaPublicationViewer,
  type ImposiaPublicationViewerHandle,
  type PageExtension as ReactPageExtension,
  type PageExtensionFinalizePageInput as ReactPageExtensionFinalizePageInput,
  useImposiaPublication,
} from "../../packages/react/src/index.js";

const composeOptions: PageComposeOptions = {
  yieldBudgetMs: 8,
  scheduler: async () => undefined,
};
const progress: PageComposeProgress = {
  completedPages: 1,
  pass: 1,
  provisional: true,
};
void composeOptions;
void progress;

const extension = {
  name: "example/running-head",
  transform(input: { readonly html: string }, context: PageExtensionContext) {
    context.warn({ code: "EXTENSION_EXAMPLE", message: "Example warning." });
    return { html: input.html };
  },
  decoratePage(page: PageExtensionPage) {
    return page.blank || page.number !== page.totalPages
      ? undefined
      : { footerHtml: "Final page {{pageNumber}} / {{totalPages}}" };
  },
} satisfies PageExtension;

const reactExtension: ReactPageExtension = extension;
const tableColgroupOptions: TableColgroupExtensionOptions = {};
const tableColgroupExtension = createTableColgroupExtension(tableColgroupOptions);
declare const finalizeInput: PageExtensionFinalizePageInput;
declare const reactFinalizeInput: ReactPageExtensionFinalizePageInput;
declare const tableFragment: PageExtensionTableFragment;
void tableColgroupExtension;
void finalizeInput;
void reactFinalizeInput;
void tableFragment;
const warningLocation: PageWarningLocation = {
  generation: 1,
  entryId: undefined,
  page: undefined,
};
const warning: ExtensionPageWarning = {
  code: "EXTENSION_EXAMPLE",
  message: "Example warning.",
  sourceIdentity: undefined,
  location: warningLocation,
  extension: reactExtension.name,
};

void warning;

const publicationExtension = {
  name: "example/entry-policy",
  transformEntry(input, context) {
    context.onCleanup(() => undefined);
    if (input.entry.id === "appendix") {
      context.warn({ code: "EXTENSION_APPENDIX", message: "Appendix policy applied." });
    }
    return { html: `${input.html}<p>${input.publication.title}</p>` };
  },
} satisfies PublicationExtension;

void publicationExtension;

const viewerTheme = {
  "--imposia-viewer-color-accent": "#8b6cff",
  "--imposia-viewer-control-size": "44px",
} satisfies ViewerTheme;
const pageViewerMode: PageViewerMode = "spread";
const viewerOptions = {
  mode: pageViewerMode,
  spread: { cover: true },
  theme: viewerTheme,
  inspector: true,
} satisfies PageViewerOptions;
const headlessViewerOptions = {
  controls: false,
  mode: "single",
  zoom: 1.2,
} satisfies PageViewerOptions;
void headlessViewerOptions;
declare const pageViewerController: PageViewerController;
const unsubscribeViewerState = pageViewerController.subscribe((state) => {
  void state.effectiveMode;
});
unsubscribeViewerState();

declare const inspector: ViewerInspectorController;
const inspectorState: ViewerInspectorState = inspector.state;
inspector.open();
inspector.close();
inspector.toggle();
const inspectorWarnings: readonly PageWarning[] = inspector.state.warnings;
if (inspectorWarnings[0] !== undefined) inspector.select(inspectorWarnings[0]);
void inspectorState;

type RuntimeEpubExport = (options: EpubExportOptions) => Promise<Blob>;

declare const committedPageDocument: PageDocument;
validatePageViewerOptions(committedPageDocument, viewerOptions);
const warningTargetBounds: PageWarningTargetBounds | undefined = pageWarningTargetBounds(
  committedPageDocument,
  warning,
);
void warningTargetBounds;
const exportCandidate = Reflect.get(committedPageDocument, "exportEpub");
if (typeof exportCandidate === "function") {
  const exportEpub = exportCandidate as RuntimeEpubExport;
  void exportEpub.call(committedPageDocument, {
    metadata: {
      title: "Typecheck fixture",
      language: "en",
      identifier: "urn:imposia:typecheck",
      modified: "2026-07-18T00:00:00Z",
    },
  });
}

const reactHandle = React.createRef<ImposiaPageViewerHandle>();
const reactElement = React.createElement(ImposiaPageViewer, {
  source: { html: "<p>React handle typecheck</p>" },
  sourceRevision: 2,
  documentOptionsRevision: 3,
  viewerOptions,
  onViewerStateChange(state: PageViewerState) {
    void state.page;
  },
  ref: reactHandle,
});
const runtimeHandleCandidate = Reflect.get(reactHandle, "current");
if (runtimeHandleCandidate !== null && typeof runtimeHandleCandidate === "object") {
  const currentCandidate = Reflect.get(runtimeHandleCandidate, "current");
  const printCandidate = Reflect.get(runtimeHandleCandidate, "print");
  const exportCandidate = Reflect.get(runtimeHandleCandidate, "exportEpub");
  if (currentCandidate !== undefined && typeof printCandidate === "function") {
    void (printCandidate as ImposiaPageViewerHandle["print"]).call(runtimeHandleCandidate);
  }
  if (typeof exportCandidate === "function") {
    void (exportCandidate as ImposiaPageViewerHandle["exportEpub"]).call(runtimeHandleCandidate, {
      metadata: {
        title: "React handle typecheck",
        language: "en",
        identifier: "urn:imposia:react-handle-typecheck",
      },
    });
  }
  (runtimeHandleCandidate as ImposiaPageViewerHandle).setMode("spread");
  (runtimeHandleCandidate as ImposiaPageViewerHandle).goToPage(2);
  (runtimeHandleCandidate as ImposiaPageViewerHandle).nextPage();
  (runtimeHandleCandidate as ImposiaPageViewerHandle).previousPage();
  (runtimeHandleCandidate as ImposiaPageViewerHandle).setZoom(1.2);
  (runtimeHandleCandidate as ImposiaPageViewerHandle).setSpreadCover(true);
  const viewerState: PageViewerState | undefined = (
    runtimeHandleCandidate as ImposiaPageViewerHandle
  ).viewerState;
  void viewerState;
  (runtimeHandleCandidate as ImposiaPageViewerHandle).openInspector();
  (runtimeHandleCandidate as ImposiaPageViewerHandle).closeInspector();
  (runtimeHandleCandidate as ImposiaPageViewerHandle).toggleInspector();
  if (currentCandidate !== undefined) {
    const pageDocument = currentCandidate as PageDocument;
    if (pageDocument.warnings[0] !== undefined) {
      (runtimeHandleCandidate as ImposiaPageViewerHandle).selectWarning(pageDocument.warnings[0]);
    }
  }
}
void reactElement;

const publicationSnapshot = {
  metadata: { title: "Typecheck publication", language: "en" },
  entries: [{ id: "entry", title: "Entry", html: "<h1>Typecheck Publication</h1>" }],
} satisfies PublicationSnapshot;
const publicationController = mountPublication(document.createElement("div"), publicationSnapshot);
void publicationController.ready.then((publication) => {
  const destination: PublicationDestination | undefined = publication.outline[0]?.destination;
  if (destination !== undefined) {
    publicationController.navigate(destination);
    const deepLink = serializePublicationDeepLink(destination);
    const restored: PublicationDestination | undefined = restorePublicationDeepLink(
      deepLink,
      publicationController,
    );
    void restored;
  }
  const searchResults: readonly PublicationSearchResult[] =
    publicationController.search("Typecheck");
  void searchResults;
});

const readerOptions = {
  controller: publicationController,
  initialDeepLink: "v1.imposia-entry-entry",
  onDeepLinkChange(value: string | undefined) {
    void value;
  },
} satisfies PublicationReaderOptions;
declare const publicationReader: PublicationReaderController;
const publicationReaderState: PublicationReaderState = publicationReader.state;
publicationReader.openTableOfContents();
publicationReader.closeTableOfContents();
publicationReader.toggleTableOfContents();
publicationReader.openThumbnails();
publicationReader.closeThumbnails();
publicationReader.toggleThumbnails();
const readerThumbnails: readonly PublicationThumbnail[] = publicationReader.state.thumbnails;
if (readerThumbnails[0] !== undefined) publicationReader.selectThumbnail(readerThumbnails[0]);
publicationReader.restoreDeepLink(readerOptions.initialDeepLink);
publicationReader.openSearch();
publicationReader.closeSearch();
publicationReader.toggleSearch();
const readerSearchResults: readonly PublicationSearchResult[] = publicationReader.search("Entry");
publicationReader.nextSearchResult();
publicationReader.previousSearchResult();
if (readerSearchResults[0] !== undefined) {
  publicationReader.selectSearchResult(readerSearchResults[0]);
}
void publicationReaderState;

const publicationHandle = React.createRef<ImposiaPublicationViewerHandle>();
const publicationElement = React.createElement(ImposiaPublicationViewer, {
  snapshot: publicationSnapshot,
  snapshotRevision: 1,
  publicationOptionsRevision: 1,
  readerOptions: { initialDeepLink: readerOptions.initialDeepLink },
  ref: publicationHandle,
});
publicationHandle.current?.openTableOfContents();
publicationHandle.current?.closeTableOfContents();
publicationHandle.current?.toggleTableOfContents();
publicationHandle.current?.openThumbnails();
publicationHandle.current?.closeThumbnails();
publicationHandle.current?.toggleThumbnails();
const reactThumbnails: readonly PublicationThumbnail[] =
  publicationHandle.current?.getThumbnails() ?? [];
if (reactThumbnails[0] !== undefined)
  publicationHandle.current?.selectThumbnail(reactThumbnails[0]);
publicationHandle.current?.restoreDeepLink(readerOptions.initialDeepLink);
publicationHandle.current?.openSearch();
publicationHandle.current?.closeSearch();
publicationHandle.current?.toggleSearch();
const reactSearchResults = publicationHandle.current?.search("Entry");
publicationHandle.current?.nextSearchResult();
publicationHandle.current?.previousSearchResult();
if (reactSearchResults?.[0] !== undefined) {
  publicationHandle.current?.selectSearchResult(reactSearchResults[0]);
}
publicationHandle.current?.setMode("spread");
publicationHandle.current?.setSpreadCover(true);
publicationHandle.current?.openInspector();
publicationHandle.current?.closeInspector();
publicationHandle.current?.toggleInspector();
const publicationWarning = publicationHandle.current?.current?.warnings[0];
if (publicationWarning !== undefined) publicationHandle.current?.selectWarning(publicationWarning);
const publicationHook: typeof useImposiaPublication = useImposiaPublication;
void publicationElement;
void publicationHook;
