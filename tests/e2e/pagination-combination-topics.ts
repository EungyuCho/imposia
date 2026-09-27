import { expect } from "@playwright/test";
import {
  nodes,
  type PaginationTopic,
  paragraphs,
  sheets,
  token,
  warning,
} from "./pagination-topic-support.js";

export const combinationTopics: PaginationTopic[] = [];
const add = (topic: PaginationTopic) => combinationTopics.push(topic);
const noteOptions = { experimental: { footnotes: true } };
const noteSelectors = {
  notes: "[data-imposia-footnote]",
  calls: "[data-imposia-footnote-call]",
  markers: "[data-imposia-footnote-marker]",
};
const assertNote = (r: Parameters<PaginationTopic["check"]>[0]) => {
  expect(r.publishingOverlaps).toEqual([]);
  expect(r.warnings.map((w) => w.code)).not.toContain("UNSUPPORTED_LAYOUT");
  expect(nodes(r, "notes")).toHaveLength(1);
  expect(nodes(r, "calls")).toHaveLength(1);
  expect(nodes(r, "markers").map((n) => n.text)).toEqual(["1"]);
  expect(nodes(r, "notes")[0]?.page).toBe(nodes(r, "calls")[0]?.page);
  expect(nodes(r, "notes")[0]?.text).toContain("Annotation body");
};
for (const span of ["rowspan", "colspan"] as const) {
  const rows = Array.from(
    { length: 12 },
    (_, i) =>
      `<tr><td ${span === "rowspan" && i === 4 ? 'rowspan="2"' : span === "colspan" && i === 4 ? 'colspan="2"' : ""}>${token(i)}${i === 4 ? '<span data-footnote-anchor="a">Claim</span><aside data-footnote="a">Annotation body</aside>' : ""}</td>${(span === "rowspan" && i === 5) || (span === "colspan" && i === 4) ? "" : "<td>Value</td>"}</tr>`,
  ).join("");
  add({
    id: `combo-table-${span}-note`,
    title: `table ${span}, repeated headers and a bounded note preserve content and associations`,
    input: {
      html: `<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`,
      css: "tbody tr {height:55px} [data-footnote] {float:footnote;font-size:8px;line-height:10px}",
      options: noteOptions,
      inspectPublishingOverlaps: true,
      selectors: { ...noteSelectors, probe: "table", headers: "thead" },
    },
    check: (r) => {
      expect(r.pages.length).toBeGreaterThan(1);
      expect(nodes(r, "headers")).toHaveLength(nodes(r).length);
      assertNote(r);
    },
  });
}
for (const decoration of ["clone", "slice"] as const) {
  add({
    id: `combo-decorated-wrapper-${decoration}`,
    title: `${decoration} decorations use correct block edges through wrapper fragmentation`,
    input: {
      html: `<article class="frame">${paragraphs(16, 50)}</article>`,
      css: `.frame {padding:10px 8px;border:2px solid rgb(30,60,90);box-decoration-break:${decoration}}`,
      selectors: { probe: ".frame", children: ".frame p" },
    },
    check: (r) => {
      const fragments = nodes(r);
      expect(fragments.length).toBeGreaterThan(1);
      fragments.forEach((n, i) => {
        expect(n.top + n.height).toBeLessThanOrEqual(421);
        expect(n.style["padding-top"]).toBe(decoration === "clone" || i === 0 ? "10px" : "0px");
        expect(n.style["padding-bottom"]).toBe(
          decoration === "clone" || i === fragments.length - 1 ? "10px" : "0px",
        );
        expect(n.style["border-top-width"]).toBe(decoration === "clone" || i === 0 ? "2px" : "0px");
        expect(n.style["border-bottom-width"]).toBe(
          decoration === "clone" || i === fragments.length - 1 ? "2px" : "0px",
        );
      });
      for (const child of nodes(r, "children")) {
        const parent = fragments.find((n) => n.page === child.page);
        expect(parent).toBeDefined();
        expect(child.left).toBeCloseTo(30, 0);
        expect(child.top + child.height).toBeLessThanOrEqual(
          (parent?.top ?? 0) + (parent?.height ?? 0),
        );
      }
    },
  });
}
add({
  id: "combo-forced-break-margin",
  title: "a forced break retains the following block's authored top margin",
  input: {
    html: `<p>${token(0)}</p><p class="next">${token(1)}</p>`,
    css: ".next {break-before:page;margin-top:24px}",
    selectors: { probe: ".next" },
  },
  check: (r) => {
    expect(nodes(r)[0]?.page).toBe(2);
    expect(nodes(r)[0]?.top).toBeCloseTo(44, 0);
  },
});
for (const where of ["before", "after"] as const) {
  add({
    id: `combo-absolute-${where}-break`,
    title: `absolute decoration ${where} a forced break stays once on its containing fragment`,
    input: {
      html: `<section class="relative">${where === "before" ? '<aside class="badge">Badge</aside>' : ""}<p>${token(0)}</p><p style="break-before:page">${token(1)}</p>${where === "after" ? '<aside class="badge">Badge</aside>' : ""}</section>`,
      css: `.relative {position:relative} .badge {position:absolute;${where === "before" ? "top" : "bottom"}:4px;right:6px;width:50px;height:12px;font-size:8px;line-height:12px}`,
      selectors: { probe: ".badge", parent: ".relative" },
    },
    check: (r) => {
      expect(nodes(r)).toHaveLength(1);
      expect(nodes(r)[0]?.page).toBe(where === "before" ? 1 : 2);
      expect(nodes(r)[0]?.top).toBeCloseTo(24, 0);
      expect(nodes(r)[0]?.left).toBeCloseTo(244, 0);
      expect(nodes(r, "parent")).toHaveLength(2);
    },
  });
}
add({
  id: "combo-relative-offset-flow",
  title: "relative offsets preserve source flow spacing through forced breaks",
  input: {
    html: `<section>${sheets(3)}</section>`,
    css: "section p {position:relative;top:7px;left:9px}",
    selectors: { probe: "p" },
  },
  check: (r) => {
    expect(nodes(r).map((n) => n.page)).toEqual([1, 2, 3]);
    for (const n of nodes(r)) {
      expect(n.top).toBeCloseTo(27, 0);
      expect(n.left).toBeCloseTo(29, 0);
    }
  },
});
for (const prefix of [350, 390]) {
  add({
    id: `combo-ruby-boundary-${prefix}`,
    title: "ruby bases and annotations stay paired at a tight page boundary",
    input: {
      html: `<p style="height:${prefix}px">Opening</p><p class="ruby-line" lang="ja"><ruby><span>${token(0)}</span><rt>よみ</rt></ruby></p><p>${token(1)}</p>`,
      css: ".ruby-line {font-size:16px;line-height:40px} rt {font-size:8px}",
      selectors: { probe: "ruby", base: "ruby span", annotation: "ruby rt" },
    },
    check: (r) => {
      expect(nodes(r)).toHaveLength(1);
      expect(nodes(r, "base")[0]?.text).toBe(token(0));
      expect(nodes(r, "annotation")[0]?.text).toBe("よみ");
      expect(nodes(r, "annotation")[0]?.page).toBe(nodes(r, "base")[0]?.page);
      for (const n of [...nodes(r, "base"), ...nodes(r, "annotation")]) {
        expect(n.top).toBeGreaterThanOrEqual(19);
        expect(n.top + n.height).toBeLessThanOrEqual(421);
      }
      expect(nodes(r)[0]?.page).toBe(prefix === 350 ? 1 : 2);
    },
  });
}
add({
  id: "combo-ruby-repeated-boundaries",
  title: "many ruby pairs survive repeated line and page breaks in source order",
  input: {
    html: `<p lang="ja">${Array.from({ length: 45 }, (_, i) => `<ruby><span>${token(i)}</span><rt>reading-${i}</rt></ruby><br>`).join("")}</p>`,
    css: "ruby {font-size:16px} rt {font-size:8px} p {line-height:30px}",
    selectors: { probe: "ruby", annotation: "rt" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(nodes(r)).toHaveLength(45);
    expect(nodes(r, "annotation").map((n) => n.text)).toEqual(
      Array.from({ length: 45 }, (_, i) => `reading-${i}`),
    );
    nodes(r).forEach((n, i) => {
      expect(n.text).toBe(`${token(i)}reading-${i}`);
      expect(n.page).toBe(nodes(r, "annotation")[i]?.page);
      const annotation = nodes(r, "annotation")[i];
      expect(annotation?.top).toBeGreaterThanOrEqual(19);
      expect((annotation?.top ?? 0) + (annotation?.height ?? 0)).toBeLessThanOrEqual(421);
    });
  },
});
for (const side of ["left", "right"]) {
  add({
    id: `combo-float-clear-${side}`,
    title: `${side} float and cleared text move together at the bottom of a sheet`,
    input: {
      html: `<p style="height:350px">Opening</p><section class="card"><aside class="float">Figure</aside><p>${token(0)}</p><p class="clear">${token(1)}</p></section><p>${token(2)}</p>`,
      css: `.card {display:flow-root;break-inside:avoid}.float {float:${side};width:80px;height:60px}.clear {clear:both}`,
      selectors: { probe: ".float", cleared: ".clear" },
    },
    check: (r) => {
      expect(nodes(r)[0]?.page).toBe(2);
      expect(nodes(r, "cleared")[0]?.page).toBe(2);
      expect(nodes(r, "cleared")[0]?.top).toBeGreaterThanOrEqual(
        (nodes(r)[0]?.top ?? 0) + (nodes(r)[0]?.height ?? 0) - 1,
      );
    },
  });
}
add({
  id: "combo-note-bottom-float",
  title: "a page-bottom float and footnote occupy disjoint bounded areas",
  input: {
    html: `<p><span data-footnote-anchor="a">Claim</span></p><aside data-footnote="a">Annotation body</aside><aside class="chart">Chart</aside><p>${token(0)}</p>`,
    css: "[data-footnote] {float:footnote}.chart {float:bottom;float-reference:page;height:50px}",
    options: { experimental: { footnotes: true, pageFloats: true } },
    inspectPublishingOverlaps: true,
    selectors: { ...noteSelectors, probe: "[data-imposia-page-float]" },
  },
  check: (r) => {
    assertNote(r);
    expect(nodes(r)).toHaveLength(1);
    const note = nodes(r, "notes")[0];
    const chart = nodes(r)[0];
    expect(note?.page).toBe(chart?.page);
    expect((chart?.top ?? 0) + (chart?.height ?? 0)).toBeLessThanOrEqual(note?.top ?? 0);
  },
});
add({
  id: "combo-multicol-note",
  title: "bounded multi-column content preserves a nested note and its call",
  input: {
    html: `<section class="columns"><p><span data-footnote-anchor="a">Claim</span></p><aside data-footnote="a">Annotation body</aside>${paragraphs(12, 40)}</section>`,
    css: ".columns {height:240px;column-count:2;column-fill:auto;column-gap:20px;margin:0}[data-footnote] {float:footnote}",
    options: noteOptions,
    inspectPublishingOverlaps: true,
    selectors: { ...noteSelectors, probe: ".columns" },
  },
  check: (r) => {
    expect(nodes(r).length).toBeGreaterThan(1);
    assertNote(r);
  },
});
add({
  id: "combo-multicol-float-recovery",
  title: "an overflowing unsupported multicol float stays atomic with a located diagnostic",
  recovery: true,
  input: {
    html: `<section class="columns"><aside class="float">Figure</aside>${paragraphs(18, 50)}</section>`,
    css: ".columns {height:200px;column-count:2;column-fill:auto;column-gap:20px;margin:0}.float {float:left;width:70px;height:50px}",
    selectors: { probe: ".columns" },
  },
  check: (r) => {
    warning(r, "UNSUPPORTED_LAYOUT");
    expect(nodes(r)).toHaveLength(1);
  },
});
for (const important of [false, true]) {
  add({
    id: `combo-cascade-layers-${important ? "important" : "normal"}`,
    title: "layer precedence remains stable on fragmented descendants",
    input: {
      html: `<section class="chapter">${paragraphs(13, 40)}</section>`,
      css: `@layer base, theme; @layer base {.chapter p {color:rgb(90,20,30)${important ? " !important" : ""}}} @layer theme {.chapter p {color:rgb(20,80,40)${important ? " !important" : ""}}}`,
      selectors: { probe: ".chapter p" },
    },
    check: (r) => {
      expect(r.pages.length).toBeGreaterThan(1);
      for (const n of nodes(r))
        expect(n.style.color).toBe(important ? "rgb(90, 20, 30)" : "rgb(20, 80, 40)");
    },
  });
}
add({
  id: "combo-css-nesting-variables",
  title: "nested selectors and inherited variables survive wrapper continuation",
  input: {
    html: `<section class="chapter">${paragraphs(13, 40)}</section>`,
    css: ".chapter {--ink:rgb(60,30,90); & > p {color:var(--ink)}}",
    selectors: { probe: "p" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    for (const n of nodes(r)) expect(n.style.color).toBe("rgb(60, 30, 90)");
  },
});
for (const [unit, height] of [
  ["rem", 40],
  ["lh", 50],
  ["rlh", 42],
] as const) {
  add({
    id: `combo-relative-unit-${unit}`,
    title: `${unit} with calc and custom properties preserves geometry across fragments`,
    input: {
      html: `<section>${Array.from({ length: 22 }, (_, i) => `<p class="measure">${token(i)}</p>`).join("")}</section>`,
      css: `html {font-size:10px;line-height:16px}.measure {--row:2${unit};height:calc(var(--row) + ${unit === "rem" ? "20px" : "10px"});line-height:20px}`,
      selectors: { probe: ".measure" },
    },
    check: (r) => {
      expect(r.pages.length).toBeGreaterThan(1);
      for (const n of nodes(r)) expect(n.height).toBeCloseTo(height, 0);
    },
  });
}
add({
  id: "combo-full-table-note-recovery",
  title: "a note in a fixed-height table row never covers the last row's text",
  input: {
    html: `<table><tbody>${Array.from({ length: 8 }, (_, i) => `<tr><td>${token(i)}${i === 0 ? '<span data-footnote-anchor="a">Claim</span><aside data-footnote="a">Annotation body</aside>' : ""}</td><td>Row detail ${i}</td></tr>`).join("")}</tbody></table>`,
    css: "tr {height:50px} td:last-child {vertical-align:bottom}[data-footnote] {float:footnote;line-height:15px;font-size:8px}",
    options: noteOptions,
    inspectPublishingOverlaps: true,
    selectors: { ...noteSelectors, probe: "[data-footnote]" },
  },
  check: (r) => {
    expect(r.publishingOverlaps).toEqual([]);
    warning(r, "FOOTNOTE_DEFERRED");
    expect(nodes(r, "notes")).toEqual([]);
    expect(nodes(r, "calls")).toEqual([]);
    expect(nodes(r)).toHaveLength(1);
    expect(nodes(r)[0]?.text).toBe("Annotation body");
  },
});
add({
  id: "combo-full-multicol-note-recovery",
  title: "a note in a full-height multicol container does not cover column text",
  input: {
    html: `<section class="columns"><p><span data-footnote-anchor="a">Claim</span></p><aside data-footnote="a">Annotation body<br>Second line<br>Third line</aside>${paragraphs(19, 40)}</section>`,
    css: ".columns p {line-height:40px} .columns {height:400px;column-count:2;column-fill:auto;column-gap:20px;margin:0}[data-footnote] {float:footnote}",
    options: noteOptions,
    inspectPublishingOverlaps: true,
    selectors: { ...noteSelectors, probe: "[data-footnote]" },
  },
  check: (r) => {
    expect(r.publishingOverlaps).toEqual([]);
    warning(r, "FOOTNOTE_DEFERRED");
    expect(nodes(r, "notes")).toEqual([]);
    expect(nodes(r)).toHaveLength(1);
    expect(nodes(r)[0]?.text).toBe("Annotation bodySecond lineThird line");
  },
});
for (const side of ["top", "bottom"]) {
  add({
    id: `combo-multiple-page-floats-${side}`,
    title: `multiple ${side} page floats stack in source order without overlap`,
    input: {
      html: `<aside class="a">First figure</aside><aside class="b">Second figure</aside><p>${token(0)}</p>`,
      css: `.a,.b {float:${side};float-reference:page;height:30px}`,
      options: { experimental: { pageFloats: true } },
      inspectPublishingOverlaps: true,
      selectors: { probe: "[data-imposia-page-float]" },
    },
    check: (r) => {
      expect(nodes(r)).toHaveLength(2);
      expect(r.publishingOverlaps).toEqual([]);
      const sorted = [...nodes(r)].sort((a, b) => a.top - b.top);
      expect((sorted[0]?.top ?? 0) + (sorted[0]?.height ?? 0)).toBeLessThanOrEqual(
        sorted[1]?.top ?? 0,
      );
    },
  });
}
add({
  id: "combo-note-cascade-specificity",
  title: "a more specific normal float declaration suppresses a generic footnote placement",
  input: {
    html: '<p><span data-footnote-anchor="a">Claim</span></p><aside class="normal" data-footnote="a">Annotation body</aside>',
    css: "aside.normal {float:none} aside {float:footnote}",
    options: noteOptions,
    selectors: { ...noteSelectors, probe: "aside" },
  },
  check: (r) => {
    expect(nodes(r, "notes")).toEqual([]);
    expect(nodes(r, "calls")).toEqual([]);
    expect(nodes(r)[0]?.text).toBe("Annotation body");
    expect(r.warnings).toEqual([]);
  },
});
add({
  id: "combo-note-cascade-important",
  title: "important float:none wins over a later experimental footnote declaration",
  input: {
    html: '<p><span data-footnote-anchor="a">Claim</span></p><aside data-footnote="a">Annotation body</aside>',
    css: "aside {float:none!important} aside {float:footnote}",
    options: noteOptions,
    selectors: noteSelectors,
  },
  check: (r) => {
    expect(nodes(r, "notes")).toEqual([]);
    expect(nodes(r, "calls")).toEqual([]);
    expect(r.warnings).toEqual([]);
  },
});
for (const group of ["@media print", "@layer printRules", ".chapter"]) {
  add({
    id: `combo-publishing-conditional-${group.startsWith("@media") ? "media" : group.startsWith("@layer") ? "layer" : "nesting"}`,
    title:
      "unsupported conditional publishing declarations warn instead of applying outside their context",
    input: {
      html: '<h2>Heading</h2><p><span data-footnote-anchor="a">Claim</span></p><aside data-footnote="a">Annotation body</aside>',
      css: `${group} {h2 {string-set:chapter content()} aside {float:footnote}} @page {@top-center {content:string(chapter)}}`,
      options: noteOptions,
      selectors: noteSelectors,
    },
    check: (r) => {
      warning(r, "UNSUPPORTED_LAYOUT");
      expect(nodes(r, "notes")).toEqual([]);
      expect(nodes(r, "calls")).toEqual([]);
      expect(r.pages.map((p) => p.boxes["top-center"] ?? "")).toEqual([""]);
    },
  });
}
for (const [name, css, inline, placed] of [
  ["stylesheet-important", "aside {float:footnote!important}", "float:none", true],
  ["inline-important", "aside {float:footnote!important}", "float:none!important", false],
  ["selector-list", "#absent,aside {float:footnote} .normal {float:none}", "", false],
  ["same-rule", "aside {float:none!important;float:footnote}", "", false],
] as const) {
  add({
    id: `combo-note-cascade-${name}`,
    title: `${name} preserves authored placement precedence`,
    input: {
      html: `<p><span data-footnote-anchor="a">Claim</span></p><aside class="normal" data-footnote="a" style="${inline}">Annotation body</aside>`,
      css,
      options: noteOptions,
      inspectPublishingOverlaps: true,
      selectors: noteSelectors,
    },
    check: (r) => {
      if (placed) assertNote(r);
      else {
        expect(nodes(r, "notes")).toEqual([]);
        expect(nodes(r, "calls")).toEqual([]);
      }
      expect(r.warnings).toEqual([]);
    },
  });
}
for (const [name, css, inline] of [
  ["specificity", 'h2.title {string-set:chapter "Correct"} h2 {string-set:chapter "Wrong"}', ""],
  ["important", 'h2 {string-set:chapter "Correct"!important}', 'string-set:chapter "Wrong"'],
] as const) {
  add({
    id: `combo-string-cascade-${name}`,
    title: `named strings honor ${name} through pagination`,
    input: {
      html: `<h2 class="title" style='${inline}'>Heading</h2>${paragraphs(22, 40)}`,
      css: `${css} @page {@top-center {content:string(chapter)}}`,
    },
    check: (r) => {
      expect(r.pages.length).toBeGreaterThan(1);
      expect(r.pages.map((p) => p.boxes["top-center"])).toEqual(r.pages.map(() => "Correct"));
      expect(r.warnings).toEqual([]);
    },
  });
}
for (const kind of ["relative", "absolute"] as const) {
  add({
    id: `combo-${kind}-visual-overflow`,
    title: `${kind} visual overflow preserves normal-flow page membership`,
    recovery: true,
    input: {
      html:
        kind === "relative"
          ? paragraphs(10, 40)
          : `<section class="containing">${paragraphs(10, 40)}<aside class="decoration">Decoration</aside></section>`,
      css:
        kind === "relative"
          ? "p:last-child {position:relative;top:15px}"
          : ".containing {position:relative;height:400px}.decoration {position:absolute;bottom:-30px;height:20px}",
      selectors: { probe: "p" },
    },
    check: (r) => {
      expect(r.pages).toHaveLength(1);
      expect(r.warnings.map((w) => w.code)).not.toContain("PAGE_OVERFLOW");
      expect(nodes(r)).toHaveLength(10);
      expect(nodes(r).map((n) => n.page)).toEqual(Array(10).fill(1));
    },
  });
}
for (const inline of [false, true])
  add({
    id: `combo-note-native-float-${inline ? "inline" : "rule"}`,
    title: "a winning publishing float cancels a losing native float",
    input: {
      html: `<p><span data-footnote-anchor="a">Claim</span></p><aside class="note" data-footnote="a" ${inline ? 'style="float:footnote"' : ""}>Annotation body</aside>`,
      css: `aside {float:right;width:40%} ${inline ? "" : ".note {float:footnote}"}`,
      options: noteOptions,
      inspectPublishingOverlaps: true,
      selectors: noteSelectors,
    },
    check: (r) => {
      assertNote(r);
      expect(nodes(r, "notes")[0]?.style.float).toBe("none");
    },
  });
for (const value of ["part content()", "none"])
  add({
    id: `combo-string-property-${value === "none" ? "none" : "replacement"}`,
    title: "one winning string-set declaration replaces the whole property",
    input: {
      html: '<h2 class="part">Heading</h2>',
      css: `h2 {string-set:chapter content()} h2.part {string-set:${value}} @page {@top-left {content:string(chapter)} @top-right {content:string(part)}}`,
    },
    check: (r) => {
      expect(r.warnings).toEqual([]);
      expect(r.pages[0]?.boxes["top-left"] ?? "").toBe("");
      expect(r.pages[0]?.boxes["top-right"] ?? "").toBe(value === "none" ? "" : "Heading");
    },
  });
add({
  id: "combo-table-border-note-recovery",
  title: "a note cannot cover the painted border of a full-height table",
  input: {
    html: `<table><tbody>${Array.from({ length: 8 }, (_, i) => `<tr><td>${token(i)}${i === 0 ? '<span data-footnote-anchor="a">Claim</span><aside data-footnote="a">Annotation body</aside>' : ""}</td></tr>`).join("")}</tbody></table>`,
    css: "tr {height:49px} td {vertical-align:top;border-bottom:2px solid} [data-footnote] {float:footnote;font-size:8px;line-height:15px}",
    options: noteOptions,
    selectors: { ...noteSelectors, probe: "[data-footnote]" },
  },
  check: (r) => {
    warning(r, "FOOTNOTE_DEFERRED");
    expect(nodes(r, "notes")).toEqual([]);
    expect(nodes(r)).toHaveLength(1);
    expect(nodes(r)[0]?.text).toBe("Annotation body");
  },
});
