import { describe, expect, it } from "vitest";
import { sanitizeCss } from "../../packages/core/src/page-document-sanitize-css.js";

describe("PostCSS serialization security", () => {
  it("escapes a style terminator before caller CSS reaches an embedding sink", () => {
    const result = sanitizeCss(
      ".probe{--payload:</style><script>globalThis.__imposiaPwned=1</script>}",
    );

    expect(result.resourceBlocked).toBe(false);
    expect(result.css).not.toContain("</style");
    expect(result.css).toContain("\\3c /style>");
  });

  it("preserves ordinary caller CSS while serializing it safely", () => {
    const result = sanitizeCss('.chapter{color:#123456;content:"ordinary"}');

    expect(result).toEqual({
      css: '.chapter{color:#123456;content:"ordinary"}',
      resourceBlocked: false,
    });
  });

  it("blocks string URLs in image-set and other unsupported resource functions", () => {
    for (const value of [
      'image-set("https://assets.example.test/print.png" 1x)',
      '-webkit-image-set("https://assets.example.test/print.png" 1x)',
      'cross-fade("https://assets.example.test/print.png", white 50%)',
      'local("Untrusted font")',
    ]) {
      const result = sanitizeCss(`.print{background-image:${value}}`, true, new Set());
      expect(result.resourceBlocked).toBe(true);
      expect(result.css).not.toContain("background-image");
    }
  });

  it("finds URLs hidden behind escapes that decode to quotes or comment openers", () => {
    for (const value of [
      // A hex escape absorbs one whitespace, so the second space separates the identifier.
      "\\22  url(https://assets.example.test/x.png)",
      "\\2f\\2a  url(https://assets.example.test/x.png)",
      "\\2f\\2a  imag\\65 -set('https://assets.example.test/x.png' 1x)",
      "\\75 rl(https://assets.example.test/x.png)",
    ]) {
      const result = sanitizeCss(`.item{list-style:${value}}`);
      expect(result.resourceBlocked, value).toBe(true);
      expect(result.css, value).not.toContain("list-style");
    }
  });

  it("does not treat an unquoted url() body as a comment opener", () => {
    const result = sanitizeCss(
      ".item{list-style:url(blob:a/*) image-set('https://assets.example.test/x.png' 1x)}",
      true,
      new Set(["blob:a/*"]),
    );
    expect(result.resourceBlocked).toBe(true);
    expect(result.css).not.toContain("list-style");
  });

  it("ignores resource function names inside comments", () => {
    const result = sanitizeCss(".a{color:red /* image (x) and local(y) */}", true, new Set());
    expect(result).toEqual({
      css: ".a{color:red /* image (x) and local(y) */}",
      resourceBlocked: false,
    });
  });

  it("removes only the unresolved declaration inside a conditional block", () => {
    const result = sanitizeCss(
      "@media print{.a{color:red}.b{background:image-set('https://assets.example.test/x.png' 1x)}}",
      true,
      new Set(),
    );
    expect(result.resourceBlocked).toBe(true);
    expect(result.css).toBe("@media print{.a{color:red}.b{}}");
  });

  it("still removes an at-rule whose own prelude loads a resource", () => {
    const result = sanitizeCss(
      "@media (min-width: 1px) and url(https://assets.example.test/x.png){.a{color:red}}",
      true,
      new Set(),
    );
    expect(result.resourceBlocked).toBe(true);
    expect(result.css).toBe("");
  });
});
