import { describe, expect, it } from "vitest";
import {
  canonicalMimeType,
  mimeType,
} from "../../packages/core/src/page-document-assets-resolver.js";

describe("declared asset MIME canonicalisation", () => {
  it("maps the pre-RFC 8081 font spellings onto the font/* tree", () => {
    expect(canonicalMimeType("application/x-font-woff")).toBe("font/woff");
    expect(canonicalMimeType("application/font-woff")).toBe("font/woff");
    expect(canonicalMimeType("application/x-font-woff2")).toBe("font/woff2");
    expect(canonicalMimeType("application/x-truetype-font")).toBe("font/ttf");
    expect(canonicalMimeType("application/font-sfnt")).toBe("font/ttf");
    expect(canonicalMimeType("application/vnd.ms-opentype")).toBe("font/otf");
  });

  it("keeps parameters and casing out of the comparison", () => {
    expect(canonicalMimeType("Application/X-Font-WOFF; charset=binary")).toBe("font/woff");
    expect(canonicalMimeType("  font/woff2  ")).toBe("font/woff2");
  });

  it("leaves types that have no alias untouched", () => {
    expect(canonicalMimeType("image/png")).toBe("image/png");
    expect(canonicalMimeType("text/css")).toBe("text/css");
    expect(canonicalMimeType("application/octet-stream")).toBe("application/octet-stream");
  });

  it("does not invent a type for an empty or malformed value", () => {
    expect(canonicalMimeType("")).toBe("");
    expect(canonicalMimeType(";")).toBe("");
  });

  // Every alias names a font container, so no alias can promote a non-font declaration
  // into the font allowlist. Guarding this keeps a future addition honest.
  it("only ever produces font/* from an alias", () => {
    const aliased = [
      "application/font-woff",
      "application/x-font-woff",
      "application/font-woff2",
      "application/x-font-woff2",
      "application/font-sfnt",
      "application/x-font-ttf",
      "application/x-font-truetype",
      "application/x-truetype-font",
      "application/font-otf",
      "application/x-font-otf",
      "application/x-font-opentype",
      "application/vnd.ms-opentype",
    ];

    for (const declared of aliased) {
      const canonical = canonicalMimeType(declared);
      expect(canonical).not.toBe(mimeType(declared));
      expect(canonical.startsWith("font/")).toBe(true);
    }
  });
});
