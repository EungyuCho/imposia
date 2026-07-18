import type { Root } from "postcss";
import { ImposiaError } from "./errors.js";
import { cssReferences, inlineCss, parseCss } from "./page-document-assets-css.js";
import { cssRequests } from "./page-document-assets-css-requests.js";
import {
  rewriteSrcset,
  sameDocumentFragment,
  srcsetCandidates,
} from "./page-document-assets-html.js";
import {
  type AssetOutcome,
  type AssetRequest,
  type BlobScope,
  resolveOne,
  unsafeAuthoredUrl,
} from "./page-document-assets-resolver.js";
import { abortError } from "./page-document-frame.js";
import type { AssetResolver, PageLimits } from "./page-document-types.js";

type CssOwner =
  | { readonly element: HTMLElement; readonly inline: boolean }
  | { readonly index: number; readonly inline: false };
type CssContext = {
  readonly root: Root;
  readonly owner: CssOwner;
  readonly baseUrl: string | undefined;
  readonly depth: number;
};

export type ResolvedPageAssets = {
  readonly html: string;
  readonly css: readonly string[];
  readonly blobUrls: readonly string[];
  readonly resourceBlocked: boolean;
  readonly sourceIdentity: string | undefined;
  revoke(): void;
};

function htmlElement(element: Element): element is HTMLElement {
  return (
    (element.namespaceURI === null || element.namespaceURI === "http://www.w3.org/1999/xhtml") &&
    element instanceof HTMLElement
  );
}

function blockedScheme(value: string): boolean {
  return unsafeAuthoredUrl(value) || value.trim() === "";
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

export async function resolvePageAssets(
  html: string,
  sourceBaseUrl: string | undefined,
  css: readonly string[],
  resolver: AssetResolver,
  limits: PageLimits | undefined,
  signal: AbortSignal,
): Promise<ResolvedPageAssets> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  removeUnsupportedContexts(parsed);
  const operation = new AbortController();
  const abortOperation = () => operation.abort();
  if (signal.aborted) abortOperation();
  else signal.addEventListener("abort", abortOperation, { once: true });
  let revoked = false;
  const scope: BlobScope = {
    urls: new Set<string>(),
    get revoked() {
      return revoked;
    },
    revoke() {
      if (revoked) return;
      revoked = true;
      for (const url of this.urls) URL.revokeObjectURL(url);
      this.urls.clear();
    },
  };
  let blocked = false;
  let blockedIdentity: string | undefined;
  let identity = 0;
  let assetBytes = 0;
  let queue: readonly AssetRequest[] = [];
  let deferredCss: readonly AssetRequest[] = [];
  const contexts: CssContext[] = [];
  const outputCss = [...css];
  const makeRequest = (
    kind: AssetRequest["kind"],
    url: string,
    baseUrl: string | undefined,
    depth: number,
    apply: (outcome: AssetOutcome) => readonly AssetRequest[],
  ): AssetRequest => {
    const sourceIdentity = `resource-${identity}`;
    identity += 1;
    return { kind, url, baseUrl, sourceIdentity, depth, apply };
  };
  const markBlocked = (request: AssetRequest): AssetOutcome => {
    blocked = true;
    blockedIdentity ??= request.sourceIdentity;
    return { status: "blocked" };
  };
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
  const elements = [...parsed.querySelectorAll<Element>("*")];
  for (const element of elements) {
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
            const context: CssContext = {
              root: outcome.root,
              owner: { element: style, inline: false },
              baseUrl: outcome.resolvedUrl ?? sourceBaseUrl,
              depth: 0,
            };
            return contextRequests(context);
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
  queue = [...queue, ...deferredCss];
  try {
    while (queue.length > 0) {
      if (operation.signal.aborted) throw abortError();
      const level = queue;
      queue = [];
      const outcomes: AssetOutcome[] = [];
      for (let start = 0; start < level.length; start += 8) {
        const batch = level.slice(start, start + 8);
        outcomes.push(
          ...(await Promise.all(
            batch.map((request) => {
              const max = limits?.maxAssetReferences;
              const requestIndex = Number(request.sourceIdentity.slice("resource-".length));
              if (max !== undefined && requestIndex >= max) {
                return Promise.reject(
                  new ImposiaError("ASSET_REFERENCE_LIMIT", "Asset reference limit exceeded."),
                );
              }
              const maxDepth = limits?.maxAssetDepth;
              if (maxDepth !== undefined && request.depth >= maxDepth) {
                return Promise.reject(
                  new ImposiaError("ASSET_DEPTH_LIMIT", "Asset depth limit exceeded."),
                );
              }
              if (blockedScheme(request.url)) {
                return Promise.resolve(markBlocked(request));
              }
              return resolveOne(request, resolver, operation.signal, scope, (bytes) => {
                const maxBytes = limits?.maxAssetBytes;
                if (maxBytes !== undefined && assetBytes + bytes > maxBytes) {
                  throw new ImposiaError("ASSET_BYTES_LIMIT", "Asset byte limit exceeded.");
                }
                assetBytes += bytes;
              }).catch((error: unknown) => {
                if (operation.signal.aborted) throw abortError();
                throw error;
              });
            }),
          )),
        );
      }
      const next: AssetRequest[] = [];
      for (const [index, request] of level.entries()) {
        const outcome = outcomes[index];
        if (outcome === undefined) continue;
        if (outcome.status === "blocked") markBlocked(request);
        next.push(...request.apply(outcome));
      }
      queue = next;
    }
    for (const context of contexts) setOwner(context, outputCss);
    return {
      html: parsed.documentElement.outerHTML,
      css: Object.freeze(outputCss),
      blobUrls: Object.freeze([...scope.urls]),
      resourceBlocked: blocked,
      sourceIdentity: blockedIdentity,
      revoke: () => scope.revoke(),
    };
  } catch (error: unknown) {
    operation.abort();
    scope.revoke();
    throw error;
  } finally {
    signal.removeEventListener("abort", abortOperation);
  }
}
