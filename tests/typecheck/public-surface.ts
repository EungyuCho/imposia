import * as React from "react";
import type {
  EpubExportOptions,
  ExtensionPageWarning,
  PageDocument,
  PageExtension,
  PageExtensionContext,
} from "../../packages/client/src/index.js";
import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
  type PageExtension as ReactPageExtension,
} from "../../packages/react/src/index.js";

const extension = {
  name: "example/running-head",
  transform(input: { readonly html: string }, context: PageExtensionContext) {
    context.warn({ code: "EXTENSION_EXAMPLE", message: "Example warning." });
    return { html: input.html };
  },
  decoratePage(page: { readonly blank: boolean }) {
    return page.blank ? undefined : { headerHtml: "Page {{pageNumber}}" };
  },
} satisfies PageExtension;

const reactExtension: ReactPageExtension = extension;
const warning: ExtensionPageWarning = {
  code: "EXTENSION_EXAMPLE",
  message: "Example warning.",
  sourceIdentity: undefined,
  extension: reactExtension.name,
};

void warning;

type RuntimeEpubExport = (options: EpubExportOptions) => Promise<Blob>;

declare const committedPageDocument: PageDocument;
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
}
void reactElement;
