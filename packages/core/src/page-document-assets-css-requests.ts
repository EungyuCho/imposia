import postcss, { type Root } from "postcss";
import {
  type CssReference,
  cssReferences,
  functionQualifier,
  replaceCssRange,
} from "./page-document-assets-css.js";
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

export function stylesheetBaseUrl(url: string, baseUrl: string | undefined): string | undefined {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return baseUrl;
  }
}

function importConditions(reference: CssReference): string | undefined {
  if (reference.node.type !== "atrule") return undefined;
  const params = reference.node.params;
  let tail = params.slice(reference.token.end).trimStart();
  const quote = params[reference.token.start - 1];
  if ((quote === "'" || quote === '"') && tail.startsWith(quote)) {
    tail = tail.slice(1).trimStart();
  }
  if (/\burl\s*\(/i.test(params.slice(0, reference.token.start)) && tail.startsWith(")")) {
    tail = tail.slice(1).trimStart();
  }
  return tail.trim();
}

function conditionedImport(
  reference: CssReference,
  importedNodes: Root["nodes"],
): Root["nodes"] | undefined {
  let conditions = importConditions(reference);
  if (conditions === undefined) return undefined;
  let layer: string | undefined;
  let supports: string | undefined;
  if (/^layer(?=\s|\(|$)/i.test(conditions)) {
    if (/^layer\(/i.test(conditions)) {
      const qualifier = functionQualifier(conditions, "layer");
      if (qualifier === undefined) return undefined;
      layer = qualifier.value;
      conditions = qualifier.rest;
    } else {
      layer = "";
      conditions = conditions.slice("layer".length).trimStart();
    }
  }
  // `supports(` is one function token. `supports (…)` is a media query, as in browsers.
  if (/^supports\(/i.test(conditions)) {
    const qualifier = functionQualifier(conditions, "supports");
    if (qualifier === undefined) return undefined;
    supports = qualifier.value;
    conditions = qualifier.rest;
  }
  let nodes = importedNodes;
  if (conditions !== "") {
    const media = postcss.atRule({ name: "media", params: conditions });
    media.append(...nodes);
    nodes = [media];
  }
  if (supports !== undefined) {
    const params = /^(?:\(|selector\s*\(|font-tech\s*\(|font-format\s*\()/i.test(supports)
      ? supports
      : `(${supports})`;
    const rule = postcss.atRule({ name: "supports", params });
    rule.append(...nodes);
    nodes = [rule];
  }
  if (layer !== undefined) {
    const rule = postcss.atRule({ name: "layer", params: layer });
    rule.append(...nodes);
    nodes = [rule];
  }
  return nodes;
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
          const conditionedNodes = conditionedImport(reference, importedNodes);
          if (conditionedNodes === undefined) {
            removeCssReference(reference);
            return [];
          }
          reference.node.replaceWith(...conditionedNodes);
          return cssRequests(
            {
              root: context.root,
              owner: context.owner,
              baseUrl:
                outcome.resolvedUrl ?? stylesheetBaseUrl(reference.token.url, context.baseUrl),
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
