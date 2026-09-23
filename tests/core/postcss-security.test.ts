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
});
