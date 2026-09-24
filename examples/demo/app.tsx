import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
  ImposiaPublicationViewer,
  type ImposiaPublicationViewerHandle,
  type PageDocument,
  type PageViewerState,
  type PublicationSnapshot,
} from "@imposia/react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Files,
  FileText,
  Hash,
  LayoutDashboard,
  type LucideIcon,
  Minus,
  PenLine,
  Plus,
  Printer,
  Receipt,
  Rows3,
  Scissors,
  ShieldCheck,
  Sigma,
  Table,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  batchEntries,
  type MarginId,
  type NoticeIcon,
  type Orientation,
  type PageSetup,
  type PageSizeId,
  TEMPLATES,
  type TemplateId,
  templateHtml,
} from "./templates.js";

const TEMPLATE_ICONS: Readonly<Record<TemplateId, LucideIcon>> = {
  invoice: Receipt,
  statement: Table,
  report: LayoutDashboard,
  agreement: FileText,
  batch: Files,
};

const NOTICE_ICONS: Readonly<Record<NoticeIcon, LucideIcon>> = {
  rows: Rows3,
  hash: Hash,
  scissors: Scissors,
  grid: LayoutDashboard,
  files: Files,
  pen: PenLine,
  sum: Sigma,
};

const VIEWER_OPTIONS = { controls: false, mode: "continuous", zoom: 0.8 } as const;
const BURST_UPDATES = 20;

/**
 * Deterministically rejected by Core in every engine: the source exceeds the
 * default 5 MiB `maxInputBytes`, so the update fails before any layout.
 */
let brokenFiller: string | undefined;
function brokenPayload(): string {
  brokenFiller ??= `<p hidden>${"#".repeat(6 * 1024 * 1024)}</p>`;
  return brokenFiller;
}

type DocumentInfo = Readonly<{ pageCount: number; ms: number; warnings: number }>;

type Proof = Readonly<{
  updates: number;
  commits: number;
  partialFrames: number;
  result?: Readonly<{ kind: "ok" | "rejected"; text: string }> | undefined;
}>;

type Segment<T extends string> = Readonly<{ value: T; label: string }>;

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a segmented control is a group of pressed buttons
    <div aria-label={label} className="pg-segmented" role="group">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GithubMark({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Logo() {
  return (
    <a className="pg-logo" href="/">
      <span aria-hidden="true" className="pg-logo-mark">
        <BookOpen size={14} strokeWidth={2.4} />
      </span>
      <span className="pg-logo-text">Imposia</span>
      <span className="pg-pill">Playground</span>
    </a>
  );
}

function pageLabel(state: PageViewerState | undefined, fallbackCount: number | undefined): string {
  if (state === undefined) return fallbackCount === undefined ? "…" : `${fallbackCount} pages`;
  if (state.effectiveMode !== "spread") return `${state.page} / ${state.pageCount}`;
  // Without a cover page, spreads pair 1–2, 3–4, and so on.
  const start = state.page % 2 === 1 ? state.page : state.page - 1;
  const end = Math.min(state.pageCount, start + 1);
  return `${start === end ? start : `${start}–${end}`} / ${state.pageCount}`;
}

function App() {
  const pageViewer = useRef<ImposiaPageViewerHandle>(null);
  const publicationViewer = useRef<ImposiaPublicationViewerHandle>(null);
  const [templateId, setTemplateId] = useState<TemplateId>("statement");
  const [counts, setCounts] = useState<Record<TemplateId, number>>(
    () =>
      Object.fromEntries(TEMPLATES.map((item) => [item.id, item.countDefault])) as Record<
        TemplateId,
        number
      >,
  );
  const [names, setNames] = useState<Record<TemplateId, string>>(
    () =>
      Object.fromEntries(TEMPLATES.map((item) => [item.id, item.nameDefault])) as Record<
        TemplateId,
        string
      >,
  );
  const [page, setPage] = useState<PageSetup>({
    size: "A4",
    orientation: "portrait",
    margin: "normal",
  });
  const [tab, setTab] = useState<"notice" | "code">("notice");
  const [mode, setMode] = useState<"continuous" | "spread">("continuous");
  const [zoom, setZoom] = useState<number>(VIEWER_OPTIONS.zoom);
  const [viewerState, setViewerState] = useState<PageViewerState>();
  const [info, setInfo] = useState<DocumentInfo>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const [broken, setBroken] = useState(false);
  const [proof, setProof] = useState<Proof>({ updates: 0, commits: 0, partialFrames: 0 });
  const committedPageCounts = useRef(new Map<number, number>());
  const burstTimers = useRef<number[]>([]);

  const template = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];
  if (template === undefined) throw new Error("No playground templates.");
  const input = useMemo(
    () => ({ count: counts[templateId], name: names[templateId], page }),
    [counts, names, page, templateId],
  );

  const source = useMemo(() => {
    if (templateId === "batch") return undefined;
    const html = templateHtml(templateId, input);
    return { html: broken ? html + brokenPayload() : html };
  }, [broken, input, templateId]);

  const snapshot = useMemo<PublicationSnapshot | undefined>(() => {
    if (templateId !== "batch") return undefined;
    const entries = batchEntries(input).map((entry, index) =>
      broken && index === 0 ? { ...entry, html: entry.html + brokenPayload() } : entry,
    );
    return {
      metadata: { title: "September invoices", language: "en" },
      entries,
    };
  }, [broken, input, templateId]);

  // Every source or snapshot change is one update sent to Imposia.
  const sourceKey = source ?? snapshot;
  useEffect(() => {
    if (sourceKey === undefined) return;
    setProof((current) => ({ ...current, updates: current.updates + 1 }));
    setStatus("loading");
  }, [sourceKey]);

  const currentIframe = useCallback(
    () =>
      (templateId === "batch" ? publicationViewer.current : pageViewer.current)?.current?.iframe,
    [templateId],
  );

  // Watch every rendered frame: a frame is half-built when the canonical frame
  // shows a generation whose page count differs from what that generation
  // committed. Imposia swaps complete page sets, so this stays at zero.
  useEffect(() => {
    let frame = 0;
    const sample = () => {
      const frameDocument = currentIframe()?.contentDocument;
      const stamp = Number(frameDocument?.documentElement.getAttribute("data-imposia-generation"));
      const expected = committedPageCounts.current.get(stamp);
      if (frameDocument && expected !== undefined) {
        const shown = frameDocument.querySelectorAll("[data-imposia-page]").length;
        if (shown !== expected) {
          setProof((current) => ({ ...current, partialFrames: current.partialFrames + 1 }));
        }
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frame);
  }, [currentIframe]);

  useEffect(
    () => () => {
      for (const timer of burstTimers.current) window.clearTimeout(timer);
    },
    [],
  );

  const handleReady = useCallback((document: PageDocument) => {
    committedPageCounts.current.set(document.generation, document.pageCount);
    setInfo({
      pageCount: document.pageCount,
      ms: Math.round(document.timings.totalMs),
      warnings: document.warnings.length,
    });
    setStatus("ready");
    setError(undefined);
    setProof((current) => ({ ...current, commits: current.commits + 1 }));
  }, []);

  const brokenRef = useRef(broken);
  brokenRef.current = broken;
  const handleError = useCallback((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (brokenRef.current) {
      setProof((current) => ({
        ...current,
        result: {
          kind: "rejected",
          text: "Broken update rejected. The previous pages stayed on screen.",
        },
      }));
      // Send a valid update again; it replaces the survivor in one swap.
      setBroken(false);
      return;
    }
    setStatus("error");
    setError(message);
  }, []);

  const selectTemplate = (id: TemplateId) => {
    if (id === templateId) return;
    committedPageCounts.current.clear();
    setInfo(undefined);
    setViewerState(undefined);
    setMode("continuous");
    setZoom(VIEWER_OPTIONS.zoom);
    setTemplateId(id);
  };

  const setCount = (value: number) => setCounts((current) => ({ ...current, [templateId]: value }));
  const setName = (value: string) => setNames((current) => ({ ...current, [templateId]: value }));

  const runBurst = () => {
    for (const timer of burstTimers.current) window.clearTimeout(timer);
    const base = counts[templateId];
    burstTimers.current = Array.from({ length: BURST_UPDATES }, (_value, index) =>
      window.setTimeout(() => {
        const step = index === BURST_UPDATES - 1 ? 0 : index % 2 === 0 ? 1 : 2;
        setCounts((current) => ({
          ...current,
          [templateId]: Math.min(template.countMax, Math.max(template.countMin, base + step)),
        }));
      }, index * 12),
    );
    setProof((current) => ({
      ...current,
      result: {
        kind: "ok",
        text: "Rapid edits sent back to back. Every frame showed a complete page set.",
      },
    }));
  };

  const runBroken = () => {
    if (status !== "ready") return;
    setBroken(true);
  };

  const changeMode = (next: "continuous" | "spread") => {
    setMode(next);
    (templateId === "batch" ? publicationViewer.current : pageViewer.current)?.setMode(next);
  };

  const changeZoom = (delta: number) => {
    const next = Math.round(Math.min(1.6, Math.max(0.4, zoom + delta)) * 10) / 10;
    setZoom(next);
    pageViewer.current?.setZoom(next);
  };

  const print = () => {
    const viewer = templateId === "batch" ? publicationViewer.current : pageViewer.current;
    void viewer?.print().catch((reason: unknown) => handleError(reason));
  };

  const ready = status === "ready" || info !== undefined;

  return (
    <div className="pg-app">
      <header className="pg-topbar">
        <Logo />
        <nav aria-label="Links" className="pg-topbar-links">
          <a href="/en/docs">
            <BookOpen aria-hidden="true" size={15} />
            Docs
          </a>
          <a href="https://github.com/EungyuCho/imposia">
            <GithubMark />
            GitHub
          </a>
          <span aria-hidden="true" className="pg-sep" />
          <button
            aria-label="Print / Save as PDF"
            className="pg-primary"
            disabled={!ready}
            onClick={print}
            type="button"
          >
            <Printer aria-hidden="true" size={15} />
            <span>Print / Save as PDF</span>
          </button>
        </nav>
      </header>

      <div className="pg-workspace">
        <aside aria-label="Document controls" className="pg-sidebar">
          <section className="pg-section">
            <h2 className="pg-label">Template</h2>
            <div className="pg-templates">
              {TEMPLATES.map((item) => {
                const Icon = TEMPLATE_ICONS[item.id];
                return (
                  <button
                    aria-pressed={item.id === templateId}
                    className="pg-template"
                    key={item.id}
                    onClick={() => selectTemplate(item.id)}
                    type="button"
                  >
                    <span aria-hidden="true" className="pg-template-icon">
                      <Icon size={16} />
                    </span>
                    <span className="pg-template-text">
                      <strong>{item.title}</strong>
                      <span>{item.summary}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="pg-section">
            <h2 className="pg-label">Data</h2>
            <label className="pg-slider">
              <span className="pg-slider-head">
                <span>{template.countLabel}</span>
                <output className="pg-mono">{counts[templateId].toLocaleString("en-US")}</output>
              </span>
              <input
                max={template.countMax}
                min={template.countMin}
                onChange={(event) => setCount(Number(event.currentTarget.value))}
                type="range"
                value={counts[templateId]}
              />
              <span className="pg-slider-scale pg-mono">
                <span>{template.countMin}</span>
                <span>{template.countMax.toLocaleString("en-US")}</span>
              </span>
            </label>
            <label className="pg-field">
              <span>{template.nameLabel}</span>
              <input
                maxLength={60}
                onChange={(event) => setName(event.currentTarget.value)}
                type="text"
                value={names[templateId]}
              />
            </label>
          </section>

          <section className="pg-section">
            <h2 className="pg-label">Page</h2>
            <Segmented<PageSizeId>
              label="Paper size"
              onChange={(size) => setPage((current) => ({ ...current, size }))}
              options={[
                { value: "A4", label: "A4" },
                { value: "Letter", label: "Letter" },
                { value: "A5", label: "A5" },
              ]}
              value={page.size}
            />
            <Segmented<Orientation>
              label="Orientation"
              onChange={(orientation) => setPage((current) => ({ ...current, orientation }))}
              options={[
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
              value={page.orientation}
            />
            <Segmented<MarginId>
              label="Margins"
              onChange={(margin) => setPage((current) => ({ ...current, margin }))}
              options={[
                { value: "narrow", label: "Narrow" },
                { value: "normal", label: "Normal" },
                { value: "wide", label: "Wide" },
              ]}
              value={page.margin}
            />
          </section>
        </aside>

        <main className="pg-viewer">
          <div className="pg-viewer-bar">
            <Segmented<"continuous" | "spread">
              label="View"
              onChange={changeMode}
              options={[
                { value: "continuous", label: "Scroll" },
                { value: "spread", label: "Spread" },
              ]}
              value={mode}
            />
            {templateId === "batch" ? (
              <span className="pg-mono pg-viewer-pages">
                {pageLabel(undefined, info?.pageCount)}
              </span>
            ) : (
              <span className="pg-viewer-nav">
                <button
                  aria-label="Previous page"
                  disabled={!ready || (viewerState?.page ?? 1) <= 1}
                  onClick={() => pageViewer.current?.previousPage()}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" size={15} />
                </button>
                <span aria-live="polite" className="pg-mono pg-viewer-pages">
                  {pageLabel(viewerState, info?.pageCount)}
                </span>
                <button
                  aria-label="Next page"
                  disabled={!ready || (viewerState?.page ?? 1) >= (viewerState?.pageCount ?? 1)}
                  onClick={() => pageViewer.current?.nextPage()}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" size={15} />
                </button>
              </span>
            )}
            {templateId === "batch" ? (
              <span />
            ) : (
              <span className="pg-viewer-zoom">
                <button aria-label="Zoom out" onClick={() => changeZoom(-0.1)} type="button">
                  <Minus aria-hidden="true" size={14} />
                </button>
                <span className="pg-mono">{Math.round(zoom * 100)}%</span>
                <button aria-label="Zoom in" onClick={() => changeZoom(0.1)} type="button">
                  <Plus aria-hidden="true" size={14} />
                </button>
              </span>
            )}
          </div>

          <div className="pg-stage">
            {templateId === "batch" && snapshot !== undefined ? (
              <ImposiaPublicationViewer
                className="pg-host"
                key="batch"
                onError={handleError}
                onReady={handleReady}
                publicationOptions={{ pageNumbering: "entry" }}
                ref={publicationViewer}
                snapshot={snapshot}
                viewerOptions={VIEWER_OPTIONS}
              />
            ) : source !== undefined ? (
              <ImposiaPageViewer
                className="pg-host"
                key="document"
                onError={handleError}
                onReady={handleReady}
                onViewerStateChange={setViewerState}
                ref={pageViewer}
                source={source}
                viewerOptions={VIEWER_OPTIONS}
              />
            ) : null}
          </div>

          <div className="pg-status" role="status">
            {status === "error" ? (
              <span className="pg-status-item pg-status-error">
                <CircleAlert aria-hidden="true" size={13} />
                {error}
              </span>
            ) : (
              <span className="pg-status-item">
                <span
                  aria-hidden="true"
                  className={status === "ready" ? "pg-dot is-ready" : "pg-dot"}
                />
                <strong>{status === "ready" ? "Committed" : "Paginating"}</strong>
                {info !== undefined ? (
                  <span>
                    {info.pageCount} {info.pageCount === 1 ? "page" : "pages"} · composed in{" "}
                    {info.ms} ms
                  </span>
                ) : null}
              </span>
            )}
            {info !== undefined ? (
              <span className="pg-status-item">
                {info.warnings === 0 ? (
                  <CircleCheck aria-hidden="true" className="pg-ok" size={13} />
                ) : (
                  <TriangleAlert aria-hidden="true" className="pg-warn" size={13} />
                )}
                {info.warnings === 0
                  ? "No warnings"
                  : `${info.warnings} ${info.warnings === 1 ? "warning" : "warnings"}`}
              </span>
            ) : null}
          </div>
        </main>

        <aside aria-label="About this document" className="pg-panel">
          <div className="pg-tabs" role="tablist">
            <button
              aria-selected={tab === "notice"}
              onClick={() => setTab("notice")}
              role="tab"
              type="button"
            >
              What to notice
            </button>
            <button
              aria-selected={tab === "code"}
              onClick={() => setTab("code")}
              role="tab"
              type="button"
            >
              Code
            </button>
          </div>

          {tab === "notice" ? (
            <div className="pg-notices">
              {template.notices.map((notice) => {
                const Icon = NOTICE_ICONS[notice.icon];
                return (
                  <article className="pg-notice" key={notice.title}>
                    <span aria-hidden="true" className="pg-notice-icon">
                      <Icon size={15} />
                    </span>
                    <div>
                      <h3>{notice.title}</h3>
                      <p>{notice.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <pre className="pg-code">
              <code>{template.code}</code>
            </pre>
          )}

          <section aria-labelledby="pg-proof-title" className="pg-proof">
            <h3 id="pg-proof-title">Try to break it</h3>
            <p>
              Updates finish off-screen. The pages you see are always one complete set, even while
              you drag the slider.
            </p>
            <dl className="pg-proof-stats">
              <div>
                <dt>Updates sent</dt>
                <dd className="pg-mono">{proof.updates}</dd>
              </div>
              <div>
                <dt>Committed</dt>
                <dd className="pg-mono">{proof.commits}</dd>
              </div>
              <div>
                <dt>Half-built frames</dt>
                <dd className={proof.partialFrames === 0 ? "pg-mono pg-good" : "pg-mono"}>
                  {proof.partialFrames}
                </dd>
              </div>
            </dl>
            <div className="pg-proof-actions">
              <button className="pg-outline" disabled={!ready} onClick={runBurst} type="button">
                <Zap aria-hidden="true" size={14} />
                Send {BURST_UPDATES} rapid edits
              </button>
              <button
                className="pg-outline"
                disabled={status !== "ready" || broken}
                onClick={runBroken}
                type="button"
              >
                <TriangleAlert aria-hidden="true" size={14} />
                Send a broken update
              </button>
            </div>
            {proof.result !== undefined ? (
              <p
                className={
                  proof.result.kind === "rejected"
                    ? "pg-proof-result is-guarded"
                    : "pg-proof-result"
                }
              >
                <ShieldCheck aria-hidden="true" size={14} />
                {proof.result.text}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

const host = document.getElementById("app");
if (host === null) throw new Error("Missing #app host.");
createRoot(host).render(<App />);
