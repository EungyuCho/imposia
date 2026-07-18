import {
  type ImposiaDocumentState,
  ImposiaPageViewer,
  type PageDocument,
  type PageExtension,
} from "@imposia/react";
import { useId, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type SampleId = "editorial" | "brief" | "hangul";
type CodeMode = "react" | "core";

type DemoSample = Readonly<{
  id: SampleId;
  index: string;
  title: string;
  summary: string;
  html: string;
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

const samples: Record<SampleId, DemoSample> = {
  editorial: {
    id: "editorial",
    index: "01",
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
    index: "02",
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
    index: "03",
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
};

const runningHeadExtension: PageExtension = {
  name: "demo/running-head",
  decoratePage(page, context) {
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
};

const snippets: Record<CodeMode, string> = {
  react: `import { ImposiaPageViewer } from "@imposia/react";
import "@imposia/react/styles.css";

<ImposiaPageViewer
  source={{ html }}
  documentOptions={{ extensions }}
  onReady={({ pageCount }) => setPages(pageCount)}
/>`,
  core: `import { mountPageDocument, mountPageViewer } from "@imposia/client";

const controller = mountPageDocument(host, { html }, { extensions });
const pageDocument = await controller.ready;
const viewer = mountPageViewer(host, pageDocument);`,
};

function statusLabel(state: ImposiaDocumentState["status"]): string {
  if (state === "ready") return "Ready";
  if (state === "loading") return "Paginating";
  if (state === "error") return "Error";
  return "Idle";
}

function App() {
  const sampleHeadingId = useId();
  const runtimeHeadingId = useId();
  const codeHeadingId = useId();
  const [sampleId, setSampleId] = useState<SampleId>("editorial");
  const [extensionsEnabled, setExtensionsEnabled] = useState(true);
  const [codeMode, setCodeMode] = useState<CodeMode>("react");
  const [state, setState] = useState<ImposiaDocumentState>({ status: "idle" });
  const [pageDocument, setPageDocument] = useState<PageDocument>();
  const [error, setError] = useState<string>();
  const sample = samples[sampleId];
  const documentOptions = useMemo(
    () => ({ extensions: extensionsEnabled ? [runningHeadExtension] : [] }),
    [extensionsEnabled],
  );

  const handleReady = (nextDocument: PageDocument) => {
    setPageDocument(nextDocument);
    setError(undefined);
  };

  const handleError = (nextError: unknown) => {
    setError(nextError instanceof Error ? nextError.message : String(nextError));
  };

  return (
    <div className="demo-shell">
      <aside className="demo-panel" aria-label="Imposia demo controls">
        <header className="demo-brand">
          <span className="demo-brand-mark" aria-hidden="true">
            IM
          </span>
          <div>
            <strong>Imposia</strong>
            <span>Publishing lab / 0.1</span>
          </div>
        </header>

        <section className="demo-intro">
          <p className="demo-eyebrow">HTML → canonical pages</p>
          <h1>Documents that stay documents.</h1>
          <p>
            A React-first, browser-only showcase. Switch the source and watch the same canonical
            iframe update in place.
          </p>
        </section>

        <section className="demo-control-section" aria-labelledby={sampleHeadingId}>
          <div className="demo-section-heading">
            <h2 id={sampleHeadingId}>Document specimen</h2>
            <span>03 sources</span>
          </div>
          <div className="demo-sample-list">
            {Object.values(samples).map((candidate) => (
              <button
                type="button"
                className="demo-sample"
                data-sample-id={candidate.id}
                aria-pressed={sampleId === candidate.id}
                key={candidate.id}
                onClick={() => setSampleId(candidate.id)}
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
            <span>{extensionsEnabled ? "composed" : "core only"}</span>
          </div>
          <label className="demo-switch">
            <span>
              <strong>Running-head extension</strong>
              <small>Ordered, sanitized, controller-lifetime</small>
            </span>
            <input
              type="checkbox"
              checked={extensionsEnabled}
              onChange={(event) => setExtensionsEnabled(event.currentTarget.checked)}
            />
            <i aria-hidden="true"></i>
          </label>
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
          </dl>
        </header>

        <div className="demo-preview">
          <div className="demo-preview-label" aria-hidden="true">
            <span>Live browser output</span>
            <span>Use the viewer rail to move, zoom, and switch modes</span>
          </div>
          <div className="demo-preview-surface" data-testid="demo-preview-surface">
            <ImposiaPageViewer
              key={extensionsEnabled ? "extensions-on" : "extensions-off"}
              source={{ html: sample.html }}
              documentOptions={documentOptions}
              viewerOptions={{ mode: "continuous", zoom: 0.9 }}
              className="demo-viewer"
              onReady={handleReady}
              onError={handleError}
              onStateChange={setState}
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
