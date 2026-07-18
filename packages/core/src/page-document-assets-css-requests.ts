import type { Root } from "postcss";
import { type CssReference, cssReferences, replaceCssRange } from "./page-document-assets-css.js";
import type { AssetOutcome, AssetRequest } from "./page-document-assets-resolver.js";

function cssCurrentText(reference: CssReference): string {
  return reference.node.type === "decl" ? reference.node.value : reference.node.params;
}

function replaceCssUrl(reference: CssReference, value: string): void {
  const current = cssCurrentText(reference);
  const start = current.indexOf(reference.token.url, reference.token.start);
  if (start < 0) return;
  let rangeStart = start;
  let rangeEnd = start + reference.token.url.length;
  const quote = current[rangeStart - 1];
  if ((quote === "'" || quote === '"') && current[rangeEnd] === quote) {
    rangeStart -= 1;
    rangeEnd += 1;
  }
  const token = {
    ...reference.token,
    start: rangeStart,
    end: rangeEnd,
    url: current.slice(rangeStart, rangeEnd),
  };
  const replacement = replaceCssRange(current, token, value);
  if (reference.node.type === "decl") reference.node.value = replacement;
  else reference.node.params = replacement;
}

function removeCssReference(reference: CssReference): void {
  reference.node.remove();
}

export function cssRequests(
  context: {
    readonly root: Root;
    readonly owner:
      | { readonly element: HTMLElement; readonly inline: boolean }
      | { readonly index: number; readonly inline: false };
    readonly baseUrl: string | undefined;
    readonly depth: number;
  },
  references: readonly CssReference[],
  makeRequest: (
    kind: AssetRequest["kind"],
    url: string,
    baseUrl: string | undefined,
    depth: number,
    apply: (outcome: AssetOutcome) => readonly AssetRequest[],
  ) => AssetRequest,
): readonly AssetRequest[] {
  return references.map((reference) =>
    makeRequest(
      reference.kind,
      reference.token.url,
      context.baseUrl,
      context.depth + (reference.importRule ? 1 : 0),
      (outcome) => {
        if (outcome.status === "blocked") {
          removeCssReference(reference);
          return [];
        }
        if (reference.importRule) {
          if (outcome.status !== "stylesheet") {
            removeCssReference(reference);
            return [];
          }
          const importedReferences = cssReferences(outcome.root);
          const importedNodes = [...outcome.root.nodes];
          reference.node.replaceWith(...importedNodes);
          return cssRequests(
            {
              root: context.root,
              owner: context.owner,
              baseUrl: outcome.resolvedUrl ?? context.baseUrl,
              depth: context.depth + 2,
            },
            importedReferences,
            makeRequest,
          );
        }
        if (outcome.status !== "asset") {
          removeCssReference(reference);
          return [];
        }
        replaceCssUrl(reference, outcome.blobUrl);
        return [];
      },
    ),
  );
}
