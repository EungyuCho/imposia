import { expect } from "@playwright/test";
import {
  boxTexts,
  nodes,
  type PaginationTopic,
  paragraphs,
  sheets,
  token,
  warning,
} from "./pagination-topic-support.js";

export const publishingTopics: PaginationTopic[] = [];
const add = (topic: PaginationTopic) => publishingTopics.push(topic);
const marginSelector = (slot = "bottom-center") => `[data-imposia-margin-box="${slot}"]`;

for (const [id, rule, property] of [
  ["sheet-bleed", "bleed:3mm", "bleed"],
  ["sheet-custom-bleed", "bleed:11px", "bleed"],
  ["sheet-printer-marks", "marks:crop cross", "marks"],
] as const) {
  add({
    id,
    title: `${property} outside the supported page contract warns without changing sheet geometry`,
    input: { html: sheets(2), css: `@page { ${rule}; }` },
    check: (r) => {
      warning(r, "PAGE_RULE_UNSUPPORTED", property);
      expect(r.pages.map((p) => [p.width, p.height])).toEqual([
        [320, 440],
        [320, 440],
      ]);
    },
  });
}

for (const [id, rule, width, height] of [
  ["page-size-landscape", "size: A5 landscape", (210 * 96) / 25.4, (148 * 96) / 25.4],
  ["page-size-absolute", "size: 360px 480px", 360, 480],
  ["page-size-keyword", "size: A5", (148 * 96) / 25.4, (210 * 96) / 25.4],
] as const) {
  add({
    id,
    title: "authored sheet dimensions match the selected page size",
    input: { html: `<p>${token(0)}</p>`, css: `@page { ${rule}; }` },
    check: (r) => {
      expect(r.pages).toHaveLength(1);
      expect(r.pages[0]?.width).toBeCloseTo(width, 0);
      expect(r.pages[0]?.height).toBeCloseTo(height, 0);
    },
  });
}
add({
  id: "page-zero-margin",
  title: "zero page margins put authored content at the sheet origin",
  input: {
    html: `<p data-probe>${token(0)}</p>`,
    css: "@page { margin:0; }",
    selectors: { probe: "[data-probe]" },
  },
  check: (r) => {
    expect(nodes(r)[0]?.top).toBeCloseTo(0, 0);
    expect(nodes(r)[0]?.left).toBeCloseTo(0, 0);
  },
});
add({
  id: "page-padding-recovery",
  title: "unsupported page padding produces a typed warning",
  input: { html: sheets(1), css: "@page { padding:0; }" },
  check: (r) => warning(r, "PAGE_RULE_UNSUPPORTED", "padding"),
});
add({
  id: "page-rule-cascade",
  title: "later page rules override margins while retaining earlier size",
  input: {
    html: `<p data-probe>${token(0)}</p>`,
    css: "@page { size:350px 460px; margin:30px; } @page { margin-left:45px; }",
    selectors: { probe: "[data-probe]" },
  },
  check: (r) => {
    expect(r.pages[0]?.width).toBeCloseTo(350, 0);
    expect(nodes(r)[0]?.left).toBeCloseTo(45, 0);
    expect(nodes(r)[0]?.top).toBeCloseTo(30, 0);
  },
});

add({
  id: "selector-blank",
  title: "blank page selectors decorate only parity-inserted sheets",
  input: {
    html: `<p>${token(0)}</p><p style="break-before:right">${token(1)}</p>`,
    css: '@page { @bottom-center { content:"body"; } } @page :blank { @bottom-center { content:"blank"; } }',
  },
  check: (r) => expect(boxTexts(r)).toEqual(["body", "blank", "body"]),
});
add({
  id: "selector-first",
  title: "first-page decoration does not leak to later pages",
  input: {
    html: sheets(3),
    css: '@page { @bottom-center { content:"later"; } } @page :first { @bottom-center { content:"opening"; } }',
  },
  check: (r) => expect(boxTexts(r)).toEqual(["opening", "later", "later"]),
});
add({
  id: "selector-nth",
  title: "An+B page selectors match alternating global page numbers",
  input: {
    html: sheets(5),
    css: '@page { @bottom-center { content:"odd"; } } @page :nth(2n) { @bottom-center { content:"even"; } }',
  },
  check: (r) => expect(boxTexts(r)).toEqual(["odd", "even", "odd", "even", "odd"]),
});
add({
  id: "selector-spread",
  title: "left and right selectors follow global sheet parity",
  input: {
    html: sheets(4),
    css: '@page :left { @bottom-center { content:"L"; } } @page :right { @bottom-center { content:"R"; } }',
  },
  check: (r) => expect(boxTexts(r)).toEqual(["R", "L", "R", "L"]),
});
add({
  id: "selector-group-first-recovery",
  title: "unsupported nth-of-page-group selectors are diagnosed",
  input: {
    html: `<section style="page:chapter">${sheets(3)}</section>`,
    css: '@page :nth(1 of chapter) { @bottom-center { content:"group-first"; } }',
  },
  check: (r) => {
    warning(r, "PAGE_RULE_UNSUPPORTED");
    expect(boxTexts(r)).toEqual(["", "", ""]);
  },
});
add({
  id: "selector-named-spread",
  title: "named left/right page rules combine with global parity",
  input: {
    html: `<section style="page:chapter">${sheets(3)}</section>`,
    css: '@page chapter:left { @bottom-center { content:"chapter-left"; } } @page chapter:right { @bottom-center { content:"chapter-right"; } }',
  },
  check: (r) => expect(boxTexts(r)).toEqual(["chapter-right", "chapter-left", "chapter-right"]),
});

const namedCss =
  '@page alpha { @bottom-center { content:"A"; } } @page beta { @bottom-center { content:"B"; } }';
const part = (n: number, name: string, extra = "") =>
  `<section style="page:${name};${extra}">${token(n)}</section>`;
for (const [id, html, labels] of [
  ["named-transition", part(0, "alpha") + part(1, "beta"), ["A", "B"]],
  [
    "named-unnamed-siblings",
    `<p>${token(0)}</p>${part(1, "alpha")}<p>${token(2)}</p>${part(3, "beta")}`,
    ["", "A", "", "B"],
  ],
  ["named-shared-master", part(0, "alpha") + part(1, "alpha"), ["A"]],
  [
    "named-long-section",
    `<section style="page:alpha">${paragraphs(23)}</section>`,
    ["A", "A", "A"],
  ],
  [
    "named-nested-first-child",
    `<p>${token(0)}</p><article>${part(1, "beta")}</article>`,
    ["", "B"],
  ],
  [
    "named-contiguous-paragraphs",
    `<div style="page:alpha"><p>${token(0)}</p><p>${token(1)}</p></div>`,
    ["A"],
  ],
  ["named-fold-after", part(0, "alpha", "break-after:page") + part(1, "beta"), ["A", "B"]],
  ["named-fold-before", part(0, "alpha") + part(1, "beta", "break-before:page"), ["A", "B"]],
  [
    "named-hidden-transition",
    `${part(0, "alpha")}<aside style="display:none;page:beta">Hidden</aside>${part(1, "alpha")}`,
    ["A"],
  ],
  [
    "named-auto-inheritance",
    `<article style="page:alpha"><section style="page:auto">${token(0)}</section><section>${token(1)}</section></article>`,
    ["A"],
  ],
  ["named-returning-group", part(0, "alpha") + part(1, "beta") + part(2, "alpha"), ["A", "B", "A"]],
] as const) {
  add({
    id,
    title: "named page transitions preserve source order and select only the required sheets",
    input: { html, css: namedCss },
    check: (r) => expect(boxTexts(r)).toEqual(labels),
  });
}

for (const [id, declaration, expected] of [
  ["counter-current-page", "counter(page)", ["1", "2", "3"]],
  ["counter-total-pages", 'counter(page) " / " counter(pages)', ["1 / 3", "2 / 3", "3 / 3"]],
] as const) {
  add({
    id,
    title: "margin page counters describe the committed global page sequence",
    input: { html: sheets(3), css: `@page { @bottom-center { content:${declaration}; } }` },
    check: (r) => expect(boxTexts(r)).toEqual(expected),
  });
}
for (const [id, selector] of [
  ["counter-page-reset-recovery", ""],
  ["counter-scoped-reset-recovery", ":nth(2)"],
] as const) {
  add({
    id,
    title: "unsupported authored page-counter reset warns and retains global numbering",
    input: {
      html: sheets(3),
      css: `@page { @bottom-center { content:counter(page); } } @page ${selector} { counter-reset:page 8; }`,
    },
    check: (r) => {
      warning(r, "PAGE_RULE_UNSUPPORTED", "counter-reset");
      expect(boxTexts(r)).toEqual(["1", "2", "3"]);
    },
  });
}
add({
  id: "counter-nested-scope",
  title: "nested custom-counter scopes and increments survive ordinary layout",
  input: {
    html: `<article><h1>${token(0)}</h1><section><h2>${token(1)}</h2><h2>${token(2)}</h2></section><h1>${token(3)}</h1></article>`,
    css: "article { counter-reset:chapter; } h1 { counter-increment:chapter; } section { counter-reset:part; } h2 { counter-increment:part; } h2::before { content:counters(part,'.'); }",
    selectors: { roots: "article", probe: "h1", nested: "section", children: "h2" },
  },
  check: (r) => {
    expect(nodes(r, "roots")[0]?.style["counter-reset"]).toContain("chapter");
    expect(nodes(r, "nested")[0]?.style["counter-reset"]).toContain("part");
    expect(nodes(r).map((n) => n.style["counter-increment"])).toEqual(["chapter 1", "chapter 1"]);
    expect(nodes(r, "children").map((n) => n.style["counter-increment"])).toEqual([
      "part 1",
      "part 1",
    ]);
  },
});

for (const [id, css, key, value] of [
  [
    "margin-style",
    "background-color:rgb(12,34,56);color:rgb(91,72,53)",
    "color",
    "rgb(91, 72, 53)",
  ],
  ["margin-horizontal-alignment", "text-align:right", "text-align", "right"],
  ["margin-vertical-alignment", "vertical-align:bottom", "align-items", "flex-end"],
] as const) {
  add({
    id,
    title: "margin-box styling is applied to the generated box",
    input: {
      html: sheets(2),
      css: `@page { margin-top:50px; @top-center { content:"Running label"; ${css}; } }`,
      selectors: { probe: marginSelector("top-center") },
    },
    check: (r) => {
      expect(nodes(r)).toHaveLength(2);
      for (const n of nodes(r)) {
        expect(n.text).toBe("Running label");
        expect(n.style[key]).toBe(value);
      }
    },
  });
}
add({
  id: "margin-box-dimensions",
  title: "opposed margin labels fit within their sheet and do not overlap",
  input: {
    html: sheets(1),
    css: '@page { margin-top:60px; @top-left { content:"Left"; } @top-right { content:"Right"; } }',
    selectors: { left: marginSelector("top-left"), right: marginSelector("top-right") },
  },
  check: (r) => {
    const left = nodes(r, "left")[0];
    const right = nodes(r, "right")[0];
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(left?.width).toBeGreaterThan(0);
    expect((left?.left ?? 0) + (left?.width ?? 0)).toBeLessThanOrEqual((right?.left ?? 0) + 1);
    expect((right?.left ?? 0) + (right?.width ?? 0)).toBeLessThanOrEqual(321);
  },
});

for (const [id, amount] of [
  ["target-page-increment-negative", -1],
  ["target-page-increment-positive", 2],
  ["target-page-increment-zero", 0],
] as const) {
  add({
    id,
    title: "unsupported page-counter increments warn while references use global pages",
    input: {
      html: `<p class="ref"><a href="#destination">See sheet</a></p><h2 id="destination" style="break-before:page">${token(0)}</h2>`,
      css: `@page { counter-increment:page ${amount}; } .ref::after { content:target-counter(attr(href),page); }`,
      selectors: { probe: '[data-imposia-generated="target-counter"]' },
    },
    check: (r) => {
      warning(r, "PAGE_RULE_UNSUPPORTED", "counter-increment");
      expect(nodes(r).map((n) => n.text)).toEqual(["2"]);
    },
  });
}
for (const colon of [":", "::"]) {
  add({
    id: colon === ":" ? "target-legacy-pseudo" : "target-page-reference",
    title:
      colon === ":"
        ? "unsupported legacy target pseudo syntax warns instead of creating a reference"
        : "local references resolve to the target's committed page",
    input: {
      html: `<p class="ref"><a href="#destination">See sheet</a></p><h2 id="destination" style="break-before:right">${token(0)}</h2>`,
      css: `.ref${colon}after { content:target-counter(attr(href),page); }`,
      selectors: { probe: '[data-imposia-generated="target-counter"]' },
    },
    check: (r) => {
      if (colon === ":") {
        warning(r, "UNSUPPORTED_LAYOUT");
        expect(nodes(r)).toEqual([]);
      } else {
        expect(nodes(r).map((n) => n.text)).toEqual(["3"]);
      }
    },
  });
}
add({
  id: "target-title-reference",
  title: "target-text resolves authored heading content without dropping its inline text",
  input: {
    html: '<p class="ref"><a href="#heading">Title</a></p><h2 id="heading" style="break-before:page">Field <em>guide</em></h2>',
    css: ".ref::after { content:target-text(attr(href),content); }",
    selectors: { probe: '[data-imposia-generated="target-text"]' },
  },
  check: (r) => expect(nodes(r).map((n) => n.text)).toEqual(["Field guide"]),
});

add({
  id: "running-strings",
  title: "first, start, last and attribute strings follow page-local source changes",
  input: {
    html: '<h1 data-chapter>Morning</h1><p style="break-before:page">Opening</p><h1 data-chapter>Evening</h1><p data-edition="Second edition">Edition</p>',
    css: "@page { @top-left { content:string(chapter,first); } @top-center { content:string(chapter,start); } @top-right { content:string(chapter,last); } @bottom-center { content:string(edition,last); } } [data-chapter] { string-set:chapter content(); } [data-edition] { string-set:edition attr(data-edition); }",
  },
  check: (r) => {
    expect(boxTexts(r, "top-left")).toEqual(["Morning", "Evening"]);
    expect(boxTexts(r, "top-center")).toEqual(["Morning", "Morning"]);
    expect(boxTexts(r, "top-right")).toEqual(["Morning", "Evening"]);
    expect(boxTexts(r)).toEqual(["", "Second edition"]);
  },
});

const noteSelectors = {
  probe: "[data-imposia-footnote]",
  calls: "[data-imposia-footnote-call]",
  markers: "[data-imposia-footnote-marker]",
  areas: "[data-imposia-footnote-area]",
};
const note = (n: number, body = `Note body ${n}`) =>
  `<span data-footnote-anchor="n${n}">Anchor ${n}</span><aside data-footnote="n${n}">${body}</aside>`;
const noteCss = "[data-footnote] { float:footnote; }";
const noteOptions = { experimental: { footnotes: true } };
for (const [id, count, extraCss, separatePages] of [
  ["notes-basic", 2, "", false],
  ["notes-display-block", 2, "[data-footnote] { footnote-display:block; }", false],
  ["notes-policy-auto", 2, "[data-footnote] { footnote-policy:auto; }", false],
  ["notes-counter-sequence", 3, "", false],
  ["notes-counter-custom-reset", 2, "body { counter-reset:footnote 7; }", false],
  ["notes-counter-page-reset", 2, "@page { counter-reset:footnote; }", true],
  ["notes-final-page", 2, "", true],
  ["notes-padding", 2, "[data-footnote] { padding:4px; }", false],
  ["notes-anchor-placement", 2, "", true],
  ["notes-same-line", 3, "", false],
  ["notes-body-styles", 2, "[data-footnote] { color:rgb(110,30,70); }", false],
] as const) {
  add({
    id,
    title: "opt-in notes preserve bodies and ordered call/marker pairs within page bounds",
    input: {
      html: Array.from(
        { length: count },
        (_, i) =>
          `${separatePages && i ? '<p style="break-before:page">Next sheet</p>' : ""}${note(i + 1)}`,
      ).join(""),
      css: noteCss + extraCss,
      options: noteOptions,
      selectors: noteSelectors,
    },
    check: (r) => {
      const expected = Array.from(
        { length: count },
        (_, i) => `${i + 1 + (id === "notes-counter-custom-reset" ? 7 : 0)}`,
      );
      expect(nodes(r, "calls").map((n) => n.text.trim())).toEqual(expected);
      expect(nodes(r, "markers").map((n) => n.text.trim())).toEqual(expected);
      expect(nodes(r)).toHaveLength(count);
      nodes(r).forEach((n, i) => {
        expect(n.text).toContain(`Note body ${i + 1}`);
        expect(n.page).toBeGreaterThanOrEqual(nodes(r, "calls")[i]?.page ?? 0);
        if (id === "notes-body-styles") expect(n.style.color).toBe("rgb(110, 30, 70)");
        if (id === "notes-padding") expect(n.style["padding-top"]).toBe("4px");
      });
      for (const area of nodes(r, "areas")) {
        expect(area.top).toBeGreaterThan(200);
        expect(area.top + area.height).toBeLessThanOrEqual(421);
      }
      if (separatePages) expect(nodes(r).at(-1)?.page).toBe(2);
      if (id === "notes-counter-page-reset") warning(r, "PAGE_RULE_UNSUPPORTED", "counter-reset");
    },
  });
}

add({
  id: "default-document",
  title: "a minimal document produces one complete visible page",
  input: { html: `<p data-probe>${token(0)}</p>`, selectors: { probe: "[data-probe]" } },
  check: (r) => {
    expect(r.pages).toHaveLength(1);
    expect(nodes(r)).toHaveLength(1);
    expect(nodes(r)[0]?.height).toBeGreaterThan(0);
    expect(r.warnings).toEqual([]);
  },
});
add({
  id: "filter-authored-script",
  title: "authored scripts are removed without execution or loss of surrounding content",
  input: {
    html: `<p>${token(0)}</p><script>window.topicScriptRan=true</script><p>${token(1)}</p>`,
    selectors: { probe: "script" },
  },
  check: (r) => {
    expect(nodes(r)).toEqual([]);
    expect(r.scriptRan).toBe(false);
  },
});
add({
  id: "filter-hidden-break",
  title: "display:none content cannot introduce a forced page break",
  input: {
    html: `<p>${token(0)}</p><div style="display:none;break-before:page">Hidden</div><p>${token(1)}</p>`,
  },
  check: (r) => expect(r.pages).toHaveLength(1),
});
for (const [id, selector, expected] of [
  ["selector-adjacent-sibling", "h2 + p", ["rgb(15, 90, 40)", "rgb(0, 0, 0)"]],
  ["selector-nth-of-type", "p:nth-of-type(2)", ["rgb(0, 0, 0)", "rgb(15, 90, 40)"]],
] as const) {
  add({
    id,
    title: "authored structural selectors retain their intended sibling matches",
    input: {
      html: `<h2>${token(0)}</h2><p>${token(1)}</p><p>${token(2)}</p>`,
      css: `p {color:black} ${selector} { color:rgb(15,90,40); }`,
      selectors: { probe: "p" },
    },
    check: (r) => expect(nodes(r).map((n) => n.style.color)).toEqual(expected),
  });
}
add({
  id: "generated-content-none",
  title: "content:none wins the pseudo-element cascade",
  input: {
    html: `<p class="label">${token(0)}</p>`,
    css: '.label::before {content:"unwanted"} .label::before {content:none}',
    selectors: { probe: ".label" },
  },
  check: (r) => expect(nodes(r)[0]?.before).toBe("none"),
});
add({
  id: "extension-page-decoration",
  title: "a supported extension decorates every completed page",
  input: { html: sheets(2), decorate: true, selectors: { probe: "[data-imposia-page-header]" } },
  check: (r) =>
    expect(nodes(r).map((n) => n.text.trim())).toEqual(["Reviewed sheet", "Reviewed sheet"]),
});
add({
  id: "asset-data-url-policy",
  title: "data-URL pseudo images cannot bypass the asset resolver",
  input: {
    html: `<p class="icon">${token(0)}</p>`,
    css: '.icon::before { content:url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E"); }',
    selectors: { probe: ".icon" },
  },
  check: (r) => {
    warning(r, "RESOURCE_BLOCKED");
    expect(nodes(r)[0]?.before).not.toContain("data:");
  },
});
add({
  id: "stylesheet-import-order",
  title: "resolved stylesheet imports participate in the authored cascade in order",
  input: {
    html: `<p class="sample">${token(0)}</p>`,
    css: '@import url("https://assets.invalid/one.css"); @import url("https://assets.invalid/two.css");',
    assets: {
      "https://assets.invalid/one.css": ".sample { color:rgb(10,20,30); font-weight:700; }",
      "https://assets.invalid/two.css": ".sample { color:rgb(40,50,60); }",
    },
    selectors: { probe: ".sample" },
  },
  check: (r) => {
    expect(r.assetRequests).toEqual(
      expect.arrayContaining(["https://assets.invalid/one.css", "https://assets.invalid/two.css"]),
    );
    expect(nodes(r)[0]?.style.color).toBe("rgb(40, 50, 60)");
    expect(nodes(r)[0]?.style["font-weight"]).toBe("700");
  },
});
add({
  id: "running-header-not-duplicated",
  title: "repeated header templates appear once per sheet and never enter the body",
  input: {
    html: sheets(3),
    options: { headerTemplate: "Notebook" },
    selectors: { probe: "[data-imposia-page-header]" },
  },
  check: (r) => {
    expect(nodes(r).map((n) => n.text.trim())).toEqual(["Notebook", "Notebook", "Notebook"]);
    for (const p of r.pages) expect(p.text).not.toContain("Notebook");
  },
});
add({
  id: "counter-roman-recovery",
  title: "unsupported page counter formats produce a warning instead of claiming roman output",
  input: {
    html: sheets(2),
    css: "@page { @bottom-center { content:counter(page,lower-roman); } }",
  },
  check: (r) => warning(r, "PAGE_RULE_UNSUPPORTED"),
});
add({
  id: "complete-final-content",
  title: "pagination reaches a uniquely marked final paragraph after many fragments",
  input: {
    html: `${paragraphs(73)}<p data-end>${token(73)}</p>`,
    selectors: { probe: "[data-end]" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(6);
    expect(nodes(r)).toHaveLength(1);
    expect(nodes(r)[0]?.page).toBe(r.pages.length);
  },
});
add({
  id: "empty-document",
  title: "an empty source produces a usable empty page without runaway allocation",
  input: { html: " \n <!-- empty --> " },
  check: (r) => {
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]?.text.trim()).toBe("");
  },
});
add({
  id: "wrapper-height-continuity",
  title: "a minimum-height wrapper does not prevent its overflowing children from continuing",
  input: { html: `<article style="min-height:100px">${paragraphs(24)}</article>` },
  check: (r) => {
    expect(r.pages).toHaveLength(3);
    expect(r.pages.at(-1)?.text).toContain(token(23));
  },
});

for (const [id, html, selector] of [
  ["math-semantic-markup", "<math><mrow><mi>x</mi><mo>+</mo><mn>2</mn></mrow></math>", "math"],
  [
    "math-pre-rendered-markup",
    '<span class="formula"><span>x</span><sup>2</sup><span> + 1</span></span>',
    ".formula",
  ],
] as const) {
  add({
    id,
    title:
      "static mathematical content survives sanitization and pagination without script execution",
    input: { html: `<p>${token(0)}</p>${html}<p>${token(1)}</p>`, selectors: { probe: selector } },
    check: (r) => {
      expect(nodes(r)).toHaveLength(1);
      expect(nodes(r)[0]?.text).toContain("x");
      expect(nodes(r)[0]?.height).toBeGreaterThan(0);
    },
  });
}
for (const [id, condition, expected] of [
  ["media-nonvisual-ignored", "speech", "rgb(0, 0, 0)"],
  ["media-print-styling", "print", "rgb(20, 80, 120)"],
  ["media-screen-styling", "screen", "rgb(20, 80, 120)"],
] as const) {
  add({
    id,
    title: "media-qualified authored styles follow the browser publishing contract",
    input: {
      html: `<p>${token(0)}</p>`,
      css: `p { color:black; } @media ${condition} { p { color:rgb(20,80,120); } }`,
      media: condition === "print" ? "print" : "screen",
      selectors: { probe: "p" },
    },
    check: (r) => expect(nodes(r)[0]?.style.color).toBe(expected),
  });
}
add({
  id: "stylesheet-source-order",
  title: "scattered style elements retain source-order cascade after content splitting",
  input: {
    html: `<style>.sample{color:rgb(90,10,20)}</style><p class="sample">${token(0)}</p>
      <style>.sample{color:rgb(30,100,60)}</style><p class="sample" style="break-before:page">${token(1)}</p>
      <style>.sample{color:rgb(50,70,110)}</style>`,
    selectors: { probe: ".sample" },
  },
  check: (r) =>
    expect(nodes(r).map((n) => n.style.color)).toEqual(["rgb(50, 70, 110)", "rgb(50, 70, 110)"]),
});
