import { describe, expect, it } from "vitest";
import { cssReferences, parseCss } from "../../packages/core/src/page-document-assets-css.js";

function fontUrls(css: string): readonly string[] {
  return cssReferences(parseCss(css, false))
    .filter((reference) => reference.kind === "font")
    .map((reference) => reference.token.url);
}

describe("@font-face src negotiation", () => {
  it("requests only the woff2 candidate from a woff2/woff pair", () => {
    const urls = fontUrls(`
      @font-face {
        font-family: "Toss Product Sans";
        src: url("/tps/bold/107.woff2") format("woff2"),
             url("/tps/bold/107.woff") format("woff");
      }
    `);

    expect(urls).toEqual(["/tps/bold/107.woff2"]);
  });

  it("keeps the whole list when no candidate declares woff2", () => {
    const urls = fontUrls(`
      @font-face {
        font-family: "Legacy";
        src: url("/legacy.ttf") format("truetype"), url("/legacy.otf") format("opentype");
      }
    `);

    expect(urls).toEqual(["/legacy.ttf", "/legacy.otf"]);
  });

  it("leaves a single-candidate list untouched", () => {
    expect(fontUrls('@font-face { src: url("/only.woff") format("woff"); }')).toEqual([
      "/only.woff",
    ]);
    expect(fontUrls('@font-face { src: url("/only.woff2") format("woff2"); }')).toEqual([
      "/only.woff2",
    ]);
  });

  it("still drops local() before choosing", () => {
    const urls = fontUrls(`
      @font-face {
        src: local("Toss Product Sans"), url("/a.woff2") format("woff2"), url("/a.woff") format("woff");
      }
    `);

    expect(urls).toEqual(["/a.woff2"]);
  });

  // A comma inside format() must not split the list, or the chosen candidate would be a
  // fragment and its url() would resolve against nothing.
  it("does not split on commas nested inside functions or quotes", () => {
    const urls = fontUrls(`
      @font-face {
        src: url("/weird,name.woff2") format("woff2"), url("/weird,name.woff") format("woff");
      }
    `);

    expect(urls).toEqual(["/weird,name.woff2"]);
  });

  // "Every supported browser reads woff2" does not extend to tech(): a candidate gated on
  // a font technology can strand the face where that technology is missing, so it must
  // never be the one the list collapses to.
  it("skips tech() candidates and picks the plain woff2 one", () => {
    const urls = fontUrls(`
      @font-face {
        src: url("/colr.woff2") format("woff2") tech(color-COLRv1),
             url("/plain.woff2") format("woff2"),
             url("/plain.woff") format("woff");
      }
    `);

    expect(urls).toEqual(["/plain.woff2"]);
  });

  it("keeps the whole list when every woff2 candidate carries tech()", () => {
    const urls = fontUrls(`
      @font-face {
        src: url("/colr.woff2") format("woff2") tech(color-COLRv1),
             url("/fallback.woff") format("woff");
      }
    `);

    expect(urls).toEqual(["/colr.woff2", "/fallback.woff"]);
  });

  it("does not touch non-font declarations that carry several urls", () => {
    const references = cssReferences(
      parseCss('.a { background: url("/one.png"), url("/two.png"); }', false),
    );

    expect(references.map((reference) => reference.token.url)).toEqual(["/one.png", "/two.png"]);
    expect(references.every((reference) => reference.kind === "image")).toBe(true);
  });
});
