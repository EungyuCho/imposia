import {
  type ImposiaDocumentState,
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
  type PageDocument,
  type PageDocumentOptions,
  type PageExtension,
  type PageOrientation,
} from "@imposia/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_PAGE_PRESET, type PagePreset, PageSetup } from "./page-setup.js";

type SampleId = "integrity" | "editorial" | "brief" | "hangul" | "publishing";
type CodeMode = "react" | "core";
type ExportStatus = "idle" | "exporting" | "success" | "error";
type IntegrityStatus = "idle" | "running" | "verified" | "failed";

type DemoSample = Readonly<{
  id: SampleId;
  index: string;
  title: string;
  summary: string;
  html: string;
}>;

type IntegrityPageRange = Readonly<{
  page: number;
  first: string;
  last: string;
  count: number;
}>;

type IntegrityReport = Readonly<{
  sourceTokenCount: number;
  committedTokenCount: number;
  exactSequence: boolean;
  pageRanges: readonly IntegrityPageRange[];
}>;

const documentStyle = `
  :root {
    color: #171a18;
    background: #f6f1e7;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  }
  body { color: #171a18; background: #f6f1e7; }
  article, section { font-size: 15px; line-height: 1.68; }
  h1, h2 { margin: 0; font-weight: 500; letter-spacing: -0.045em; }
  h1 { max-width: 12ch; font-size: 48px; line-height: 0.98; }
  h2 { max-width: 17ch; font-size: 32px; line-height: 1.05; }
  p { max-width: 56ch; margin: 18px 0 0; }
  .kicker {
    margin: 0 0 34px;
    color: #d9532b;
    font: 700 9px/1.3 "SFMono-Regular", Consolas, monospace;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .lede { max-width: 40ch; margin-top: 30px; font-size: 21px; line-height: 1.45; }
  .rule { width: 56px; height: 2px; margin: 38px 0; background: #d9532b; }
  .note {
    max-width: 42ch;
    margin-top: 34px;
    padding: 18px 20px;
    border-left: 2px solid #d9532b;
    background: #ebe4d6;
    font-style: italic;
  }
  .meta {
    margin-top: 52px;
    color: #66706c;
    font: 700 9px/1.5 "SFMono-Regular", Consolas, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .number {
    display: block;
    margin-bottom: 30px;
    color: #d9532b;
    font: 500 70px/0.9 "Iowan Old Style", Georgia, serif;
    letter-spacing: -0.08em;
  }
  .facts { margin: 36px 0 0; padding: 0; list-style: none; }
  .facts li { padding: 12px 0; border-top: 1px solid #cfc8bb; }
  .facts strong { display: inline-block; min-width: 130px; font-weight: 600; }
  .demo-running-head {
    color: #65706b;
    font: 700 8px/1 "SFMono-Regular", Consolas, monospace;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  [lang="ko"] { font-family: "Apple SD Gothic Neo", "Noto Serif KR", Batang, serif; }
  [lang="ko"] h1, [lang="ko"] h2 { word-break: keep-all; letter-spacing: -0.055em; }
  [lang="ko"] p { word-break: keep-all; }
`;

const publishingDocumentCss = `
  :root {
    color: #18201d;
    background: #f7f1e5;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  }
  body { color: #18201d; background: #f7f1e5; }
  article { font-size: 13px; line-height: 1.45; }
  h1, h2, h3 { margin: 0; font-weight: 500; letter-spacing: -0.04em; }
  h1 { font-size: 38px; line-height: 0.98; }
  h2 { margin-top: 28px; font-size: 24px; line-height: 1.05; }
  h3 { margin-top: 22px; font-size: 17px; }
  p { max-width: 72ch; margin: 12px 0 0; }
  .publishing-kicker {
    margin: 0 0 16px;
    color: #c9532c;
    font: 800 8px/1.3 "SFMono-Regular", Consolas, monospace;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .publishing-deck { max-width: 64ch; margin-top: 14px; font-size: 16px; }
  .publishing-support {
    display: grid;
    gap: 4px;
    margin-top: 18px;
    padding: 10px 12px;
    border-left: 2px solid #c9532c;
    background: #ebe2d2;
    font: 9px/1.55 "SFMono-Regular", Consolas, monospace;
  }
  .publishing-support strong { color: #c9532c; }
  .publishing-table {
    width: 100%;
    margin-top: 18px;
    border-collapse: collapse;
    font: 10px/1.35 "SFMono-Regular", Consolas, monospace;
  }
  .publishing-table th,
  .publishing-table td {
    padding: 7px 9px;
    border-top: 1px solid #cfc5b4;
    text-align: left;
    vertical-align: top;
  }
  .publishing-table th {
    color: #66706c;
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .publishing-table thead { display: table-header-group; }
  .publishing-table tr { break-inside: avoid; }
  .publishing-reference { color: #c9532c; font-weight: 700; }
  .publishing-reference::after { margin-left: 4px; color: #66706c; }
  .publishing-reference-text::before { margin-right: 4px; color: #66706c; }
  .publishing-footnote { font-size: 9px; }
  .publishing-float {
    margin: 18px 0;
    padding: 10px 12px;
    border: 1px solid #cfc5b4;
    background: #fffaf0;
  }
  @page {
    size: A4;
    margin: 15mm 18mm 20mm 22mm;
    @top-center { content: string(running-head, last) " · " counter(page) "/" counter(pages); }
  }
  @page :first {
    @top-left { content: "IMPOSIA / PUBLISHING LAB"; }
    @bottom-right { content: "STABLE SURFACE"; }
  }
  @page :left {
    @bottom-left { content: "LEFT / " counter(page); }
  }
  @page :right {
    @bottom-right { content: "RIGHT / " counter(page); }
  }
  h1, h2, h3 { string-set: running-head content; }
  .publishing-reference::after { content: target-counter(attr(href), page); }
  .publishing-reference-text::before { content: target-text(attr(href), content); }
`;

const publishingPlacementCss = `
  .publishing-footnote { float: footnote; }
  .publishing-float { float: top; float-reference: page; }
`;

const integrityTokens = Array.from(
  { length: 96 },
  (_, index) => `FLOW-${String(index + 1).padStart(3, "0")}`,
);

const integrityRows = integrityTokens
  .map(
    (token) => `
      <p class="integrity-row">
        <span data-integrity-token="${token}">${token}</span>
        <span>Browser-owned HTML remains in source order across the committed page boundary.</span>
      </p>
    `,
  )
  .join("");

const integrityDocumentCss = `
  :root {
    color: #17201d;
    background: #f6f1e7;
    font-family: "SFMono-Regular", "Cascadia Code", Consolas, monospace;
  }
  body { color: #17201d; background: #f6f1e7; }
  article { font-size: 11px; line-height: 1.45; }
  h1 { max-width: 14ch; margin: 0; font: 500 42px/0.98 "Iowan Old Style", Georgia, serif; letter-spacing: -0.05em; }
  .integrity-kicker {
    margin: 0 0 20px;
    color: #a64020;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .integrity-deck { max-width: 60ch; margin: 20px 0 28px; font-size: 14px; }
  .integrity-revision {
    margin: 0 0 22px;
    padding: 10px 12px;
    border-left: 3px solid #ef6a3b;
    background: #e8e0d1;
    font-weight: 700;
  }
  .integrity-flow { border-bottom: 1px solid #c9c1b3; }
  .integrity-row {
    display: grid;
    min-height: 31px;
    grid-template-columns: 76px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    margin: 0;
    border-top: 1px solid #c9c1b3;
    break-inside: avoid;
  }
  [data-integrity-token] { color: #a64020; font-weight: 800; }
`;

const publishingRows = [
  ["01", "Geometry", "A4 portrait default", "Stable / four authored margins"],
  ["02", "Page rules", "first · left · right", "Stable / margin-box furniture"],
  ["03", "References", "target-counter", "Stable / local fragment"],
  ["04", "References", "target-text", "Stable / local fragment"],
  ["05", "Tables", "thead continuation", "Stable / repeated heading"],
  ["06", "Strings", "running-head", "Stable / named string"],
  ["07", "Assets", "resolver boundary", "Stable / browser-only"],
  ["08", "Flow", "ordered source", "Stable / canonical DOM"],
  ["09", "Warnings", "explicit recovery", "Constrained / visible"],
  ["10", "Footnotes", "float: footnote", "Experimental / opt-in"],
  ["11", "Page floats", "float-reference: page", "Experimental / bounded"],
  ["12", "Pagination", "Chromium reference", "Constrained / layout engine"],
  ["13", "Printing", "same iframe", "Stable / no duplicate"],
  ["14", "Export", "EPUB 3", "Stable / deterministic"],
  ["15", "Lifecycle", "abort + cleanup", "Stable / controller-owned"],
  ["16", "Typography", "authored CSS", "Stable / isolated"],
  ["17", "Progress", "state callbacks", "Stable / React-first"],
  ["18", "Surface", "one document", "Stable / portable"],
  ["19", "Geometry", "content box", "Stable / measured"],
  ["20", "Page rules", "top-center", "Stable / margin box"],
  ["21", "References", "fragment target", "Stable / local only"],
  ["22", "Tables", "row grouping", "Stable / continuation"],
  ["23", "Strings", "first / start / last", "Stable / running"],
  ["24", "Assets", "blocked remote", "Constrained / explicit"],
  ["25", "Flow", "widow recovery", "Constrained / warning"],
  ["26", "Warnings", "source identity", "Constrained / inspectable"],
  ["27", "Footnotes", "bounded area", "Experimental / fallback"],
  ["28", "Page floats", "top placement", "Experimental / fallback"],
  ["29", "Pagination", "page sides", "Stable / deterministic"],
  ["30", "Printing", "canonical frame", "Stable / shared"],
  ["31", "Export", "mimetype first", "Stable / EPUB ZIP"],
  ["32", "Lifecycle", "release cleanup", "Stable / owned"],
  ["33", "Typography", "CSS isolation", "Stable / iframe"],
  ["34", "Progress", "ready state", "Stable / observable"],
  ["35", "Surface", "responsive shell", "Stable / compact"],
  ["36", "Contract", "evidence cue", "Stable / reviewed"],
]
  .map(
    ([index, topic, value, posture]) =>
      `<tr><td>${index}</td><td>${topic}</td><td>${value}</td><td>${posture}</td></tr>`,
  )
  .join("");

const samples: Record<SampleId, DemoSample> = {
  integrity: {
    id: "integrity",
    index: "01",
    title: "CSR continuity proof",
    summary: "Ninety-six source tokens, checked once and in order across every committed page.",
    html: `
      <style>${integrityDocumentCss}</style>
      <article>
        <p class="integrity-kicker">Imposia / pagination integrity</p>
        <h1>No gaps at the fold.</h1>
        <p class="integrity-deck">This specimen records a unique source token in every row. The host reads the committed page DOM back and proves that all ninety-six tokens still occur exactly once and in source order.</p>
        <p class="integrity-revision">CSR source revision <span data-csr-revision>{{CSR_REVISION}}</span></p>
        <div class="integrity-flow">${integrityRows}</div>
      </article>
    `,
  },
  editorial: {
    id: "editorial",
    index: "02",
    title: "Editorial essay",
    summary: "Three composed pages with running furniture and explicit page breaks.",
    html: `
      <style>${documentStyle}</style>
      <article>
        <p class="kicker">Morrow Journal · Issue 08</p>
        <h1>The shape of quiet interfaces</h1>
        <p class="lede">Good tools do not disappear. They become calm enough for the work to take the foreground.</p>
        <div class="rule"></div>
        <p>Publishing software is often judged by the surface it adds. The more useful measure is the friction it removes: stable rhythm, predictable breaks, and a page that remains itself from preview to print.</p>
        <p class="meta">Essay / Systems / 6 minute read</p>
      </article>
      <section style="break-before: page">
        <span class="number">02</span>
        <p class="kicker">A page is a contract</p>
        <h2>Structure before decoration</h2>
        <p>Imposia keeps one canonical page DOM. Pagination, presentation, and browser print refer to the same iframe instead of copying a convenient approximation.</p>
        <blockquote class="note">The viewer should reveal document structure, not manufacture a second one.</blockquote>
      </section>
      <section style="break-before: page">
        <span class="number">03</span>
        <p class="kicker">The useful boundary</p>
        <h2>Extensions remain guests</h2>
        <p>Ordered extensions may transform strings, admit assets, and add running furniture. Core still owns sanitization, resource resolution, aborts, rollback, and cleanup.</p>
        <ul class="facts">
          <li><strong>Input</strong> HTML and CSS</li>
          <li><strong>Output</strong> Canonical browser pages</li>
          <li><strong>Runtime</strong> Client only</li>
        </ul>
      </section>
    `,
  },
  brief: {
    id: "brief",
    index: "03",
    title: "Product brief",
    summary: "A compact two-page product document with structured facts.",
    html: `
      <style>${documentStyle}</style>
      <article>
        <p class="kicker">Atlas release brief · 2026.07</p>
        <h1>One document. One browser surface.</h1>
        <p class="lede">A client-side publishing primitive for products that need preview, pagination, and print without a server renderer.</p>
        <ul class="facts">
          <li><strong>Primary</strong> React adapter</li>
          <li><strong>Portable</strong> Framework-neutral client</li>
          <li><strong>Boundary</strong> Resolver-mediated assets</li>
        </ul>
      </article>
      <section style="break-before: page">
        <p class="kicker">Release posture</p>
        <h2>Small public surface, explicit guarantees</h2>
        <p>The current contract covers ordered flow, page sides, decorations, warnings, canonical iframe lifecycle, and deterministic resource cleanup.</p>
        <div class="rule"></div>
        <p class="note">Chromium is the pagination reference. Firefox and WebKit preserve the shared API, isolation, and lifecycle contract.</p>
        <p class="meta">Imposia / Browser publishing toolkit</p>
      </section>
    `,
  },
  hangul: {
    id: "hangul",
    index: "04",
    title: "한국어 필드노트",
    summary: "한글 조판과 명시적 페이지 나눔을 확인하는 두 페이지 샘플입니다.",
    html: `
      <style>${documentStyle}</style>
      <article lang="ko">
        <p class="kicker">서울 필드노트 · 여름호</p>
        <h1>읽는 흐름을 해치지 않는 도구</h1>
        <p class="lede">좋은 미리보기는 결과를 흉내 내지 않고, 실제 문서가 어떻게 페이지가 되는지 차분하게 보여줍니다.</p>
        <div class="rule"></div>
        <p>브라우저 안에서 만들어진 하나의 페이지 DOM을 미리보기와 인쇄가 함께 사용합니다. 화면마다 문서를 복제하지 않으므로 구조와 순서가 흔들리지 않습니다.</p>
        <p class="meta">기록 / 브라우저 조판 / 클라이언트 런타임</p>
      </article>
      <section lang="ko" style="break-before: page">
        <span class="number">02</span>
        <p class="kicker">확장 가능한 경계</p>
        <h2>기능은 더하되 소유권은 넘기지 않습니다</h2>
        <p>확장은 선언된 순서로 실행되지만 문서 DOM이나 네트워크에 직접 접근하지 않습니다. 입력 정리, 자산 허용, 경고, 중단과 정리는 언제나 Core의 경계 안에 남습니다.</p>
        <blockquote class="note">플러그인은 조합할 수 있어야 하고, 핵심 계약은 예측 가능해야 합니다.</blockquote>
      </section>
    `,
  },
  publishing: {
    id: "publishing",
    index: "05",
    title: "Publishing contract",
    summary:
      "A4 page rules, local references, repeated table heads, and opt-in publishing features.",
    html: `
      <style>${publishingDocumentCss}</style>
      <article class="publishing-document">
        <p class="publishing-kicker">Imposia / publishing lab / contract specimen</p>
        <h1>Pages that carry their own evidence</h1>
        <p class="publishing-deck">A deliberately dense document surface for checking geometry, running furniture, safe local references, and bounded experimental placement.</p>
        <div class="publishing-support">
          <span><strong>Stable</strong> A4 geometry, authored page selectors, named strings, and deterministic EPUB export.</span>
          <span><strong>Constrained</strong> local target references, table continuation, and Chromium-reference pagination.</span>
          <span><strong>Experimental</strong> footnote and page-float markers are opt-in and remain bounded.</span>
        </div>
        <aside class="publishing-float">
          <strong>Page-float probe.</strong> This bounded callout opts into page-referenced top placement.
        </aside>
        <h2 id="geometry">Geometry is an authored contract</h2>
        <p>The authored page rules pin A4 with four named margins. First, left, and right furniture follow the latest named section.</p>
        <p>Read the <a class="publishing-reference" href="#table-title">table page</a> and <a class="publishing-reference-text" href="#table-title">table heading</a> through safe local fragments.</p>
        <h2 id="table-title">A repeated table head</h2>
        <table class="publishing-table">
          <thead><tr><th>Index</th><th>Concern</th><th>Authored signal</th><th>Support posture</th></tr></thead>
          <tbody>${publishingRows}</tbody>
        </table>
        <h2>Placement stays explicit</h2>
        <p>One note is anchored to a local footnote target: <span id="rights-anchor" data-footnote-anchor="rights">rights and recovery remain visible</span>.</p>
        <aside class="publishing-footnote" data-footnote="rights">Footnote probe: this note is experimental and falls back to normal flow when the bounded area cannot fit.</aside>
        <p class="publishing-support"><strong>Manual QA cue</strong> Check the Sheet metric, the top and bottom furniture, repeated table headings, the two local references, and the explicit support labels above.</p>
      </article>
    `,
  },
};

const snippets: Record<CodeMode, string> = {
  react: `import { ImposiaPageViewer, type ImposiaPageViewerHandle } from "@imposia/react";
import "@imposia/react/styles.css";
import { useRef } from "react";

const viewer = useRef<ImposiaPageViewerHandle>(null);

<ImposiaPageViewer
  ref={viewer}
  source={{ html }}
  documentOptions={{ page: { size: "A4", orientation: "portrait" }, extensions }}
  onReady={({ pageCount }) => setPages(pageCount)}
/>

await viewer.current?.print();`,
  core: `import { mountPageDocument, mountPageViewer } from "@imposia/client";

const controller = mountPageDocument(host, { html }, {
  page: { size: "A4", orientation: "portrait" },
  extensions,
});
const pageDocument = await controller.ready;
const viewer = mountPageViewer(host, pageDocument);

await controller.print();`,
};

function ImposiaMark() {
  return (
    <svg className="demo-brand-mark" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <path
        className="demo-brand-mark-outline"
        d="M36 20 18 9 4 17l18 11v17L4 56l16 9 16-10V20Zm0 0L54 9l14 8-18 11v17l18 11-16 9-16-10V20Z"
      />
      <path className="demo-brand-mark-fold" d="m22 28 14-8v16L22 28Zm14 27V39l14 9-14 7Z" />
    </svg>
  );
}

function statusLabel(state: ImposiaDocumentState["status"]): string {
  if (state === "ready") return "Ready";
  if (state === "loading") return "Paginating";
  if (state === "error") return "Error";
  return "Idle";
}

function exportStatusLabel(
  status: ExportStatus,
  message: string | undefined,
  ready: boolean,
): string {
  if (status === "exporting") return "Exporting…";
  if (status === "success") return "EPUB downloaded";
  if (status === "error") return message ?? "Export failed";
  return ready ? "EPUB ready" : "Awaiting document";
}

function inspectIntegrity(pageDocument: PageDocument): IntegrityReport {
  const frameDocument = pageDocument.iframe.contentDocument;
  if (frameDocument === null) {
    return {
      sourceTokenCount: integrityTokens.length,
      committedTokenCount: 0,
      exactSequence: false,
      pageRanges: [],
    };
  }

  const pageRanges = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")]
    .map((pageElement, index): IntegrityPageRange | undefined => {
      const tokens = [
        ...pageElement.querySelectorAll<HTMLElement>("[data-integrity-token]"),
      ].flatMap((element) => {
        const token = element.dataset.integrityToken;
        return token === undefined ? [] : [token];
      });
      const first = tokens[0];
      const last = tokens.at(-1);
      if (first === undefined || last === undefined) return undefined;
      return { page: index + 1, first, last, count: tokens.length };
    })
    .filter((range): range is IntegrityPageRange => range !== undefined);
  const committedTokens = pageRanges.flatMap((range) => {
    const first = integrityTokens.indexOf(range.first);
    return first < 0 ? [] : integrityTokens.slice(first, first + range.count);
  });
  const domTokens = [
    ...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page] [data-integrity-token]"),
  ].flatMap((element) => {
    const token = element.dataset.integrityToken;
    return token === undefined ? [] : [token];
  });
  const exactSequence =
    domTokens.length === integrityTokens.length &&
    domTokens.every((token, index) => token === integrityTokens[index]) &&
    committedTokens.every((token, index) => token === domTokens[index]);

  return {
    sourceTokenCount: integrityTokens.length,
    committedTokenCount: domTokens.length,
    exactSequence,
    pageRanges,
  };
}

function App() {
  const viewerRef = useRef<ImposiaPageViewerHandle>(null);
  const sampleHeadingId = useId();
  const runtimeHeadingId = useId();
  const codeHeadingId = useId();
  const exportHeadingId = useId();
  const integrityHeadingId = useId();
  const [sampleId, setSampleId] = useState<SampleId>("integrity");
  const [pagePreset, setPagePreset] = useState<PagePreset>(DEFAULT_PAGE_PRESET);
  const [pageOrientation, setPageOrientation] = useState<PageOrientation>("portrait");
  const [extensionsEnabled, setExtensionsEnabled] = useState(true);
  const [experimentalPlacementEnabled, setExperimentalPlacementEnabled] = useState(false);
  const [codeMode, setCodeMode] = useState<CodeMode>("react");
  const [state, setState] = useState<ImposiaDocumentState>({ status: "idle" });
  const [pageDocument, setPageDocument] = useState<PageDocument>();
  const [error, setError] = useState<string>();
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportMessage, setExportMessage] = useState<string>();
  const [csrRevision, setCsrRevision] = useState(0);
  const [integrityStatus, setIntegrityStatus] = useState<IntegrityStatus>("idle");
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport>();
  const pendingCsrRevisionRef = useRef<number | undefined>(undefined);
  const csrBurstTimeoutsRef = useRef<number[]>([]);
  const extensionsEnabledRef = useRef(extensionsEnabled);
  const sampleIdRef = useRef(sampleId);
  const runningHeadExtension = useMemo<PageExtension>(
    () => ({
      name: "demo/running-head",
      decoratePage(page, context) {
        if (!extensionsEnabledRef.current || sampleIdRef.current === "integrity") return undefined;
        context.warn({
          code: "EXTENSION_DEMO_ACTIVE",
          message: "The publishing-lab running-head extension is active.",
        });
        if (page.blank) return undefined;
        return {
          headerHtml:
            '<span class="demo-running-head">Extension / live · {{pageNumber}} / {{totalPages}}</span>',
        };
      },
    }),
    [],
  );
  const sample = samples[sampleId];
  const source = useMemo(() => {
    const selectedHtml =
      sample.id === "publishing" && experimentalPlacementEnabled
        ? sample.html.replace("</style>", `${publishingPlacementCss}</style>`)
        : sample.html;
    const html =
      sample.id === "integrity"
        ? selectedHtml.replace("{{CSR_REVISION}}", String(csrRevision))
        : selectedHtml;
    return { html };
  }, [csrRevision, experimentalPlacementEnabled, sample]);
  const sourceRevision = `${extensionsEnabled ? "extensions:on" : "extensions:off"};${experimentalPlacementEnabled ? "placement:on" : "placement:off"};csr:${csrRevision}`;
  const documentOptions = useMemo<PageDocumentOptions>(
    () => ({
      extensions: [runningHeadExtension],
      experimental: { footnotes: true, pageFloats: true },
      page: { size: pagePreset.size, orientation: pageOrientation },
    }),
    [pageOrientation, pagePreset, runningHeadExtension],
  );

  const cancelCsrBurst = () => {
    for (const timeoutId of csrBurstTimeoutsRef.current) window.clearTimeout(timeoutId);
    csrBurstTimeoutsRef.current = [];
    pendingCsrRevisionRef.current = undefined;
  };

  useEffect(
    () => () => {
      for (const timeoutId of csrBurstTimeoutsRef.current) window.clearTimeout(timeoutId);
      csrBurstTimeoutsRef.current = [];
      pendingCsrRevisionRef.current = undefined;
    },
    [],
  );

  const handleReady = (nextDocument: PageDocument) => {
    setPageDocument(nextDocument);
    setError(undefined);
    if (sample.id !== "integrity") {
      setIntegrityReport(undefined);
      setIntegrityStatus("idle");
      pendingCsrRevisionRef.current = undefined;
      return;
    }

    const report = inspectIntegrity(nextDocument);
    setIntegrityReport(report);
    const pendingRevision = pendingCsrRevisionRef.current;
    if (pendingRevision !== undefined && csrRevision >= pendingRevision) {
      setIntegrityStatus(report.exactSequence ? "verified" : "failed");
      pendingCsrRevisionRef.current = undefined;
    } else if (pendingRevision === undefined) {
      setIntegrityStatus(report.exactSequence ? "verified" : "failed");
    }
  };

  const handleError = (nextError: unknown) => {
    cancelCsrBurst();
    setIntegrityReport(undefined);
    setIntegrityStatus(sampleIdRef.current === "integrity" ? "failed" : "idle");
    setError(nextError instanceof Error ? nextError.message : String(nextError));
  };

  const handleStateChange = (nextState: ImposiaDocumentState) => {
    setState(nextState);
    if (nextState.status === "loading") {
      setExportStatus("idle");
      setExportMessage(undefined);
    }
  };

  const markDocumentLoading = () => {
    cancelCsrBurst();
    setIntegrityReport(undefined);
    setIntegrityStatus("idle");
    setState(
      pageDocument === undefined
        ? { status: "loading" }
        : { status: "loading", document: pageDocument },
    );
    setExportStatus("idle");
    setExportMessage(undefined);
  };

  const handleSampleChange = (nextSampleId: SampleId) => {
    if (nextSampleId === sampleId) return;
    markDocumentLoading();
    sampleIdRef.current = nextSampleId;
    setIntegrityStatus(nextSampleId === "integrity" ? "running" : "idle");
    setSampleId(nextSampleId);
  };

  const runCsrBurst = () => {
    if (integrityStatus === "running") return;
    cancelCsrBurst();
    const targetRevision = csrRevision + 3;
    pendingCsrRevisionRef.current = targetRevision;
    setIntegrityStatus("running");
    for (const delay of [0, 16, 32]) {
      const timeoutId = window.setTimeout(() => {
        csrBurstTimeoutsRef.current = csrBurstTimeoutsRef.current.filter(
          (candidate) => candidate !== timeoutId,
        );
        setCsrRevision((revision) => revision + 1);
      }, delay);
      csrBurstTimeoutsRef.current.push(timeoutId);
    }
  };

  const handleOrientationChange = (nextOrientation: PageOrientation) => {
    if (nextOrientation === pageOrientation) return;
    markDocumentLoading();
    setPageOrientation(nextOrientation);
  };

  const handlePagePresetChange = (nextPreset: PagePreset) => {
    if (nextPreset.id === pagePreset.id) return;
    markDocumentLoading();
    setPagePreset(nextPreset);
  };

  const handleExport = async () => {
    const nextDocument = pageDocument;
    if (nextDocument === undefined || state.status !== "ready") return;

    setExportStatus("exporting");
    setExportMessage(undefined);
    try {
      const blob = await nextDocument.exportEpub({
        metadata: {
          title: sample.title,
          language: sample.id === "hangul" ? "ko" : "en",
          identifier: `urn:imposia:demo:${sample.id}`,
          modified: "2026-01-01T00:00:00Z",
        },
      });
      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        try {
          anchor.href = objectUrl;
          anchor.download = `imposia-${sample.id}.epub`;
          anchor.hidden = true;
          document.body.append(anchor);
          anchor.click();
        } finally {
          anchor.remove();
        }
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
      setExportStatus("success");
    } catch (nextError: unknown) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setExportStatus("error");
      setExportMessage(`Export failed: ${message}`);
    }
  };

  const handlePrint = async () => {
    const viewer = viewerRef.current;
    if (viewer === null || state.status !== "ready") return;

    try {
      await viewer.print();
      setError(undefined);
    } catch (nextError: unknown) {
      handleError(nextError);
    }
  };

  return (
    <div className="demo-shell">
      <aside className="demo-panel" aria-label="Imposia demo controls">
        <header className="demo-brand">
          <ImposiaMark />
          <div>
            <strong>Imposia</strong>
            <span>Integrity lab / 0.1.3</span>
          </div>
        </header>

        <section className="demo-intro">
          <p className="demo-eyebrow">CSR HTML → complete pages</p>
          <h1>No gaps in the declared page flow.</h1>
          <p>
            Paginate current client-rendered HTML, verify every source token across the page
            sequence, and keep the same canonical iframe through rapid updates.
          </p>
        </section>

        {sample.id === "integrity" ? (
          <section
            className="demo-control-section demo-integrity-section"
            aria-labelledby={integrityHeadingId}
          >
            <div className="demo-section-heading">
              <h2 id={integrityHeadingId}>Pagination integrity</h2>
              <span>
                {integrityStatus === "running"
                  ? "checking"
                  : integrityReport?.exactSequence
                    ? "exact sequence"
                    : "not verified"}
              </span>
            </div>
            <output
              className={`demo-integrity-status demo-integrity-status-${integrityStatus}`}
              data-testid="integrity-status"
              aria-live="polite"
            >
              <strong data-testid="integrity-count">
                {integrityReport === undefined
                  ? "— / 96"
                  : `${integrityReport.committedTokenCount} / ${integrityReport.sourceTokenCount}`}
              </strong>
              <span>
                {integrityStatus === "running"
                  ? "Checking the next committed generation…"
                  : integrityReport?.exactSequence
                    ? `Exact and ordered · CSR revision ${csrRevision}`
                    : "The committed sequence does not match the source."}
              </span>
            </output>
            <ol className="demo-integrity-ranges" data-testid="integrity-page-ranges">
              {integrityReport?.pageRanges.map((range) => (
                <li key={range.page}>
                  <span>Page {range.page}</span>
                  <code>
                    {range.first} → {range.last}
                  </code>
                  <small>{range.count} tokens</small>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="demo-output-button"
              data-testid="run-csr-burst"
              onClick={runCsrBurst}
              disabled={integrityStatus === "running"}
            >
              Run 3-update CSR burst
            </button>
          </section>
        ) : null}

        <section className="demo-control-section" aria-labelledby={sampleHeadingId}>
          <div className="demo-section-heading">
            <h2 id={sampleHeadingId}>Document specimen</h2>
            <span>{String(Object.keys(samples).length).padStart(2, "0")} sources</span>
          </div>
          <div className="demo-sample-list">
            {Object.values(samples).map((candidate) => (
              <button
                type="button"
                className="demo-sample"
                data-sample-id={candidate.id}
                aria-pressed={sampleId === candidate.id}
                key={candidate.id}
                onClick={() => handleSampleChange(candidate.id)}
              >
                <span>{candidate.index}</span>
                <strong>{candidate.title}</strong>
                <small>{candidate.summary}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="demo-control-section" aria-labelledby={runtimeHeadingId}>
          <div className="demo-section-heading">
            <h2 id={runtimeHeadingId}>Runtime boundary</h2>
            <span>{extensionsEnabled ? "decorated" : "undecorated"}</span>
          </div>
          <div className="demo-runtime-controls">
            <PageSetup
              preset={pagePreset}
              orientation={pageOrientation}
              onPresetChange={handlePagePresetChange}
              onOrientationChange={handleOrientationChange}
            />
            <label className="demo-switch">
              <span>
                <strong>Running-head extension</strong>
                <small>Ordered, sanitized, controller-lifetime</small>
              </span>
              <input
                type="checkbox"
                checked={extensionsEnabled}
                onChange={(event) => {
                  markDocumentLoading();
                  const nextExtensionsEnabled = event.currentTarget.checked;
                  extensionsEnabledRef.current = nextExtensionsEnabled;
                  setExtensionsEnabled(nextExtensionsEnabled);
                }}
              />
              <i aria-hidden="true"></i>
            </label>
            {sample.id === "publishing" ? (
              <label className="demo-switch">
                <span>
                  <strong>Experimental placement</strong>
                  <small>Authored footnotes + page floats / opt-in</small>
                </span>
                <input
                  type="checkbox"
                  checked={experimentalPlacementEnabled}
                  onChange={(event) => {
                    markDocumentLoading();
                    setExperimentalPlacementEnabled(event.currentTarget.checked);
                  }}
                />
                <i aria-hidden="true"></i>
              </label>
            ) : null}
          </div>
        </section>

        <section
          className="demo-control-section demo-export-section"
          aria-labelledby={exportHeadingId}
        >
          <div className="demo-section-heading">
            <h2 id={exportHeadingId}>Portable output</h2>
            <span>PDF / EPUB</span>
          </div>
          <div className="demo-output-actions">
            <div className="demo-export-action">
              <div className="demo-export-copy">
                <strong>Print or save the current pages</strong>
                <small>Native browser dialog / canonical iframe</small>
              </div>
              <button
                type="button"
                className="demo-output-button demo-print-button"
                onClick={() => void handlePrint()}
                disabled={state.status !== "ready"}
              >
                Print / Save PDF
              </button>
            </div>
            <div className="demo-export-action">
              <div className="demo-export-copy">
                <strong>Download the semantic document</strong>
                <small>Deterministic EPUB 3 / browser-only</small>
              </div>
              <button
                type="button"
                className="demo-output-button demo-export-button"
                onClick={() => void handleExport()}
                disabled={
                  state.status !== "ready" ||
                  pageDocument === undefined ||
                  exportStatus === "exporting"
                }
              >
                Download EPUB
              </button>
              <output
                className={`demo-export-status demo-export-status-${exportStatus}`}
                data-testid="demo-export-status"
                aria-live="polite"
              >
                {exportStatusLabel(
                  exportStatus,
                  exportMessage,
                  state.status === "ready" && pageDocument !== undefined,
                )}
              </output>
            </div>
          </div>
        </section>

        <section className="demo-code" aria-labelledby={codeHeadingId}>
          <div className="demo-code-tabs">
            <h2 id={codeHeadingId}>Use the surface</h2>
            <fieldset className="demo-code-mode" aria-label="API example">
              {(["react", "core"] as const).map((mode) => (
                <button
                  type="button"
                  aria-pressed={codeMode === mode}
                  key={mode}
                  onClick={() => setCodeMode(mode)}
                >
                  {mode === "react" ? "React" : "Core"}
                </button>
              ))}
            </fieldset>
          </div>
          <pre data-testid="demo-code-snippet">
            <code>{snippets[codeMode]}</code>
          </pre>
        </section>
      </aside>

      <section className="demo-workspace" aria-label="Live document preview">
        <header className="demo-workspace-header">
          <div>
            <span className={`demo-status demo-status-${state.status}`}>
              <i aria-hidden="true"></i>
              {statusLabel(state.status)}
            </span>
            <strong>{sample.title}</strong>
          </div>
          <dl className="demo-metrics" aria-label="Document metrics">
            <div>
              <dt>Pages</dt>
              <dd data-testid="metric-pages">{pageDocument?.pageCount ?? "—"}</dd>
            </div>
            <div>
              <dt>Generation</dt>
              <dd data-testid="metric-generation">{pageDocument?.generation ?? "—"}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd data-testid="metric-warnings">{pageDocument?.warnings.length ?? "—"}</dd>
            </div>
            <div>
              <dt>Layout</dt>
              <dd>
                {pageDocument === undefined
                  ? "—"
                  : `${Math.round(pageDocument.timings.totalMs)} ms`}
              </dd>
            </div>
            <div>
              <dt>Sheet</dt>
              <dd data-testid="metric-sheet">
                {pageDocument?.pages[0]?.geometry === undefined
                  ? "—"
                  : `${Math.round(pageDocument.pages[0].geometry.sheetWidthCssPx)} × ${Math.round(pageDocument.pages[0].geometry.sheetHeightCssPx)} px`}
              </dd>
            </div>
          </dl>
        </header>

        <div className="demo-preview">
          <div className="demo-preview-label" aria-hidden="true">
            <span>Live browser output</span>
            <span>Use the viewer rail to move, zoom, and switch modes</span>
          </div>
          <div className="demo-preview-surface" data-testid="demo-preview-surface">
            <ImposiaPageViewer
              ref={viewerRef}
              source={source}
              sourceRevision={sourceRevision}
              documentOptions={documentOptions}
              documentOptionsRevision={`${pagePreset.id}:${pageOrientation}`}
              viewerOptions={{ mode: "continuous", zoom: 0.9 }}
              className="demo-viewer"
              onReady={handleReady}
              onError={handleError}
              onStateChange={handleStateChange}
            />
          </div>
          {error === undefined ? null : (
            <p className="demo-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

const app = document.querySelector("#app");
if (app === null) throw new Error("Imposia demo host is missing.");
createRoot(app).render(<App />);
