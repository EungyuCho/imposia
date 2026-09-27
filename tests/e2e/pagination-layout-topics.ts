import { expect } from "@playwright/test";
import {
  nodes,
  type PaginationTopic,
  paragraphs,
  sheets,
  token,
  warning,
} from "./pagination-topic-support.js";

export const layoutTopics: PaginationTopic[] = [];
const add = (topic: PaginationTopic) => layoutTopics.push(topic);

for (const edge of ["before", "after"] as const) {
  for (const side of edge === "before"
    ? ["page", "left", "right"]
    : ["page", "left", "right", "recto", "verso"]) {
    const needsBlank = side === "right" || side === "recto";
    const unsupported = side === "recto" || side === "verso";
    add({
      id: `break-${edge}-${side}`,
      title: unsupported
        ? `break-${edge}:${side} warns and falls back to normal flow`
        : `break-${edge}:${side} chooses the next sheet and inserts only the required blank`,
      input: {
        html: `<p style="${edge === "after" ? `break-after:${side}` : ""}">${token(0)}</p>
          <p style="${edge === "before" ? `break-before:${side}` : ""}">${token(1)}</p>`,
      },
      check: (r) => {
        if (unsupported) {
          warning(r, "UNSUPPORTED_LAYOUT");
          expect(r.pages).toHaveLength(1);
          expect(r.pages[0]?.blank).toBe(false);
          return;
        }
        expect(r.pages.map((p) => p.blank)).toEqual(
          needsBlank ? [false, true, false] : [false, false],
        );
        expect(r.pages.map((p) => p.text.match(/K\d{4}/g) ?? [])).toEqual(
          needsBlank ? [[token(0)], [], [token(1)]] : [[token(0)], [token(1)]],
        );
        expect(r.pages.at(-1)?.side).toBe(needsBlank ? "right" : "left");
      },
    });
  }
  add({
    id: `break-${edge}-avoid`,
    title: `break-${edge}:avoid keeps a short heading with its following paragraph`,
    input: {
      html: `<div style="height:350px">${token(0)}</div>
        <h2 style="height:40px;${edge === "after" ? "break-after:avoid" : ""}">${token(1)}</h2>
        <p style="height:40px;${edge === "before" ? "break-before:avoid" : ""}">${token(2)}</p>`,
    },
    check: (r) => {
      expect(r.pages).toHaveLength(2);
      expect(r.pages[0]?.text).not.toContain(token(1));
      expect(r.pages[1]?.text.match(/K\d{4}/g)).toEqual([token(1), token(2)]);
    },
  });
}

add({
  id: "break-inside-block",
  title: "a fitting avoid block moves intact from a partly occupied page",
  input: {
    html: `<div style="height:340px">${token(0)}</div><section style="break-inside:avoid">
      ${paragraphs(3, 35, 1)}</section>`,
  },
  check: (r) => {
    expect(r.pages).toHaveLength(2);
    expect(r.pages[1]?.text.match(/K\d{4}/g)).toEqual([token(1), token(2), token(3)]);
  },
});
add({
  id: "break-inside-cell",
  title: "a fitting table cell with avoidance keeps its row on one fresh sheet",
  input: {
    html: `<div style="height:350px">${token(0)}</div><table><tbody><tr>
      <td style="break-inside:avoid">${paragraphs(3, 30, 1)}</td><td>Amount</td>
      </tr></tbody></table>`,
    selectors: { probe: "tbody tr" },
  },
  check: (r) => {
    expect(nodes(r)).toHaveLength(1);
    expect(nodes(r)[0]?.page).toBe(2);
  },
});
add({
  id: "break-legacy-and-modern",
  title: "modern forced breaks override conflicting legacy page-break declarations",
  input: {
    html: `<p>${token(0)}</p><p style="page-break-before:avoid;break-before:page">${token(1)}</p>`,
  },
  check: (r) => expect(r.pages.map((p) => p.text.trim())).toEqual([token(0), token(1)]),
});
for (const edge of ["before", "after"] as const) {
  add({
    id: `break-nested-${edge}`,
    title: `a forced break on a nested ${edge === "before" ? "first" : "last"} child crosses its wrapper`,
    input: {
      html:
        edge === "before"
          ? `<p>${token(0)}</p><section><div><h2 style="break-before:page">${token(1)}</h2><p>${token(2)}</p></div></section>`
          : `<section><div><p>${token(0)}</p><h2 style="break-after:page">${token(1)}</h2></div></section><p>${token(2)}</p>`,
    },
    check: (r) =>
      expect(r.pages.map((p) => p.text.match(/K\d{4}/g))).toEqual(
        edge === "before" ? [[token(0)], [token(1), token(2)]] : [[token(0), token(1)], [token(2)]],
      ),
  });
}
add({
  id: "break-container-boundary",
  title: "a first-child forced break separates header and main containers",
  input: {
    html: `<header>${token(0)}</header><main><article style="break-before:page">${token(1)}</article></main>`,
  },
  check: (r) => expect(r.pages).toHaveLength(2),
});
add({
  id: "break-no-empty-intermediate-sheet",
  title: "adjacent after/before breaks share one boundary without an extra empty sheet",
  input: {
    html: `<section style="break-after:page">${token(0)}</section> \n<section style="break-before:page">${token(1)}</section>`,
  },
  check: (r) => expect(r.pages.map((p) => p.blank)).toEqual([false, false]),
});
add({
  id: "break-fractional-height",
  title: "fractional block heights fill the last available row without losing the following row",
  input: { html: paragraphs(41, 19.75) },
  check: (r) => {
    expect(r.pages).toHaveLength(3);
    expect(r.pages.map((p) => p.text.match(/K\d{4}/g)?.length)).toEqual([20, 20, 1]);
  },
});
add({
  id: "break-root-siblings",
  title: "top-level text and elements survive forced boundaries in source order",
  input: {
    html: `${token(0)}<p style="break-before:page">${token(1)}</p>${token(2)}<p style="break-before:page">${token(3)}</p>`,
  },
  check: (r) =>
    expect(r.pages.map((p) => p.text.match(/K\d{4}/g))).toEqual([
      [token(0)],
      [token(1), token(2)],
      [token(3)],
    ]),
});
add({
  id: "break-rowspan-avoid",
  title: "a bounded two-row span moves as a cluster when the current sheet is nearly full",
  input: {
    html: `<div style="height:350px">${token(0)}</div><table><tbody>
      <tr style="height:40px;break-inside:avoid"><td rowspan="2">${token(1)}</td><td>${token(2)}</td></tr>
      <tr style="height:40px"><td>${token(3)}</td></tr></tbody></table>`,
    selectors: { probe: "tbody tr", span: "td[rowspan]" },
  },
  check: (r) => {
    expect(nodes(r).map((n) => n.page)).toEqual([2, 2]);
    expect(nodes(r, "span")).toHaveLength(1);
  },
});

add({
  id: "split-ordered-list",
  title: "an ordered list continues its authored numbering after a page split",
  input: {
    html: `<ol start="7">${Array.from({ length: 13 }, (_, i) => `<li style="height:60px">${token(i)}</li>`).join("")}</ol>`,
    selectors: { probe: "ol", items: "li" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(nodes(r, "items")).toHaveLength(13);
    let next = 7;
    for (const list of nodes(r)) {
      expect(Number(list.attrs.start ?? 1)).toBe(next);
      next += list.text.match(/K\d{4}/g)?.length ?? 0;
    }
  },
});
add({
  id: "split-numbered-paragraphs",
  title: "authored paragraph numbers remain once and in order through nested block splitting",
  input: {
    html: `<section>${Array.from({ length: 15 }, (_, i) => `<p style="height:60px"><b>${i + 1}.</b> ${token(i)}</p>`).join("")}</section>`,
    selectors: { probe: "b" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(nodes(r).map((n) => n.text)).toEqual(Array.from({ length: 15 }, (_, i) => `${i + 1}.`));
  },
});
const preText = Array.from({ length: 55 }, (_, i) => `  ${token(i)}\tvalue  ${i}`).join("\n");
add({
  id: "split-preformatted-lines",
  title: "preformatted lines preserve tabs, indentation and newlines across sheets",
  input: {
    html: `<pre>${preText}</pre>`,
    selectors: { probe: "pre" },
    css: "pre { white-space:pre-wrap; widows:1; orphans:1; }",
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(
      nodes(r)
        .map((n) => n.text)
        .join(""),
    ).toBe(preText);
    for (const n of nodes(r)) expect(n.style["white-space"]).toBe("pre-wrap");
  },
});
add({
  id: "split-oversized-rowspan",
  title: "an oversized multi-row span stays atomic and reports its lost fit",
  recovery: true,
  input: {
    html: `<table><tbody><tr><td rowspan="2">${paragraphs(15)}</td><td>${token(15)}</td></tr><tr><td>${token(16)}</td></tr></tbody></table>`,
    selectors: { probe: "td[rowspan]" },
  },
  check: (r) => {
    expect(nodes(r)).toHaveLength(1);
    warning(r, "UNSUPPORTED_LAYOUT");
    warning(r, "PAGE_OVERFLOW");
  },
});
add({
  id: "split-oversized-avoid-table",
  title: "an overlong avoid table relaxes avoidance and preserves every row",
  recovery: true,
  input: {
    html: `<table style="break-inside:avoid"><tbody>${Array.from({ length: 24 }, (_, i) => `<tr style="height:40px"><td>${token(i)}</td></tr>`).join("")}</tbody></table>`,
    selectors: { probe: "tbody tr" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(nodes(r)).toHaveLength(24);
    warning(r, "AVOID_RELAXED");
    expect(r.warnings.map((w) => w.code)).not.toContain("PAGE_OVERFLOW");
  },
});
add({
  id: "split-connected-rowspans",
  title: "overlapping bounded row spans keep all connected rows on one sheet",
  input: {
    html: `<div style="height:310px">${token(0)}</div><table><tbody>
      <tr style="height:40px"><td rowspan="2">${token(1)}</td><td>${token(2)}</td><td>${token(3)}</td></tr>
      <tr style="height:40px"><td rowspan="2">${token(4)}</td><td>${token(5)}</td></tr>
      <tr style="height:40px"><td>${token(6)}</td><td>${token(7)}</td></tr></tbody></table>`,
    selectors: { probe: "tbody tr" },
  },
  check: (r) => expect(nodes(r).map((n) => n.page)).toEqual([2, 2, 2]),
});
add({
  id: "split-last-line-alignment",
  title: "paragraph continuations retain authored last-line alignment and complete text",
  input: {
    html: `<p class="prose">${Array.from({ length: 240 }, (_, i) => token(i)).join(" ")}</p>`,
    css: ".prose { text-align:justify; text-align-last:right; }",
    selectors: { probe: ".prose" },
  },
  check: (r) => {
    expect(nodes(r).length).toBeGreaterThan(1);
    expect(nodes(r).at(-1)?.style["text-align-last"]).toBe("right");
  },
});

const rows = (count: number, cells = 2) =>
  Array.from(
    { length: count },
    (_, i) =>
      `<tr style="height:48px">${Array.from({ length: cells }, (_, j) => `<td>${token(i * cells + j)}</td>`).join("")}</tr>`,
  ).join("");
add({
  id: "table-wrapped-columns",
  title: "narrow table columns wrap long cell text without horizontal clipping after a split",
  input: {
    html: `<table><tbody>${Array.from({ length: 12 }, (_, i) => `<tr><td>${token(i)}</td><td class="narrow">several separate words wrap in this narrow column</td></tr>`).join("")}</tbody></table>`,
    css: "td { width:50%; }",
    selectors: { probe: ".narrow" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(nodes(r)).toHaveLength(12);
    for (const n of nodes(r)) {
      expect(n.height).toBeGreaterThan(20);
      expect(n.width).toBeLessThanOrEqual(141);
    }
  },
});
add({
  id: "table-stable-column-widths",
  title: "the column-width preset preserves asymmetric table geometry on continued fragments",
  input: {
    html: `<table><colgroup><col style="width:30%"><col style="width:70%"></colgroup><tbody>${rows(18)}</tbody></table>`,
    freezeColumns: true,
    selectors: { probe: "tbody tr:first-child td" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    const cells = nodes(r);
    expect(cells.length).toBe(r.pages.length * 2);
    cells.forEach((cell, index) => {
      expect(cell.width).toBeCloseTo(cells[index % 2]?.width ?? -1, 0);
    });
    expect(cells[0]?.width).toBeLessThan(cells[1]?.width ?? 0);
  },
});
add({
  id: "table-nested-cells",
  title: "a fitting nested table remains inside its outer cell after the outer row moves",
  input: {
    html: `<div style="height:350px">${token(0)}</div><table class="outer"><tbody><tr><td>
      <table class="inner"><tbody>${rows(2)}</tbody></table></td><td>${token(4)}</td></tr></tbody></table>`.replace(
      token(0),
      "Lead",
    ),
    selectors: { probe: ".inner", rows: ".inner tbody tr" },
  },
  check: (r) => {
    expect(nodes(r)).toHaveLength(1);
    expect(nodes(r)[0]?.page).toBe(2);
    expect(nodes(r, "rows")).toHaveLength(2);
  },
});
add({
  id: "table-empty-and-spanning-cells",
  title: "continued rows retain empty cells and authored column spans",
  input: {
    html: `<table><tbody>${Array.from({ length: 16 }, (_, i) => `<tr style="height:50px"><td></td><td colspan="2">${token(i)}</td><td></td></tr>`).join("")}</tbody></table>`,
    selectors: { probe: "tbody tr", cells: "tbody td", spans: "td[colspan]" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(nodes(r)).toHaveLength(16);
    expect(nodes(r, "cells")).toHaveLength(48);
    expect(nodes(r, "spans").map((n) => n.attrs.colspan)).toEqual(Array(16).fill("2"));
  },
});
add({
  id: "table-multiple-row-groups",
  title: "multiple table bodies survive reconstruction with one repeated header per fragment",
  input: {
    html: `<table><thead><tr><th>Heading</th><th>Value</th></tr></thead>
      <tbody data-group="a">${rows(7)}</tbody><tbody data-group="b">${rows(7).replace(/K(\d{4})/g, (_, n) => token(Number(n) + 14))}</tbody></table>`,
    selectors: { probe: "thead", groups: "tbody" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    expect(nodes(r).map((n) => n.page)).toEqual(r.pages.map((p) => p.number));
    expect(new Set(nodes(r, "groups").map((n) => n.attrs["data-group"]))).toEqual(
      new Set(["a", "b"]),
    );
  },
});
add({
  id: "whitespace-hard-line-breaks",
  title: "explicit line breaks preserve every line at the bottom and top of adjacent sheets",
  input: { html: `<p>${Array.from({ length: 45 }, (_, i) => token(i)).join("<br>")}</p>` },
  check: (r) => {
    expect(r.pages).toHaveLength(3);
    expect(r.pages[0]?.text).toContain(token(19));
    expect(r.pages[1]?.text).toContain(token(20));
  },
});
add({
  id: "whitespace-between-forced-blocks",
  title: "formatting whitespace and comments do not allocate extra sheets",
  input: {
    html: `\n\t <section>${token(0)}</section>\n <!-- spacer --> \t<section style="break-before:page">${token(1)}</section>\n`,
  },
  check: (r) => expect(r.pages).toHaveLength(2),
});
add({
  id: "progress-oversized-atomic-box",
  title: "an oversized atomic box terminates with overflow diagnostics and keeps its successor",
  recovery: true,
  input: {
    html: `<div style="height:900px;transform:translateX(0)">${token(0)}</div><p>${token(1)}</p>`,
  },
  check: (r) => {
    expect(r.pages.length).toBeLessThanOrEqual(3);
    warning(r, "PAGE_OVERFLOW");
    expect(r.pages.at(-1)?.text).toContain(token(1));
  },
});
add({
  id: "hyphenation-language-context",
  title: "language-tagged automatic hyphenation survives paragraph splitting without changing text",
  input: {
    html: `<article lang="en"><p style="hyphens:auto">${Array.from({ length: 180 }, (_, i) => `${token(i)} representation`).join(" ")}</p></article>`,
    selectors: { probe: "article p" },
  },
  check: (r) => {
    expect(r.pages.length).toBeGreaterThan(1);
    for (const n of nodes(r)) expect(n.style.hyphens).toBe("auto");
    expect(r.warnings.map((w) => w.code)).not.toContain("HYPHENATION_FALLBACK");
  },
});
add({
  id: "fixed-page-furniture",
  title: "fixed page furniture appears on every committed sheet",
  input: {
    html: `<aside class="fixed">Fixed label</aside>${sheets(4)}`,
    css: ".fixed { position:fixed; top:0; }",
    selectors: { probe: ".fixed" },
  },
  check: (r) => {
    expect(nodes(r).map((n) => n.page)).toEqual([1, 2, 3, 4]);
    expect(nodes(r).map((n) => n.text)).toEqual(Array(4).fill("Fixed label"));
  },
});
