import { describe, expect, it } from "vitest";
import { isolateHoistedFontFamilies } from "../../packages/core/src/page-document-print.js";

/**
 * The fakes here are deliberately plain objects: the rules a real print walks belong to
 * the top document, and when the host application runs inside a same-origin iframe they
 * are instances of that realm's constructors, not this one's. Plain objects reproduce the
 * cross-realm condition exactly -- an `instanceof CSSStyleRule` implementation would skip
 * every rule in this suite (and would throw outright in this DOM-less environment).
 */
type FakeStyle = {
  getPropertyValue(name: string): string;
  setProperty(name: string, value: string, priority?: string): void;
  getPropertyPriority(name: string): string;
};

function fakeStyle(
  initialFontFamily: string,
  priority = "",
): FakeStyle & {
  fontFamily: string;
  priority: string;
} {
  return {
    fontFamily: initialFontFamily,
    priority,
    getPropertyValue(name: string) {
      return name === "font-family" ? this.fontFamily : "";
    },
    setProperty(name: string, value: string, nextPriority?: string) {
      if (name !== "font-family") return;
      this.fontFamily = value;
      this.priority = nextPriority ?? "";
    },
    getPropertyPriority(name: string) {
      return name === "font-family" ? this.priority : "";
    },
  };
}

function styleRule(selectorText: string, style: FakeStyle): Record<string, unknown> {
  return { selectorText, style };
}

function groupingRule(rules: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { cssRules: rules };
}

function fakeShadow(
  sheets: readonly Record<string, unknown>[],
  styledElements: readonly { style: FakeStyle }[] = [],
): ShadowRoot {
  return {
    styleSheets: sheets,
    querySelectorAll: () => styledElements,
  } as unknown as ShadowRoot;
}

const facePrefix = /^"imposia-print-\d+--/;

describe("isolateHoistedFontFamilies", () => {
  it("namespaces every hoisted @font-face family and leaves @page rules alone", () => {
    const hoisted = [
      '@font-face{font-family:"Toss Product Sans";src:url("/a.woff2")}',
      "@page{margin:0}",
      "@font-face{font-family:'Toss Product Sans';src:url(\"/a-bold.woff2\");font-weight:700}",
    ];

    isolateHoistedFontFamilies(fakeShadow([]), hoisted);

    const first = /font-family\s*:\s*("[^"]+")/.exec(hoisted[0] ?? "")?.[1];
    const second = /font-family\s*:\s*("[^"]+")/.exec(hoisted[2] ?? "")?.[1];
    expect(first).toMatch(facePrefix);
    expect(first?.endsWith('--Toss Product Sans"')).toBe(true);
    // Both weights of the same family must land on the same namespaced name.
    expect(second).toBe(first);
    expect(hoisted[1]).toBe("@page{margin:0}");
  });

  // Regression: `rule instanceof CSSStyleRule` is realm-sensitive. These plain-object
  // rules have no CSSStyleRule prototype at all, so the rewrite only happens if the walk
  // duck-types the rules.
  it("rewrites style rules from another realm, including nested ones", () => {
    const hoisted = ['@font-face{font-family:"Body Face";src:url("/b.woff2")}'];
    const topLevel = fakeStyle('"Body Face", serif');
    const nested = fakeStyle('"Body Face"');
    const shadow = fakeShadow([
      {
        cssRules: [styleRule("p", topLevel), groupingRule([styleRule("h1", nested)])],
      },
    ]);

    isolateHoistedFontFamilies(shadow, hoisted);

    expect(topLevel.fontFamily).toMatch(facePrefix);
    expect(topLevel.fontFamily.endsWith('--Body Face", serif')).toBe(true);
    expect(nested.fontFamily).toMatch(facePrefix);
  });

  // Regression: font-family matching is case-insensitive in CSS, but an exact-match Map
  // lookup missed usages whose spelling differed from the declaration, leaving just those
  // elements attached to the host's face.
  it("matches families case-insensitively", () => {
    const hoisted = ['@font-face{font-family:"Toss Product Sans";src:url("/a.woff2")}'];
    const style = fakeStyle("toss product sans, sans-serif");
    const shadow = fakeShadow([{ cssRules: [styleRule("p", style)] }]);

    isolateHoistedFontFamilies(shadow, hoisted);

    expect(style.fontFamily).toMatch(facePrefix);
    expect(style.fontFamily.endsWith('--Toss Product Sans", sans-serif')).toBe(true);
  });

  it("leaves families the hoisted faces do not declare untouched", () => {
    const hoisted = ['@font-face{font-family:"Body Face";src:url("/b.woff2")}'];
    const style = fakeStyle("Arial, sans-serif");
    const shadow = fakeShadow([{ cssRules: [styleRule("p", style)] }]);

    isolateHoistedFontFamilies(shadow, hoisted);

    expect(style.fontFamily).toBe("Arial, sans-serif");
  });

  it("rewrites inline [style] declarations on cloned content", () => {
    const hoisted = ['@font-face{font-family:"Body Face";src:url("/b.woff2")}'];
    const inline = fakeStyle('"Body Face"', "important");
    const shadow = fakeShadow([], [{ style: inline }]);

    isolateHoistedFontFamilies(shadow, hoisted);

    expect(inline.fontFamily).toMatch(facePrefix);
    expect(inline.priority).toBe("important");
  });

  it("skips a sheet it cannot read without dropping the rest", () => {
    const hoisted = ['@font-face{font-family:"Body Face";src:url("/b.woff2")}'];
    const style = fakeStyle('"Body Face"');
    const unreadable = {
      get cssRules(): never {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    const shadow = fakeShadow([unreadable, { cssRules: [styleRule("p", style)] }]);

    isolateHoistedFontFamilies(shadow, hoisted);

    expect(style.fontFamily).toMatch(facePrefix);
  });

  it("does nothing when no hoisted rule declares a family", () => {
    const hoisted = ["@page{margin:0}"];
    const style = fakeStyle('"Body Face"');
    const shadow = fakeShadow([{ cssRules: [styleRule("p", style)] }]);

    isolateHoistedFontFamilies(shadow, hoisted);

    expect(hoisted).toEqual(["@page{margin:0}"]);
    expect(style.fontFamily).toBe('"Body Face"');
  });
});
