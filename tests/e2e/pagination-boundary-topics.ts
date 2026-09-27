import { expect } from "@playwright/test";
import {
  boxTexts,
  nodes,
  type PaginationTopic,
  token,
  warning,
} from "./pagination-topic-support.js";

export const boundaryTopics: PaginationTopic[] = [];
const add = (topic: PaginationTopic) => boundaryTopics.push(topic);

add({
  id: "strings-combined-binding-recovery",
  title: "unsupported combined string bindings warn rather than publish invented values",
  input: {
    html: '<h2 data-subtitle="Survey">Notebook</h2>',
    css: "h2 { string-set:title content(), subtitle attr(data-subtitle); } @page { @top-left { content:string(title); } @top-right { content:string(subtitle); } }",
  },
  check: (r) => {
    warning(r, "UNSUPPORTED_LAYOUT");
    expect(boxTexts(r, "top-left")).toEqual([""]);
    expect(boxTexts(r, "top-right")).toEqual([""]);
  },
});
add({
  id: "strings-first-except-recovery",
  title: "unsupported first-except string selection is diagnosed",
  input: {
    html: '<h2>Notebook</h2><p style="break-before:page">Continuation</p>',
    css: "h2 { string-set:title content(); } @page { @top-center { content:string(title,first-except); } }",
  },
  check: (r) => {
    warning(r, "PAGE_RULE_UNSUPPORTED");
    expect(boxTexts(r, "top-center")).toEqual(["", ""]);
  },
});

for (const mode of ["first-letter", "before", "after"]) {
  add({
    id: `target-text-${mode}-recovery`,
    title: `unsupported target-text ${mode} mode warns without creating misleading text`,
    input: {
      html: '<p class="ref"><a href="#heading">Reference</a></p><h2 id="heading">Notebook</h2>',
      css: `.ref::after { content:target-text(attr(href),${mode}); } h2::before {content:"Chapter "} h2::after {content:" appendix"}`,
      selectors: { probe: '[data-imposia-generated="target-text"]' },
    },
    check: (r) => {
      warning(r, "UNSUPPORTED_LAYOUT");
      expect(nodes(r)).toEqual([]);
    },
  });
}

const noteSelectors = {
  probe: "[data-imposia-footnote]",
  calls: "[data-imposia-footnote-call]",
  paragraph: "[data-note-paragraph]",
};
const options = { experimental: { footnotes: true } };
for (const policy of ["line", "block"]) {
  add({
    id: `notes-policy-${policy}-boundary`,
    title: `${policy} note policy keeps the call with its note when the first sheet has no room`,
    input: {
      html: '<p style="height:350px">Opening</p><p data-note-paragraph><span data-footnote-anchor="a">Anchor</span><br>Second line</p><aside data-footnote="a">One note line<br>Another line<br>Last line</aside>',
      css: `[data-footnote] { float:footnote; footnote-policy:${policy}; }`,
      options,
      selectors: noteSelectors,
    },
    check: (r) => {
      expect(nodes(r)).toHaveLength(1);
      expect(nodes(r, "calls")).toHaveLength(1);
      expect(nodes(r, "calls")[0]?.page).toBe(nodes(r)[0]?.page);
      if (policy === "block") {
        expect(nodes(r, "paragraph")).toHaveLength(1);
        expect(nodes(r, "paragraph")[0]?.page).toBe(nodes(r)[0]?.page);
      }
    },
  });
}
const longNote = Array.from({ length: 150 }, (_, i) => `N${i} annotation`).join(" ");
add({
  id: "notes-oversized-recovery",
  title: "an oversized note falls back to source flow without losing or repeating its text",
  input: {
    html: `<p><span data-footnote-anchor="a">Anchor</span></p><aside data-footnote="a">${longNote}</aside><p>${token(0)}</p>`,
    css: "[data-footnote] {float:footnote}",
    options,
    selectors: { probe: "[data-imposia-footnote]" },
  },
  check: (r) => {
    warning(r, "FOOTNOTE_DEFERRED");
    expect(nodes(r)).toEqual([]);
    expect(
      r.pages
        .map((p) => p.text)
        .join(" ")
        .match(/N\d+/g),
    ).toEqual(Array.from({ length: 150 }, (_, i) => `N${i}`));
    expect(r.pages.length).toBeGreaterThan(1);
  },
});
add({
  id: "notes-custom-callout-style",
  title: "authored footnote-call styling reaches generated callouts",
  input: {
    html: '<p><span data-footnote-anchor="a">Anchor</span></p><aside data-footnote="a">Note body</aside>',
    css: "[data-footnote] {float:footnote} ::footnote-call {color:rgb(120,30,60);font-size:18px}",
    options,
    selectors: noteSelectors,
  },
  check: (r) => {
    expect(nodes(r, "calls")).toHaveLength(1);
    expect(nodes(r, "calls")[0]?.style.color).toBe("rgb(120, 30, 60)");
    expect(nodes(r, "calls")[0]?.style["font-size"]).toBe("18px");
  },
});
add({
  id: "notes-custom-counter-start",
  title: "an authored footnote counter reset changes both call and note numbers",
  input: {
    html: '<section><p><span data-footnote-anchor="a">First</span><span data-footnote-anchor="b">Second</span></p><aside data-footnote="a">Alpha</aside><aside data-footnote="b">Beta</aside></section>',
    css: "section {counter-reset:footnote 7} [data-footnote] {float:footnote}",
    options,
    selectors: { ...noteSelectors, markers: "[data-imposia-footnote-marker]" },
  },
  check: (r) => {
    expect(nodes(r, "calls").map((n) => n.text)).toEqual(["8", "9"]);
    expect(nodes(r, "markers").map((n) => n.text)).toEqual(["8", "9"]);
  },
});
const rawPre = Array.from({ length: 47 }, (_, i) => `  ${token(i)}  data`).join("\n");
add({
  id: "split-nonwrapping-pre",
  title: "a pre block with short lines preserves its exact nonwrapping text through pagination",
  input: {
    html: `<pre>${rawPre}</pre>`,
    css: "pre {white-space:pre;widows:1;orphans:1}",
    selectors: { probe: "pre" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(
      nodes(r)
        .map((n) => n.text)
        .join(""),
    ).toBe(rawPre);
    for (const n of nodes(r)) expect(n.style["white-space"]).toBe("pre");
  },
});
for (const [id, url] of [
  ["asset-data-url-unescaped", 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'],
  [
    "asset-data-url-base64",
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
  ],
] as const) {
  add({
    id,
    title: "alternate inline image URL forms obey the same resolver boundary",
    input: {
      html: `<p class="icon">${token(0)}</p>`,
      css: `.icon::before {content:url('${url}')}`,
      selectors: { probe: ".icon" },
    },
    check: (r) => {
      warning(r, "RESOURCE_BLOCKED");
      expect(nodes(r)[0]?.before).not.toContain("data:");
    },
  });
}

add({
  id: "split-reversed-list-values",
  title: "reversed lists retain explicit item values and descending continuation ordinals",
  input: {
    html: `<ol reversed>${Array.from({ length: 11 }, (_, i) => `<li ${i === 3 ? 'value="20"' : ""} style="height:60px">${token(i)}</li>`).join("")}</ol>`,
    selectors: { probe: "ol", items: "li" },
  },
  check: (r) => {
    expect(nodes(r, "items").map((n) => n.attrs.value)).toEqual([
      "11",
      "10",
      "9",
      "20",
      "19",
      "18",
      "17",
      "16",
      "15",
      "14",
      "13",
    ]);
    expect(nodes(r).map((n) => n.attrs.start)).toEqual(["11", "17"]);
  },
});
add({
  id: "break-avoid-forced-priority",
  title: "a forced boundary takes priority over adjacent avoidance",
  input: {
    html: `<p style="height:350px">${token(0)}</p><h2 style="break-after:avoid;height:40px">${token(1)}</h2><p style="break-before:page">${token(2)}</p>`,
    selectors: { probe: "h2", following: "p:last-child" },
  },
  check: (r) => {
    expect(nodes(r)[0]?.page).toBe(1);
    expect(nodes(r, "following").at(-1)?.page).toBe(2);
  },
});
add({
  id: "notes-scoped-pseudo-styles",
  title: "note selectors style their own calls and markers across ancestor boundaries",
  input: {
    html: '<p><span data-footnote-anchor="a">First</span><span data-footnote-anchor="b">Second</span></p><section><aside class="special" data-footnote="a">Alpha</aside><aside data-footnote="b">Beta</aside></section>',
    css: "[data-footnote] {float:footnote} ::footnote-call {color:rgb(20,40,60)} .special::footnote-call {color:rgb(120,30,60);font-size:18px} ::footnote-marker {color:rgb(40,100,60)}",
    options,
    selectors: { ...noteSelectors, markers: "[data-imposia-footnote-marker]" },
  },
  check: (r) => {
    expect(nodes(r, "calls").map((n) => n.style.color)).toEqual([
      "rgb(120, 30, 60)",
      "rgb(20, 40, 60)",
    ]);
    expect(nodes(r, "markers").map((n) => n.style.color)).toEqual([
      "rgb(40, 100, 60)",
      "rgb(40, 100, 60)",
    ]);
  },
});
add({
  id: "notes-inline-policy-boundary",
  title: "inline block policy keeps a call paragraph with its note",
  input: {
    html: '<p style="height:350px">Opening</p><p data-note-paragraph><span data-footnote-anchor="a">Anchor</span><br>Second line</p><aside data-footnote="a" style="float:footnote;footnote-policy:block">One<br>Two<br>Three</aside>',
    options,
    selectors: noteSelectors,
  },
  check: (r) => {
    expect(nodes(r, "calls")[0]?.page).toBe(2);
    expect(nodes(r)[0]?.page).toBe(2);
    expect(nodes(r, "paragraph")).toHaveLength(1);
  },
});
add({
  id: "fixed-nested-furniture",
  title: "fixed furniture retains selector styles, sheet offsets, and unique source IDs",
  input: {
    html: `<section class="chapter"><aside class="stamp" id="stamp"><b id="stamp-label">Sheet label</b></aside></section><p>${token(0)}</p><p style="break-before:page">${token(1)}</p>`,
    css: ".chapter .stamp {position:fixed;top:6px;right:8px;color:rgb(90,20,40);width:90px}",
    selectors: { probe: ".stamp", ids: "#stamp, #stamp-label" },
  },
  check: (r) => {
    expect(nodes(r)).toHaveLength(2);
    expect(nodes(r, "ids")).toHaveLength(2);
    for (const n of nodes(r)) {
      expect(n.top).toBeCloseTo(26, 0);
      expect(n.left).toBeCloseTo(202, 0);
      expect(n.style.color).toBe("rgb(90, 20, 40)");
    }
  },
});
add({
  id: "break-oversized-adjacent-avoid",
  title: "an oversized keep group relaxes once and preserves the following boundary",
  input: {
    html: `<h2 style="height:220px;break-after:avoid">${token(0)}</h2><p style="height:220px">${token(1)}</p><p style="break-before:page">${token(2)}</p>`,
  },
  check: (r) => {
    warning(r, "AVOID_RELAXED");
    expect(r.pages).toHaveLength(3);
  },
});
add({
  id: "break-avoid-long-paragraph",
  title: "a heading stays with the first fragment of a paragraph taller than a sheet",
  input: {
    html: `<div style="height:370px">Opening</div><h2 style="height:20px;break-after:avoid">Heading</h2><p>${Array.from({ length: 30 }, (_, i) => token(i)).join("<br>")}</p>`,
    selectors: { probe: "h2", paragraphs: "p" },
  },
  check: (r) => {
    expect(nodes(r)[0]?.page).toBe(2);
    expect(nodes(r, "paragraphs")[0]?.page).toBe(2);
  },
});
add({
  id: "list-native-unfragmented-counters",
  title: "unfragmented lists keep native hidden-item and custom-counter semantics",
  input: {
    html: '<ol><li>First</li><li hidden>Hidden</li><li>Second</li></ol><ol class="custom"><li>Five</li><li>Six</li></ol>',
    css: ".custom {counter-reset:list-item 4}",
    selectors: { probe: "li", lists: "ol" },
  },
  check: (r) => {
    for (const n of nodes(r)) expect(n.attrs.value).toBeUndefined();
    for (const n of nodes(r, "lists")) expect(n.attrs.start).toBeUndefined();
  },
});
add({
  id: "fixed-containing-block-and-hidden",
  title: "fixed descendants of hidden or transformed ancestors remain in their source context",
  input: {
    html: `<div hidden><aside class="hidden" style="position:fixed;top:0">Hidden</aside></div><div style="transform:translateZ(0)"><aside class="contained" style="position:fixed;top:0">Badge</aside><p>${token(0)}</p></div><p style="break-before:page">${token(1)}</p>`,
    selectors: { probe: "[data-imposia-fixed-area]", contained: ".contained" },
  },
  check: (r) => {
    expect(nodes(r)).toEqual([]);
    expect(nodes(r, "contained").map((n) => n.page)).toEqual([1]);
  },
});
add({
  id: "notes-pseudo-style-no-inheritance",
  title: "a non-note ancestor pseudo rule does not style descendant calls",
  input: {
    html: '<section class="group"><p><span data-footnote-anchor="a">Anchor</span></p><aside data-footnote="a">Note</aside></section>',
    css: "[data-footnote] {float:footnote} section.group::footnote-call {color:rgb(199,20,30)}",
    options,
    selectors: noteSelectors,
  },
  check: (r) => expect(nodes(r, "calls")[0]?.style.color).not.toBe("rgb(199, 20, 30)"),
});
add({
  id: "notes-pseudo-content-recovery",
  title: "unsupported note pseudo content warns instead of silently claiming custom numbering",
  input: {
    html: '<p><span data-footnote-anchor="a">Anchor</span></p><aside data-footnote="a">Note</aside>',
    css: '[data-footnote] {float:footnote} ::footnote-call {content:"[" counter(footnote) "]"}',
    options,
    selectors: noteSelectors,
  },
  check: (r) => {
    expect(r.warnings.map((w) => w.code)).toEqual(["UNSUPPORTED_LAYOUT"]);
    expect(nodes(r, "calls")[0]?.text).toBe("1");
  },
});
add({
  id: "notes-long-line-policy-recovery",
  title: "an unsatisfied line policy retains note content with a diagnostic",
  input: {
    html: `<p style="height:250px">Opening</p><p><span data-footnote-anchor="a">Anchor</span>${Array.from({ length: 25 }, (_, i) => `<br>${token(i)}`).join("")}</p><aside data-footnote="a">Preserved note</aside>`,
    css: "[data-footnote] {float:footnote;footnote-policy:line}",
    options,
    selectors: noteSelectors,
  },
  check: (r) => {
    warning(r, "FOOTNOTE_DEFERRED");
    expect(nodes(r)).toEqual([]);
    expect(nodes(r, "calls")).toEqual([]);
    expect(r.pages.map((p) => p.text).join(" ")).toContain("Preserved note");
  },
});
add({
  id: "fixed-parity-blank-decoration",
  title: "fixed furniture respects the blank-page decoration option",
  input: {
    html: `<aside class="fixed">Label</aside><p>${token(0)}</p><p style="break-before:right">${token(1)}</p>`,
    css: ".fixed {position:fixed;top:0}",
    options: { decorateBlankPages: false },
    selectors: { probe: ".fixed" },
  },
  check: (r) => {
    expect(r.pages).toHaveLength(3);
    expect(nodes(r).map((n) => n.page)).toEqual([1, 3]);
    for (const n of nodes(r)) expect(n.top).toBeCloseTo(20, 0);
  },
});
add({
  id: "break-avoid-normal-line-height",
  title: "keep-with-next measures actual first lines with normal line height",
  input: {
    html: `<div style="height:370px">Opening</div><h2 style="height:20px;break-after:avoid">Heading</h2><p style="line-height:normal">${Array.from({ length: 40 }, (_, i) => token(i)).join("<br>")}</p>`,
    selectors: { probe: "h2", paragraphs: "p" },
  },
  check: (r) => {
    expect(nodes(r)[0]?.page).toBe(2);
    expect(nodes(r, "paragraphs")[0]?.page).toBe(2);
    expect(r.warnings.map((w) => w.code)).not.toContain("AVOID_RELAXED");
  },
});
add({
  id: "break-avoid-long-wrapper-no-warning",
  title: "a long wrapper that starts beside its heading does not report false avoidance relaxation",
  input: {
    html: `<p style="height:100px">Opening</p><h2 style="height:20px;break-after:avoid">Heading</h2><section>${Array.from({ length: 20 }, (_, i) => `<p style="height:40px">${token(i)}</p>`).join("")}</section>`,
    selectors: { probe: "h2", following: "section p" },
  },
  check: (r) => {
    expect(nodes(r)[0]?.page).toBe(1);
    expect(nodes(r, "following")[0]?.page).toBe(1);
    expect(r.warnings.map((w) => w.code)).not.toContain("AVOID_RELAXED");
  },
});
add({
  id: "split-custom-list-counter-recovery",
  title: "fragmented custom list counters retain authored rules and diagnose possible restarts",
  input: {
    html: `<ol>${Array.from({ length: 12 }, (_, i) => `<li style="height:60px">${token(i)}</li>`).join("")}</ol>`,
    css: "ol {counter-reset:list-item 4}",
    selectors: { probe: "li" },
  },
  check: (r) => {
    warning(r, "UNSUPPORTED_FRAGMENTATION_CONTEXT", "counter-reset");
    expect(r.pages.length).toBeGreaterThan(1);
    for (const n of nodes(r)) expect(n.attrs.value).toBeUndefined();
  },
});
