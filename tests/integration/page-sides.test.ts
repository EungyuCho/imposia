import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, describe, expect, it } from "vitest";
import { createRenderer } from "../../packages/core/src/renderer.js";

async function pdfPageTexts(pdf: Uint8Array): Promise<string[]> {
  const document = await getDocument({ data: pdf.slice() }).promise;
  const texts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      page.cleanup();
    }
    return texts;
  } finally {
    await document.destroy();
  }
}

describe("left/right page constraints", () => {
  const renderer = createRenderer();

  afterAll(async () => {
    await renderer.close();
  });

  it.each([
    {
      name: "break-before:right inserts a blank when the target would start on a left page",
      html: '<style>@page{size:A4}.chapter{break-before:right}</style><section>One</section><section class="chapter">Two</section>',
      expectedPages: ["One", "", "Two"],
    },
    {
      name: "break-before:right keeps an already aligned target unchanged",
      html: '<style>@page{size:A4}section+section{break-before:page}.chapter{break-before:right}</style><section>One</section><section>Two</section><section class="chapter">Three</section>',
      expectedPages: ["One", "Two", "Three"],
    },
    {
      name: "break-before:left keeps an already aligned target unchanged",
      html: '<style>@page{size:A4}.chapter{break-before:left}</style><section>One</section><section class="chapter">Two</section>',
      expectedPages: ["One", "Two"],
    },
    {
      name: "break-before:left inserts a blank when the target would start on a right page",
      html: '<style>@page{size:A4}section+section{break-before:page}.chapter{break-before:left}</style><section>One</section><section>Two</section><section class="chapter">Three</section>',
      expectedPages: ["One", "Two", "", "Three"],
    },
  ])("$name", async ({ html, expectedPages }) => {
    const result = await renderer.render({ html });
    expect(result.pageCount).toBe(expectedPages.length);
    expect(await pdfPageTexts(result.pdf)).toEqual(expectedPages);
  });

  it("recomputes later break-before targets after each inserted blank page", async () => {
    const result = await renderer.render({
      html: '<style>@page{size:A4}section+section{break-before:page}.target{break-before:right}</style><section>One</section><section class="target">Two</section><section>Three</section><section class="target">Four</section>',
    });
    expect(result.pageCount).toBe(5);
    expect(await pdfPageTexts(result.pdf)).toEqual(["One", "", "Two", "Three", "Four"]);
  });

  it("does not confuse user text with an internal page-side marker", async () => {
    const result = await renderer.render({
      html: '<style>@page{size:A4}section+section{break-before:page}.target{break-before:right}</style><section>One</section><section class="target">Two</section><section>IMPS0Z</section>',
    });
    expect(result.pageCount).toBe(4);
    expect(await pdfPageTexts(result.pdf)).toEqual(["One", "", "Two", "IMPS0Z"]);
  });

  it("preserves author elements that use internal-looking data attributes", async () => {
    const result = await renderer.render({
      html: '<style>.target{break-before:right}</style><p data-imposia-side-marker="0" data-imposia-side-position="before">Keep me</p><section>One</section><section class="target">Two</section>',
    });
    expect(result.pageCount).toBe(3);
    expect(
      (await pdfPageTexts(result.pdf)).map((text) => text.replace(/\s+/g, " ").trim()),
    ).toEqual(["Keep me One", "", "Two"]);
  });

  it.each([
    {
      name: "ignores break-before on an ordinary inline box",
      html: '<p>One <span style="break-before:right">Inline</span> Two</p>',
      text: "One Inline Two",
    },
    {
      name: "ignores break-after on an ordinary inline box",
      html: '<p><span style="break-after:right">One</span> Inline Two</p>',
      text: "One Inline Two",
    },
    {
      name: "ignores break-before on an absolutely positioned box",
      html: '<p>Flow</p><p style="position:absolute;top:0;break-before:right">Overlay</p>',
      text: "Overlay",
    },
    {
      name: "ignores break-after on a fixed-position box",
      html: '<p style="position:fixed;break-after:right">Fixed</p><p>Flow</p>',
      text: "Flow",
    },
  ])("$name", async ({ html, text }) => {
    const result = await renderer.render({ html });
    expect(result.pageCount).toBe(1);
    expect((await pdfPageTexts(result.pdf))[0]?.replace(/\s+/g, " ").trim()).toContain(text);
  });

  it.each([
    {
      name: "ignores break-before on a non-generated display:none target",
      html: '<style>.hidden{display:none;break-before:right}</style><div>One</div><div class="hidden">Hidden</div>',
      expectedPages: ["One"],
    },
    {
      name: "ignores break-after on a non-generated display:none target",
      html: '<style>.hidden{display:none;break-after:right}</style><div>One</div><div class="hidden">Hidden</div><div>Two</div>',
      expectedPages: ["One  Two"],
    },
    {
      name: "keeps a visibility:hidden break-before target measurable",
      html: '<style>.hidden{visibility:hidden;break-before:right}</style><div>One</div><div class="hidden">Hidden</div><div>Two</div>',
      expectedPages: ["One", "", "Two"],
    },
    {
      name: "keeps a visibility:hidden break-after target measurable",
      html: '<style>.hidden{visibility:hidden;break-after:right}</style><div>One</div><div class="hidden">Hidden</div><div>Two</div>',
      expectedPages: ["One", "", "Two"],
    },
    {
      name: "supports break-before on a void element",
      html: '<section>One</section><hr style="break-before:right"><section>Two</section>',
      expectedPages: ["One", "", "Two"],
    },
    {
      name: "supports break-before on a replaced input element",
      html: '<section>One</section><input style="break-before:right" value="Two">',
      expectedPages: ["One", "", "Two"],
    },
    {
      name: "restores break-before on a block SVG element",
      html: '<section>One</section><svg style="display:block;break-before:left" width="100" height="40"><text x="0" y="20">Two</text></svg>',
      expectedPages: ["One", "Two"],
    },
    {
      name: "isolates markers from author span styles",
      html: '<style>span{display:none!important}.chapter{break-before:right}</style><section>One</section><section class="chapter">Two</section>',
      expectedPages: ["One", "", "Two"],
    },
    {
      name: "isolates blank spacers from author div styles",
      html: '<style>div{display:none!important}.chapter{break-before:right}</style><section>One</section><section class="chapter">Two</section>',
      expectedPages: ["One", "", "Two"],
    },
    {
      name: "isolates internal replaced elements from author pseudo-elements",
      html: '<style>input::before{content:"x"!important;display:block!important;height:300mm!important}.chapter{break-before:right}</style><section>One</section><section class="chapter">Two</section>',
      expectedPages: ["One", "", "Two"],
    },
  ])("$name", async ({ html, expectedPages }) => {
    const result = await renderer.render({ html });
    expect(result.pageCount).toBe(expectedPages.length);
    expect(await pdfPageTexts(result.pdf)).toEqual(expectedPages);
  });

  it.each([
    {
      name: "break-after:right inserts a blank when following content would start on a left page",
      html: '<style>@page{size:A4}.chapter{break-after:right}</style><section class="chapter">One</section><section>Two</section>',
      expectedPages: ["One", "", "Two"],
    },
    {
      name: "break-after:left keeps already aligned following content unchanged",
      html: '<style>@page{size:A4}.chapter{break-after:left}</style><section class="chapter">One</section><section>Two</section>',
      expectedPages: ["One", "Two"],
    },
    {
      name: "break-after:right keeps already aligned following content unchanged",
      html: '<style>@page{size:A4}section+section{break-before:page}.chapter{break-after:right}</style><section>One</section><section class="chapter">Two</section><section>Three</section>',
      expectedPages: ["One", "Two", "Three"],
    },
    {
      name: "break-after:left inserts a blank when following content would start on a right page",
      html: '<style>@page{size:A4}section+section{break-before:page}.chapter{break-after:left}</style><section>One</section><section class="chapter">Two</section><section>Three</section>',
      expectedPages: ["One", "Two", "", "Three"],
    },
    {
      name: "break-after:right sees descendants of a display:contents sibling",
      html: '<style>.chapter{break-after:right}</style><section class="chapter">One</section><div style="display:contents"><span>Two</span></div>',
      expectedPages: ["One", "", "Two"],
    },
  ])("$name", async ({ html, expectedPages }) => {
    const result = await renderer.render({ html });
    expect(result.pageCount).toBe(expectedPages.length);
    expect(await pdfPageTexts(result.pdf)).toEqual(expectedPages);
  });

  it("ignores out-of-flow-only content after a page-side break", async () => {
    const result = await renderer.render({
      html: '<section style="break-after:right">One</section><p style="position:absolute;top:0">Overlay</p>',
    });
    expect(result.pageCount).toBe(1);
    expect((await pdfPageTexts(result.pdf))[0]).toContain("One");
  });
});
