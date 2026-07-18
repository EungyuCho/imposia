import type {
  ExtensionPageWarning,
  PageDocument,
  PageExtension,
  PageExtensionContext,
} from "../../packages/client/src/index.js";
import type { PageExtension as ReactPageExtension } from "../../packages/react/src/index.js";

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

type RuntimeEpubExport = (options: {
  metadata: { title: string; language: string; identifier: string; modified?: string };
}) => Promise<Blob>;

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
