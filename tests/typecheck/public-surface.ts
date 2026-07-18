import type {
  ExtensionPageWarning,
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
