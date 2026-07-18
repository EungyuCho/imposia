import type { Root } from "postcss";
import { cssReferences, inlineCss, parseCss } from "./page-document-assets-css.js";
import { cssRequests } from "./page-document-assets-css-requests.js";
import {
  rewriteSrcset,
  sameDocumentFragment,
  srcsetCandidates,
} from "./page-document-assets-html.js";
import type { AssetOutcome, AssetRequest } from "./page-document-assets-resolver.js";

export type CssOwner =
  | { readonly element: HTMLElement; readonly inline: boolean }
  | { readonly index: number; readonly inline: false };
export type CssContext = {
  readonly root: Root;
  readonly owner: CssOwner;
  readonly baseUrl: string | undefined;
  readonly depth: number;
};
export type AssetDiscovery = {
  readonly queue: readonly AssetRequest[];
  readonly contexts: readonly CssContext[];
  readonly outputCss: string[];
  readonly blocked: boolean;
};

function htmlElement(element: Element): element is HTMLElement {
  return (
    (element.namespaceURI === null || element.namespaceURI === "http://www.w3.org/1999/xhtml") &&
    element instanceof HTMLElement
  );
}

const DISCOVERY_REMOVED_ELEMENTS = new Set([
  "base",
  "embed",
  "form",
  "frame",
  "iframe",
  "meta",
  "object",
  "portal",
  "script",
]);

function removeUnsupportedContexts(root: ParentNode): void {
  for (const element of [...root.querySelectorAll<Element>("*")]) {
    if (DISCOVERY_REMOVED_ELEMENTS.has(element.localName.toLowerCase())) element.remove();
  }
  for (const template of root.querySelectorAll<HTMLTemplateElement>("template")) {
    removeUnsupportedContexts(template.content);
  }
}

function setOwner(context: CssContext, outputCss: string[]): void {
  if (context.owner.inline) {
    if ("element" in context.owner)
      context.owner.element.setAttribute("style", inlineCss(context.root));
    return;
  }
  if ("element" in context.owner) context.owner.element.textContent = context.root.toString();
  else outputCss[context.owner.index] = context.root.toString();
}

type MakeRequest = (
  kind: AssetRequest["kind"],
  url: string,
  baseUrl: string | undefined,
  depth: number,
  apply: (outcome: AssetOutcome) => readonly AssetRequest[],
) => AssetRequest;

export function discoverPageAssets(
  parsed: Document,
  sourceBaseUrl: string | undefined,
  css: readonly string[],
  makeRequest: MakeRequest,
): AssetDiscovery {
  removeUnsupportedContexts(parsed);
  let queue: AssetRequest[] = [];
  let deferredCss: AssetRequest[] = [];
  const contexts: CssContext[] = [];
  const outputCss = [...css];
  let blocked = false;
  const addContext = (context: CssContext): void => {
    contexts.push(context);
    deferredCss = [
      ...deferredCss,
      ...cssRequests(context, cssReferences(context.root), makeRequest),
    ];
  };
  const contextRequests = (context: CssContext): readonly AssetRequest[] => {
    contexts.push(context);
    return cssRequests(context, cssReferences(context.root), makeRequest);
  };
  const addSrcset = (element: Element, attribute: string, kind: AssetRequest["kind"]): void => {
    const authored = element.getAttribute(attribute);
    if (authored === null) return;
    const candidates = srcsetCandidates(authored);
    const replacements = new Map<number, string | undefined>();
    for (const [index, candidate] of candidates.entries()) {
      queue = [
        ...queue,
        makeRequest(kind, candidate.url, sourceBaseUrl, 0, (outcome) => {
          replacements.set(index, outcome.status === "asset" ? outcome.blobUrl : undefined);
          element.setAttribute(attribute, rewriteSrcset(authored, candidates, replacements));
          return [];
        }),
      ];
    }
  };
  const addAttribute = (element: Element, attribute: string, kind: AssetRequest["kind"]): void => {
    const authored = element.getAttribute(attribute);
    if (authored === null || sameDocumentFragment(authored)) return;
    queue = [
      ...queue,
      makeRequest(kind, authored, sourceBaseUrl, 0, (outcome) => {
        if (outcome.status === "asset") element.setAttribute(attribute, outcome.blobUrl);
        else element.removeAttribute(attribute);
        return [];
      }),
    ];
  };
  for (const element of [...parsed.querySelectorAll<Element>("*")]) {
    const name = element.localName.toLowerCase();
    const svg = element.namespaceURI === "http://www.w3.org/2000/svg";
    if (svg && (name === "image" || name === "feimage")) {
      const attribute = element.hasAttribute("href") ? "href" : "xlink:href";
      const fragment = element.getAttribute(attribute);
      if (fragment !== null && sameDocumentFragment(fragment)) {
        element.setAttribute(attribute, fragment.trim());
        continue;
      }
      addAttribute(element, attribute, "image");
      continue;
    }
    if (svg && (element.hasAttribute("href") || element.hasAttribute("xlink:href"))) {
      const attribute = element.hasAttribute("href") ? "href" : "xlink:href";
      const fragment = element.getAttribute(attribute);
      if (fragment !== null && sameDocumentFragment(fragment))
        element.setAttribute(attribute, fragment.trim());
      continue;
    }
    if (!htmlElement(element)) continue;
    if (name === "img") {
      addAttribute(element, "src", "image");
      addSrcset(element, "srcset", "image");
    }
    if (name === "source") {
      addSrcset(element, "srcset", "image");
      addAttribute(element, "src", "media");
    }
    if (name === "input" && element.getAttribute("type")?.toLowerCase() === "image") {
      addAttribute(element, "src", "image");
    }
    if (name === "audio" || name === "video") {
      addAttribute(element, "src", "media");
      addAttribute(element, "poster", "image");
    }
    if (name === "track") addAttribute(element, "src", "media");
    if (name === "link" && /(?:^|\s)stylesheet(?:\s|$)/i.test(element.getAttribute("rel") ?? "")) {
      const authored = element.getAttribute("href");
      if (authored !== null) {
        queue = [
          ...queue,
          makeRequest("stylesheet", authored, sourceBaseUrl, 0, (outcome) => {
            if (outcome.status !== "stylesheet") {
              element.remove();
              return [];
            }
            const style = parsed.createElement("style");
            element.replaceWith(style);
            return contextRequests({
              root: outcome.root,
              owner: { element: style, inline: false },
              baseUrl: outcome.resolvedUrl ?? sourceBaseUrl,
              depth: 0,
            });
          }),
        ];
      }
    }
    if (name === "style") {
      try {
        addContext({
          root: parseCss(element.textContent ?? "", false),
          owner: { element, inline: false },
          baseUrl: sourceBaseUrl,
          depth: 0,
        });
      } catch (_error: unknown) {
        blocked = true;
        element.textContent = "";
      }
    }
    const inline = element.getAttribute("style");
    if (inline !== null) {
      try {
        addContext({
          root: parseCss(inline, true),
          owner: { element, inline: true },
          baseUrl: sourceBaseUrl,
          depth: 0,
        });
      } catch (_error: unknown) {
        blocked = true;
        element.removeAttribute("style");
      }
    }
  }
  for (const [index, value] of outputCss.entries()) {
    try {
      addContext({
        root: parseCss(value, false),
        owner: { index, inline: false },
        baseUrl: sourceBaseUrl,
        depth: 0,
      });
    } catch (_error: unknown) {
      blocked = true;
      outputCss[index] = "";
    }
  }
  return { queue: [...queue, ...deferredCss], contexts, outputCss, blocked };
}

export { setOwner };
