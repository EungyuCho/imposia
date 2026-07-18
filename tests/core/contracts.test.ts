import { describe, expect, it } from "vitest";
import { prepareDocument } from "../../packages/core/src/document.js";

describe("paged-media compatibility contracts", () => {
  it("maps legacy always to page and lets modern break declarations win with the confirmed warning", () => {
    const prepared = prepareDocument(`
      <style>
        .legacy { page-break-before: always; }
        .both { page-break-after: left; break-after: right; }
        .inside { page-break-inside: avoid; }
      </style>
      <main class="legacy both inside">Chapter</main>
    `);

    expect(prepared.html).toContain("break-before: page");
    expect(prepared.html).toContain("break-after: right");
    expect(prepared.html).toContain("break-inside: avoid");
    expect(prepared.html).not.toContain("page-break-");
    expect(prepared.warnings).toEqual([
      {
        code: "OVERRIDDEN_LEGACY_BREAK",
        severity: "warning",
        message: "Modern break declaration overrides legacy page-break alias.",
        feature: "css-break",
        property: "page-break-after",
        value: "left",
        sourceIndex: 1,
      },
    ]);
  });

  it("preserves left and right page-side values", () => {
    const prepared = prepareDocument(`
      <style>
        h1 { page-break-before: left; }
        h2 { break-before: right; }
      </style>
    `);

    expect(prepared.html).toContain("break-before: left");
    expect(prepared.html).toContain("break-before: right");
    expect(prepared.warnings).toEqual([]);
  });

  it("extracts embedded decorations, applies matching API overrides, and leaves unknown tokens literal", () => {
    const prepared = prepareDocument(
      `
        <template data-page-header><span>Embedded {{pageNumber}}</span></template>
        <template data-page-footer><span>{{totalPages}} / {{chapter}}</span></template>
        <article>Body</article>
      `,
      { headerTemplate: "<strong>API {{pageNumber}} / {{totalPages}}</strong>" },
    );

    expect(prepared.headerTemplate).toBe(
      '<strong>API <span class="pageNumber"></span> / <span class="totalPages"></span></strong>',
    );
    expect(prepared.footerTemplate).toBe(
      '<span><span class="totalPages"></span> / {{chapter}}</span>',
    );
    expect(prepared.html).not.toContain("data-page-header");
    expect(prepared.html).not.toContain("data-page-footer");
    expect(prepared.warnings).toEqual([
      {
        code: "OVERRIDDEN_EMBEDDED_HEADER",
        severity: "warning",
        message: "headerTemplate option overrides embedded header template.",
        feature: "page-decoration",
        sourceIndex: 0,
      },
      {
        code: "UNSUPPORTED_DECORATION_TOKEN",
        severity: "warning",
        message: "Unsupported decoration token was left unchanged.",
        feature: "page-decoration",
        value: "{{chapter}}",
        sourceIndex: 1,
      },
    ]);
  });

  it("emits warnings in first-seen order and deduplicates repeated unsupported declarations", () => {
    const prepared = prepareDocument(`
      <style>
        h1 { break-before: column; }
        h2 { break-before: column; }
        p { break-inside: page; }
      </style>
    `);

    expect(prepared.warnings).toEqual([
      {
        code: "UNSUPPORTED_BREAK_VALUE",
        severity: "warning",
        message: "Unsupported break value was ignored.",
        feature: "css-break",
        property: "break-before",
        value: "column",
        sourceIndex: 0,
      },
      {
        code: "UNSUPPORTED_BREAK_VALUE",
        severity: "warning",
        message: "Unsupported break value was ignored.",
        feature: "css-break",
        property: "break-inside",
        value: "page",
        sourceIndex: 2,
      },
    ]);
    expect(prepared.html).not.toContain("column");
    expect(prepared.html).not.toContain("break-inside: page");
  });

  it("orders warnings by first source occurrence across CSS, decorations, and resources", () => {
    const prepared = prepareDocument(`
      <style>h1 { break-before: column; }</style>
      <template data-page-header>{{chapter}}</template>
      <img src="https://blocked.example/cover.png">
    `);

    expect(prepared.warnings.map(({ code, message }) => ({ code, message }))).toEqual([
      {
        code: "UNSUPPORTED_BREAK_VALUE",
        message: "Unsupported break value was ignored.",
      },
      {
        code: "UNSUPPORTED_DECORATION_TOKEN",
        message: "Unsupported decoration token was left unchanged.",
      },
      {
        code: "RESOURCE_BLOCKED",
        message: "Resource was blocked by the loading policy.",
      },
    ]);
    expect(prepared.headerTemplate).toBe("{{chapter}}");
  });
});
