import { describe, expect, it } from "vitest";
import { cssReferences, parseCss } from "../../packages/core/src/page-document-assets-css.js";
import { cssRequests } from "../../packages/core/src/page-document-assets-css-requests.js";
import type {
  AssetOutcome,
  AssetRequest,
} from "../../packages/core/src/page-document-assets-resolver.js";

function makeRequest(
  kind: AssetRequest["kind"],
  url: string,
  baseUrl: string | undefined,
  depth: number,
  apply: AssetRequest["apply"],
): AssetRequest {
  return { kind, url, baseUrl, depth, sourceIdentity: url, apply };
}

function stylesheet(css: string): AssetOutcome {
  return {
    status: "stylesheet",
    root: parseCss(css, false),
    bytes: new TextEncoder().encode(css),
    mimeType: "text/css",
  };
}

describe("external CSS requests", () => {
  it.each(['@import "styles/print.css" print;', '@import url( "styles/print.css" ) print;'])(
    "keeps print scoped and bases nested URLs for %s",
    (source) => {
      const root = parseCss(source, false);
      const requests = cssRequests(
        {
          root,
          owner: { index: 0, inline: false },
          baseUrl: "https://example.test/book/",
          depth: 0,
        },
        cssReferences(root),
        makeRequest,
      );
      const nested = requests[0]?.apply(stylesheet('.print{background:url("images/paper.png")}'));

      expect(root.toString()).toContain("@media print");
      expect(root.toString()).toContain(".print");
      expect(nested).toHaveLength(1);
      expect(nested?.[0]).toMatchObject({
        kind: "image",
        url: "images/paper.png",
        baseUrl: "https://example.test/book/styles/print.css",
      });
    },
  );

  it("preserves layer and supports qualifiers around imported rules", () => {
    const root = parseCss(
      '@import "styles/theme.css" layer(theme) supports(display: grid) print;',
      false,
    );
    const requests = cssRequests(
      { root, owner: { index: 0, inline: false }, baseUrl: "https://example.test/book/", depth: 0 },
      cssReferences(root),
      makeRequest,
    );
    requests[0]?.apply(stylesheet(".theme{color:red}"));
    expect(root.toString()).toContain("@layer theme{@supports (display: grid){@media print{");
  });

  it("reads `supports (…)` with a space as a media query, as browsers do", () => {
    const root = parseCss('@import "styles/theme.css" supports (display: grid);', false);
    const requests = cssRequests(
      { root, owner: { index: 0, inline: false }, baseUrl: "https://example.test/book/", depth: 0 },
      cssReferences(root),
      makeRequest,
    );
    requests[0]?.apply(stylesheet(".theme{color:red}"));
    expect(root.toString()).toBe("@media supports (display: grid){.theme{color:red}}");
  });
});
