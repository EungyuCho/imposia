export type ConformanceStatus = "supported" | "fallback";

type BrowserConformanceStatus = Readonly<{
  chromium: ConformanceStatus;
  firefox: ConformanceStatus;
  webkit: ConformanceStatus;
}>;

export type ConformanceFixture = Readonly<{
  id: "flex" | "grid" | "table" | "multicol" | "cjk";
  description: string;
  html: string;
  markers: readonly string[];
  expectedStatus: BrowserConformanceStatus;
  expectedWarningCodes: readonly string[];
}>;

const supportedInAllBrowsers: BrowserConformanceStatus = Object.freeze({
  chromium: "supported",
  firefox: "supported",
  webkit: "supported",
});

const numberedMarkers = (prefix: string, count: number): readonly string[] =>
  Array.from(
    { length: count },
    (_value, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`,
  );

const flexMarkers = numberedMarkers("FLEX", 12);
const gridMarkers = numberedMarkers("GRID", 12);
const tableMarkers = numberedMarkers("TABLE", 24);
const multicolMarkers = numberedMarkers("MULTICOL", 72);
const cjkMarkers = [
  "CJK-KO-001",
  "CJK-JA-002",
  "CJK-ZH-003",
  "CJK-RUBY-004",
  "CJK-VERTICAL-005",
  "CJK-HYPHEN-006",
] as const;

export const CONFORMANCE_FIXTURES: readonly ConformanceFixture[] = [
  {
    id: "flex",
    description: "column flex fragments nested relative cards in source-preserving order",
    expectedStatus: supportedInAllBrowsers,
    expectedWarningCodes: [],
    markers: flexMarkers,
    html: `
      <style>
        .fixture-flex { display: flex; flex-direction: column; gap: 12px; margin: 0; }
        .fixture-flex-card { position: relative; display: flex; flex-direction: column; box-sizing: border-box; height: 240px; padding: 8px; }
      </style>
      <main class="fixture-flex">
        ${flexMarkers.map((marker, index) => `<section class="fixture-flex-card" style="order:${Math.floor(index / 4) - 1}"><p data-conformance-marker="${marker}">${marker}</p></section>`).join("")}
      </main>
    `,
  },
  {
    id: "grid",
    description: "two-column auto-placed grid fragments between source-ordered rows",
    expectedStatus: supportedInAllBrowsers,
    expectedWarningCodes: [],
    markers: gridMarkers,
    html: `
      <style>
        .fixture-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: row; gap: 12px; margin: 0; }
        .fixture-grid > div { box-sizing: border-box; height: 240px; padding: 8px; }
      </style>
      <main class="fixture-grid">
        ${gridMarkers.map((marker) => `<div data-conformance-marker="${marker}">${marker}</div>`).join("")}
      </main>
    `,
  },
  {
    id: "table",
    description: "semantic table repeats header/footer and preserves rowspan/colspan row clusters",
    expectedStatus: supportedInAllBrowsers,
    expectedWarningCodes: [],
    markers: tableMarkers,
    html: `
      <style>
        table { width: 100%; border-collapse: collapse; }
        th, td { box-sizing: border-box; height: 64px; border: 1px solid #222; padding: 4px; }
      </style>
      <table>
        <caption>Conformance table</caption>
        <thead><tr><th>Marker</th><th>Value</th></tr></thead>
        <tbody>
          ${tableMarkers
            .map((marker, index) => {
              if (index === 0)
                return `<tr><td rowspan="2" data-conformance-marker="${marker}">${marker}</td><td>value</td></tr>`;
              if (index === 1)
                return `<tr><td data-conformance-marker="${marker}">${marker}</td></tr>`;
              if (index === 12)
                return `<tr><td colspan="2" data-conformance-marker="${marker}">${marker}</td></tr>`;
              return `<tr><td data-conformance-marker="${marker}">${marker}</td><td>value</td></tr>`;
            })
            .join("")}
        </tbody>
        <tfoot><tr><td colspan="2">Conformance footer</td></tr></tfoot>
      </table>
    `,
  },
  {
    id: "multicol",
    description: "bounded two-column flow preserves order around direct spanning boundaries",
    expectedStatus: supportedInAllBrowsers,
    expectedWarningCodes: [],
    markers: multicolMarkers,
    html: `
      <style>
        .fixture-multicol {
          column-count: 2;
          column-fill: auto;
          column-gap: 24px;
          height: 900px;
          margin: 0;
          font: 16px/24px Arial, sans-serif;
        }
        .fixture-multicol p { margin: 0 0 8px; }
        .fixture-multicol-span {
          box-sizing: border-box;
          height: 48px;
          margin: 8px 0;
          column-span: all;
        }
      </style>
      <main class="fixture-multicol">
        ${multicolMarkers
          .map((marker, index) =>
            index === 24 || index === 48
              ? `<h2 class="fixture-multicol-span" data-conformance-marker="${marker}">${marker} spanning boundary</h2>`
              : `<p data-conformance-marker="${marker}">${marker} bounded column content</p>`,
          )
          .join("")}
      </main>
    `,
  },
  {
    id: "cjk",
    description: "language-tagged CJK, ruby, vertical writing, and auto hyphenation retain content",
    expectedStatus: supportedInAllBrowsers,
    expectedWarningCodes: [],
    markers: cjkMarkers,
    html: `
      <style>
        .fixture-cjk { font: 18px/1.8 system-ui, sans-serif; line-break: auto; }
        .fixture-ko { word-break: keep-all; }
        .fixture-vertical { writing-mode: vertical-rl; height: 240px; }
        .fixture-hyphen { width: 180px; hyphens: auto; }
      </style>
      <main class="fixture-cjk">
        <p class="fixture-ko" lang="ko" data-conformance-marker="CJK-KO-001">CJK-KO-001 한글 문장의 줄바꿈과 낱말 묶음을 확인합니다.</p>
        <p lang="ja" data-conformance-marker="CJK-JA-002">CJK-JA-002 日本語の改行を確認します。</p>
        <p lang="zh-Hans" data-conformance-marker="CJK-ZH-003">CJK-ZH-003 中文换行基准。</p>
        <p lang="ja" data-conformance-marker="CJK-RUBY-004">CJK-RUBY-004 <ruby>出版<rt>しゅっぱん</rt></ruby></p>
        <p class="fixture-vertical" lang="ja" data-conformance-marker="CJK-VERTICAL-005">CJK-VERTICAL-005 縦書き組版</p>
        <p class="fixture-hyphen" lang="en" data-conformance-marker="CJK-HYPHEN-006">CJK-HYPHEN-006 internationalization representation</p>
      </main>
    `,
  },
];

export type PerformanceFixture = Readonly<{
  id: "small" | "large";
  initialHtml: string;
  updateHtml: string;
  sourceNodeCount: number;
  maxMountMs: number;
  maxUpdateMs: number;
}>;

const performanceDocument = (id: string, blockCount: number): string => `
  <style>
    article { margin: 0; font: 14px/20px Arial, sans-serif; }
    section { break-inside: avoid; min-height: 72px; margin: 0 0 8px; }
  </style>
  <article data-performance-fixture="${id}">
    ${Array.from(
      { length: blockCount },
      (_value, index) =>
        `<section><h2>${id}-${index + 1}</h2><p>Deterministic publishing performance content ${index + 1}.</p></section>`,
    ).join("")}
  </article>
`;

const performanceFixture = (
  id: PerformanceFixture["id"],
  blockCount: number,
  maxElapsedMs: number,
): PerformanceFixture => ({
  id,
  initialHtml: performanceDocument(`${id}-mount`, blockCount),
  updateHtml: performanceDocument(`${id}-update`, blockCount),
  sourceNodeCount: 1 + blockCount * 3,
  maxMountMs: maxElapsedMs,
  maxUpdateMs: maxElapsedMs,
});

export const PERFORMANCE_FIXTURES: readonly PerformanceFixture[] = [
  performanceFixture("small", 24, 5_000),
  performanceFixture("large", 240, 20_000),
];
