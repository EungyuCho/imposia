import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { summarizeLatencies } from "./live-render-metrics.js";

type EditorStatus = "ready" | "updating";
type EditorCommand = "bold" | "italic" | "formatBlock";

export type LiveEditorMetrics = Readonly<{
  status: EditorStatus;
  requested: number;
  committed: number;
  superseded: number;
  p50Ms: number | undefined;
  p95Ms: number | undefined;
}>;

type LiveEditorProps = Readonly<{
  html: string;
  metrics: LiveEditorMetrics;
  onChange: (html: string, requestedAt: number) => void;
}>;

const initialMetrics: LiveEditorMetrics = {
  status: "ready",
  requested: 0,
  committed: 0,
  superseded: 0,
  p50Ms: undefined,
  p95Ms: undefined,
};

export const initialEditorHtml = `
  <p class="kicker">Live editorial desk · browser source</p>
  <h1>Edit this page while it stays paginated.</h1>
  <p class="lede">Type, select text, or apply a simple format. Imposia keeps the last committed pages visible until the next complete generation is ready.</p>
  <h2>One source, one committed sequence</h2>
  <p>The editor changes ordinary client-side HTML. Each settled edit becomes a new source revision, and the preview records input-to-commit latency without replacing the canonical iframe.</p>
  <blockquote class="note">Try changing this sentence quickly. The preview should never flash blank or expose a half-paginated document.</blockquote>
`;

export function useLiveEditorMetrics() {
  const [metrics, setMetrics] = useState<LiveEditorMetrics>(initialMetrics);
  const revisionRef = useRef(0);
  const requestTimesRef = useRef(new Map<number, number>());
  const committedRevisionsRef = useRef(new Set<number>());
  const latenciesRef = useRef<number[]>([]);

  const requestRevision = useCallback((requestedAt: number): number => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    requestTimesRef.current.set(revision, requestedAt);
    setMetrics((current) => ({
      ...current,
      status: "updating",
      requested: current.requested + 1,
    }));
    return revision;
  }, []);

  const recordCommit = useCallback((revision: number) => {
    const requestedAt = requestTimesRef.current.get(revision);
    if (requestedAt === undefined || committedRevisionsRef.current.has(revision)) return;
    committedRevisionsRef.current.add(revision);
    latenciesRef.current.push(performance.now() - requestedAt);
    const latency = summarizeLatencies(latenciesRef.current);
    setMetrics((current) => ({
      status: revision === revisionRef.current ? "ready" : "updating",
      requested: current.requested,
      committed: current.committed + 1,
      superseded:
        revision === revisionRef.current
          ? Math.max(0, current.requested - current.committed - 1)
          : current.superseded,
      p50Ms: latency.p50Ms,
      p95Ms: latency.p95Ms,
    }));
  }, []);

  return { metrics, requestRevision, recordCommit };
}

function formatLatency(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.round(value)} ms`;
}

export function LiveEditor({ html, metrics, onChange }: LiveEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | undefined>(undefined);

  const queueChange = useCallback(
    (nextHtml: string) => {
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
      const requestedAt = performance.now();
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = undefined;
        onChange(nextHtml, requestedAt);
      }, 80);
    },
    [onChange],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor !== null && editor.childNodes.length === 0) editor.innerHTML = html;
  }, [html]);

  const applyCommand = (command: EditorCommand, value?: string) => {
    const editor = editorRef.current;
    if (editor === null) return;
    editor.focus();
    document.execCommand(command, false, value);
    queueChange(editor.innerHTML);
  };

  return (
    <section
      className="demo-control-section demo-editor-section"
      aria-labelledby="live-editor-title"
    >
      <div className="demo-section-heading">
        <h2 id="live-editor-title">Live HTML editor</h2>
        <span>{metrics.status === "updating" ? "paginating" : "committed"}</span>
      </div>
      <p className="demo-editor-copy">
        A lightweight Tiptap-style editing surface. Input settles for 80 ms before the latest HTML
        revision enters pagination.
      </p>
      <div className="demo-editor-toolbar" role="toolbar" aria-label="Text formatting">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("bold")}
        >
          Bold
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("italic")}
        >
          Italic
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("formatBlock", "h2")}
        >
          Heading
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("formatBlock", "blockquote")}
        >
          Quote
        </button>
      </div>
      <div
        ref={editorRef}
        className="demo-editor-canvas"
        contentEditable
        suppressContentEditableWarning
        data-testid="live-editor"
        onInput={(event) => queueChange(event.currentTarget.innerHTML)}
      />
      <output className="demo-editor-status" aria-live="polite">
        {metrics.status === "updating"
          ? "Keeping the previous committed pages visible…"
          : "Latest editor revision committed"}
      </output>
      <dl className="demo-live-metrics" aria-label="Editor pagination metrics">
        <div>
          <dt>Updates</dt>
          <dd data-testid="editor-requested">{metrics.requested}</dd>
        </div>
        <div>
          <dt>Committed</dt>
          <dd data-testid="editor-committed">{metrics.committed}</dd>
        </div>
        <div>
          <dt>Coalesced</dt>
          <dd data-testid="editor-superseded">{metrics.superseded}</dd>
        </div>
        <div>
          <dt>p50 commit</dt>
          <dd data-testid="editor-p50">{formatLatency(metrics.p50Ms)}</dd>
        </div>
        <div>
          <dt>p95 commit</dt>
          <dd data-testid="editor-p95">{formatLatency(metrics.p95Ms)}</dd>
        </div>
      </dl>
    </section>
  );
}
