import { describe, expect, it } from "vitest";
import { prepareDocument } from "../../packages/core/src/document.js";

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
