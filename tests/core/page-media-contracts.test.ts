// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { prepareDocument } from "../../packages/core/src/document.js";
import type { PageContext } from "../../packages/core/src/page-document-types.js";
import {
  extractPageMediaCss,
  formatPageCounter,
  marginBoxText,
  normalizeHostPageOptions,
  parseMarginBoxContent,
  resolvePageMedia,
} from "../../packages/core/src/page-media.js";
import { createWarningCollector } from "../../packages/core/src/warnings.js";

describe("authored paged-media CSS contracts", () => {
  it("preserves supported page geometry, selectors, and margin-box declarations", () => {
    const prepared = prepareDocument(`
      <style>
        @page { size: 148mm 210mm; margin: 12mm 16mm 18mm 20mm; }
        @page :first { @top-center { content: "First"; } }
        @page chapter { @bottom-right { content: "Chapter"; } }
        .chapter { page: chapter; }
      </style>
      <article class="chapter">Authored page media</article>
    `);

    expect(prepared.html).toContain("@page");
    expect(prepared.html).toContain("148mm 210mm");
    expect(prepared.html).toContain("12mm 16mm 18mm 20mm");
    expect(prepared.html).toContain("@top-center");
    expect(prepared.html).toContain("@bottom-right");
    expect(prepared.html).toContain("page: chapter");
    expect(prepared.warnings).toEqual([]);
  });

  it("reports unsupported page-rule values deterministically instead of preserving them", () => {
    const source = `
      <style>
        @page {
          size: 2em 30%;
          margin: 10%;
          margin-left: nope;
        }
      </style>
      <p>Recoverable page-rule input</p>
    `;

    const first = prepareDocument(source);
    const second = prepareDocument(source);
    const warningCodes = first.warnings.map(({ code }) => code);

    expect(warningCodes.length).toBeGreaterThan(0);
    expect(warningCodes.every((code) => String(code) === "PAGE_RULE_UNSUPPORTED")).toBe(true);
    expect(first.warnings).toEqual(second.warnings);
    expect(first.html).not.toContain("2em 30%");
    expect(first.html).not.toContain("margin: 10%");
    expect(first.html).not.toContain("margin-left: nope");
  });
});

describe("CSS Paged Media coverage shared with Paged.js and Vivliostyle", () => {
  const MM = 96 / 25.4;

  function resolve(css: string, pageNumber: number, context: Partial<PageContext> = {}) {
    const extracted = extractPageMediaCss(css);
    return resolvePageMedia(
      extracted.rules,
      {},
      { side: pageNumber % 2 === 1 ? "right" : "left", name: undefined, blank: false, ...context },
      pageNumber,
      createWarningCollector(),
    );
  }

  it.each([
    ["A5", 148 * MM, 210 * MM],
    ["a3", 297 * MM, 420 * MM],
    ["B5", 176 * MM, 250 * MM],
    ["JIS-B5", 182 * MM, 257 * MM],
    ["legal", 8.5 * 96, 14 * 96],
    ["ledger", 11 * 96, 17 * 96],
  ])("accepts the %s page-size keyword", (keyword, width, height) => {
    const { geometry } = resolve(`@page { size: ${keyword}; margin: 10mm; }`, 1);
    expect(geometry.sheetWidthCssPx).toBeCloseTo(width, 6);
    expect(geometry.sheetHeightCssPx).toBeCloseTo(height, 6);
  });

  it("accepts an orientation before or after a size keyword, alone, and a square length", () => {
    const before = resolve("@page { size: landscape A5; margin: 10mm; }", 1).geometry;
    const after = resolve("@page { size: A5 landscape; margin: 10mm; }", 1).geometry;
    expect(before.sheetWidthCssPx).toBeCloseTo(210 * MM, 6);
    expect(before).toEqual(after);
    const alone = resolve("@page { size: landscape; margin: 10mm; }", 1).geometry;
    expect(alone.sheetWidthCssPx).toBeGreaterThan(alone.sheetHeightCssPx);
    const square = resolve("@page { size: 120mm; margin: 10mm; }", 1).geometry;
    expect(square.sheetWidthCssPx).toBeCloseTo(120 * MM, 6);
    expect(square.sheetHeightCssPx).toBeCloseTo(120 * MM, 6);
  });

  it("rejects malformed size values instead of approximating them", () => {
    const prepared = prepareDocument(
      "<style>@page { size: A9; } @page { size: landscape portrait; }</style><p>x</p>",
    );
    expect(prepared.warnings.map(({ code }) => code)).toEqual([
      "PAGE_RULE_UNSUPPORTED",
      "PAGE_RULE_UNSUPPORTED",
    ]);
  });

  it("accepts the new keywords as host page sizes", () => {
    expect(normalizeHostPageOptions({ size: "JIS-B5" }).size?.widthCssPx).toBeCloseTo(182 * MM, 6);
    expect(() => normalizeHostPageOptions({ size: "a5" as never })).toThrow(/A5/);
  });

  it("matches :nth() against the document page number and cascades above plain rules", () => {
    const css = `
      @page { @top-center { content: "plain"; } }
      @page :nth(2n+1) { @top-center { content: "odd"; } }
      @page :nth(2) { @top-center { content: "second"; } }
      @page :nth(-n+4):left { @top-center { content: "early left"; } }
    `;
    const text = (pageNumber: number) =>
      marginBoxText(resolve(css, pageNumber).marginBoxes.get("top-center")?.content, pageNumber, 9);
    expect([1, 2, 3, 4, 5, 6].map(text)).toEqual([
      "odd",
      "early left",
      "odd",
      "early left",
      "odd",
      "plain",
    ]);
  });

  it("rejects :nth() page groups and malformed arguments with a warning", () => {
    const prepared = prepareDocument(
      "<style>@page :nth(1 of chapter) {} @page :nth(x) {} @page :nth(1)chapter {}</style><p>x</p>",
    );
    expect(prepared.warnings.map(({ code }) => code)).toEqual([
      "PAGE_RULE_UNSUPPORTED",
      "PAGE_RULE_UNSUPPORTED",
      "PAGE_RULE_UNSUPPORTED",
    ]);
    const named = resolve("@page chapter:nth(1) { @top-center { content: 'c1'; } }", 1, {
      name: "chapter",
    });
    expect(marginBoxText(named.marginBoxes.get("top-center")?.content, 1, 1)).toBe("c1");
  });

  it("preserves all sixteen margin boxes", () => {
    const boxes = [
      "top-left-corner",
      "top-right-corner",
      "bottom-left-corner",
      "bottom-right-corner",
      "left-top",
      "left-middle",
      "left-bottom",
      "right-top",
      "right-middle",
      "right-bottom",
    ];
    const css = `@page { ${boxes.map((box) => `@${box} { content: "${box}"; }`).join(" ")} }`;
    const prepared = prepareDocument(`<style>${css}</style><p>x</p>`);
    expect(prepared.warnings).toEqual([]);
    const resolved = resolve(css, 1);
    for (const box of boxes) {
      expect(marginBoxText(resolved.marginBoxes.get(box as never)?.content, 1, 1)).toBe(box);
    }
  });

  it("formats page counters with the predefined counter styles", () => {
    const content = parseMarginBoxContent(
      'counter(page, lower-roman) "/" counter(pages, upper-roman) " " counter(page, upper-alpha) " " counter(page, decimal-leading-zero)',
    );
    expect(marginBoxText(content, 4, 1994)).toBe("iv/MCMXCIV D 04");
    expect(marginBoxText(parseMarginBoxContent("counter(page, lower-latin)"), 28, 28)).toBe("ab");
    expect(marginBoxText(parseMarginBoxContent("counter(page, lower-greek)"), 2, 2)).toBe("β");
    expect(formatPageCounter(4000, "upper-roman")).toBe("4000");
    expect(parseMarginBoxContent("counter(page, fancy-style)")).toBeUndefined();
  });

  it("defaults string() to first and supports first-except", () => {
    expect(parseMarginBoxContent("string(title)")).toEqual([
      { type: "string", name: "title", position: "first" },
    ]);
    expect(parseMarginBoxContent("string(title, first-except)")).toEqual([
      { type: "string", name: "title", position: "first-except" },
    ]);
  });

  it("cascades allowlisted margin-box styles per property and drops resource-bearing ones", () => {
    const css = `
      @page {
        @bottom-center { content: counter(page); font-size: 9pt; color: gray; text-align: right; }
      }
      @page :first { @bottom-center { color: red; } }
    `;
    const first = resolve(css, 1).marginBoxes.get("bottom-center");
    const second = resolve(css, 2).marginBoxes.get("bottom-center");
    expect(first?.style).toEqual([
      ["font-size", "9pt"],
      ["text-align", "right"],
      ["color", "red"],
    ]);
    expect(second?.style).toEqual([
      ["font-size", "9pt"],
      ["color", "gray"],
      ["text-align", "right"],
    ]);

    const prepared = prepareDocument(`
      <style>
        @page { @top-center {
          content: "x";
          font-weight: bold;
          position: fixed;
          background-color: url(https://example.test/a.png);
        } }
      </style>
      <p>x</p>
    `);
    expect(prepared.html).toContain("font-weight: bold");
    expect(prepared.html).not.toContain("position: fixed");
    expect(prepared.html).not.toContain("example.test");
    expect(prepared.warnings.map(({ code, property }) => [code, property])).toContainEqual([
      "PAGE_RULE_UNSUPPORTED",
      "position",
    ]);
  });

  it("does not generate a box whose content is none even when it is styled", () => {
    const resolved = resolve(
      "@page { @top-center { content: none; color: red; } @top-left { color: red; } }",
      1,
    );
    expect(resolved.marginBoxes.size).toBe(0);
  });
});
