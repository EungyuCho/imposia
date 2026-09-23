import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
  type PageViewerState,
} from "@imposia/react";
import "@imposia/react/styles.css";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useRef, useState } from "react";

// A real Imposia document, paginated in the visitor's browser. Loaded only on
// the client: the prerendered page shows a static illustration of the same
// window until this module arrives.

const SENTENCES = [
  "A page is a promise about where things will be.",
  "Margins give the eye somewhere to rest between thoughts.",
  "Running heads tell readers where they are without asking them to look.",
  "Tables should break between rows, never through them.",
  "The same pages appear on screen and on paper.",
  "Nothing half-finished reaches the reader.",
];

function paragraph(seed: number, sentences: number): string {
  return `<p>${Array.from(
    { length: sentences },
    (_value, index) => SENTENCES[(seed + index) % SENTENCES.length],
  ).join(" ")}</p>`;
}

function chapter(number: number, title: string, body: string): string {
  return `<section class="chapter"><p class="kicker">Chapter ${number}</p><h1>${title}</h1>${body}</section>`;
}

const TABLE_ROWS = Array.from(
  { length: 26 },
  (_value, index) =>
    `<tr><td>Section ${index + 1}</td><td>${3 + ((index * 7) % 11)} pages</td><td>${index % 3 === 0 ? "Figure" : "Text"}</td></tr>`,
).join("");

const DEMO_HTML = `
<template data-page-header><span>Field Notes</span></template>
<template data-page-footer><span>{{pageNumber}} / {{totalPages}}</span></template>
<style>
  body { font: 11pt/1.55 Georgia, "Times New Roman", serif; color: #16161a; }
  h1 { font-size: 26pt; font-weight: 500; line-height: 1.1; margin: 0 0 14pt; }
  h2 { font: 600 12pt/1.3 system-ui, sans-serif; margin: 16pt 0 6pt; }
  p { margin: 0 0 8pt; }
  .chapter { break-before: page; }
  .chapter:first-of-type { break-before: auto; }
  .kicker { font: 600 8pt system-ui, sans-serif; letter-spacing: 1.5pt; text-transform: uppercase; color: #4f46e5; margin-bottom: 6pt; }
  .figure { break-inside: avoid; box-sizing: border-box; height: 150pt; margin: 10pt 0; padding: 132pt 8pt 0; border-radius: 4pt; background: linear-gradient(135deg, #e4e2ff, #f3e8ff); font: 8pt system-ui, sans-serif; color: #5b55c9; }
  /* Match the viewer window: dark stage between pages. */
  body[data-imposia-pages] { background: #141418; }
  table { width: 100%; border-collapse: collapse; font: 9pt/1.4 system-ui, sans-serif; margin: 8pt 0; }
  th { text-align: left; background: #f1f0ff; color: #4f46e5; }
  th, td { padding: 4pt 6pt; border-bottom: 1px solid #e3e3df; }
  [data-imposia-margin-box] { font: 8pt system-ui, sans-serif; color: #9a9aa3; }
</style>
${chapter(
  1,
  "Why pages still matter",
  [0, 1, 2, 3, 4].map((seed) => paragraph(seed, 5)).join("") +
    `<div class="figure">Figure 1 — A spread, as the reader sees it</div>` +
    [5, 6, 7].map((seed) => paragraph(seed, 6)).join(""),
)}
${chapter(
  2,
  "The shape of a page",
  [2, 3, 4, 5].map((seed) => paragraph(seed, 6)).join("") +
    "<h2>Tables that break cleanly</h2>" +
    `<table><thead><tr><th>Part</th><th>Length</th><th>Kind</th></tr></thead><tbody>${TABLE_ROWS}</tbody></table>` +
    [0, 1, 2].map((seed) => paragraph(seed, 6)).join(""),
)}
${chapter(
  3,
  "Printing without surprises",
  [3, 4, 5, 0, 1, 2].map((seed) => paragraph(seed, 6)).join("") +
    `<div class="figure">Figure 2 — The committed pages, on paper</div>` +
    [4, 5, 0].map((seed) => paragraph(seed, 6)).join(""),
)}
`;

const SOURCE = { html: DEMO_HTML };
const DOCUMENT_OPTIONS = { page: { size: "A4", margin: "18mm" } } as const;
const VIEWER_OPTIONS = { controls: false, mode: "spread", zoom: 1 } as const;

function pageRange(state: PageViewerState | undefined): string {
  if (state === undefined) return "…";
  if (state.effectiveMode !== "spread") return `${state.page} / ${state.pageCount}`;
  // Without a cover page, spreads pair 1–2, 3–4, and so on.
  const start = state.page % 2 === 1 ? state.page : state.page - 1;
  const end = Math.min(state.pageCount, start + 1);
  return `${start === end ? start : `${start}–${end}`} / ${state.pageCount}`;
}

export default function LiveViewer({ label }: { label: string }) {
  const viewer = useRef<ImposiaPageViewerHandle>(null);
  const [state, setState] = useState<PageViewerState | undefined>(undefined);
  const ready = state !== undefined;
  const mode = state?.mode ?? "spread";

  return (
    <section aria-label={label} className="lp-viewer lp-viewer-live">
      <div className="lp-viewer-bar">
        <span aria-hidden="true" className="lp-viewer-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="lp-viewer-title">{"<ImposiaPageViewer />"}</span>
        <span className="lp-viewer-modes">
          {(["single", "spread"] as const).map((item) => (
            <button
              aria-pressed={mode === item}
              className={mode === item ? "is-active" : undefined}
              disabled={!ready}
              key={item}
              onClick={() => viewer.current?.setMode(item)}
              type="button"
            >
              {item === "single" ? "Single" : "Spread"}
            </button>
          ))}
        </span>
        <button
          className="lp-viewer-print"
          disabled={!ready}
          onClick={() => void viewer.current?.print()}
          type="button"
        >
          <Printer aria-hidden="true" size={13} />
          Print
        </button>
      </div>
      <ImposiaPageViewer
        className="lp-viewer-host"
        documentOptions={DOCUMENT_OPTIONS}
        onViewerStateChange={setState}
        ref={viewer}
        source={SOURCE}
        viewerOptions={VIEWER_OPTIONS}
      />
      <div className="lp-viewer-status">
        <span className="lp-viewer-meta">
          <span>A4 · 18mm</span>
          <span>{state?.effectiveMode === "spread" ? "Spread" : "Single"}</span>
        </span>
        <span className="lp-viewer-meta">
          <span className={ready ? "lp-viewer-ok" : "lp-viewer-pending"}>
            {ready ? "committed" : "paginating"}
          </span>
          <button
            aria-label="Previous page"
            className="lp-viewer-step"
            disabled={!ready || (state?.page ?? 1) <= 1}
            onClick={() => viewer.current?.previousPage()}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={14} />
          </button>
          <span aria-live="polite" className="lp-viewer-pages">
            {pageRange(state)}
          </span>
          <button
            aria-label="Next page"
            className="lp-viewer-step"
            disabled={!ready || (state?.page ?? 1) >= (state?.pageCount ?? 1)}
            onClick={() => viewer.current?.nextPage()}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={14} />
          </button>
        </span>
      </div>
    </section>
  );
}
