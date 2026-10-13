import { describe, expect, it } from "vitest";
import { parseCss as parse } from "../../packages/core/src/css-parse.js";
import { unusedFontRange } from "../../packages/core/src/page-document-font-usage.js";

describe("conservative font range filtering", () => {
  it.each(["DECIMAL INSIDE", "outside lower-roman", "square", "inside"])(
    "filters unused ranges with predefined list-style %s",
    (value) => {
      expect(unusedFontRange("U+0E00-0E7F", "Hello", [parse(`p{list-style:${value}}`)])).toBe(true);
    },
  );
  it.each(['"ก"', "custom", "url(marker.png)", "decimal square", "inside outside", "var(--style)"])(
    "keeps ranges with uncertain list-style %s",
    (value) => {
      expect(unusedFontRange("U+0E00-0E7F", "Hello", [parse(`p{list-style:${value}}`)])).toBe(
        false,
      );
    },
  );
});
