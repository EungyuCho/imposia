import { useId, useState } from "react";
import {
  type LiveRenderSnapshot,
  liveRenderPresetById,
  liveRenderPresets,
  type RunnerPresetId,
  type RunnerStatus,
} from "./live-render-runner.js";

type LiveRenderRunnerProps = Readonly<{
  snapshot: LiveRenderSnapshot;
  disabled: boolean;
  onStart: (presetId: RunnerPresetId) => void;
  onCancel: () => void;
}>;

function isPresetId(value: string): value is RunnerPresetId {
  return value === "typing" || value === "live" || value === "pressure";
}

function formatLatency(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.round(value)} ms`;
}

function statusCopy(status: RunnerStatus): string {
  if (status === "running") return "Streaming source revisions…";
  if (status === "complete") return "Latest revision committed";
  if (status === "failed") return "Committed sequence failed";
  if (status === "cancelled") return "Run cancelled";
  return "Ready for a sustained update run";
}

export function LiveRenderRunner({ snapshot, disabled, onStart, onCancel }: LiveRenderRunnerProps) {
  const selectId = useId();
  const [presetId, setPresetId] = useState<RunnerPresetId>("live");
  const preset = liveRenderPresetById(presetId);
  const running = snapshot.status === "running";
  const settled = snapshot.status === "complete" || snapshot.status === "failed";

  return (
    <div className="demo-live-runner">
      <label className="demo-live-preset" htmlFor={selectId}>
        <span>Continuous HTML workload</span>
        <small>{preset.detail}</small>
      </label>
      <select
        id={selectId}
        value={presetId}
        onChange={(event) => {
          const nextPresetId = event.currentTarget.value;
          if (isPresetId(nextPresetId)) setPresetId(nextPresetId);
        }}
        disabled={running}
        data-testid="live-render-preset"
      >
        {liveRenderPresets.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </select>
      <div className="demo-live-actions">
        <button
          type="button"
          className="demo-output-button"
          onClick={() => onStart(presetId)}
          disabled={disabled || running}
          data-testid="run-live-render"
        >
          Run live render
        </button>
        {running ? (
          <button
            type="button"
            className="demo-live-cancel"
            onClick={onCancel}
            data-testid="cancel-live-render"
          >
            Stop
          </button>
        ) : null}
      </div>
      <output
        className={`demo-live-status demo-live-status-${snapshot.status}`}
        data-testid="live-render-status"
        aria-live="polite"
      >
        {statusCopy(snapshot.status)}
      </output>
      <dl className="demo-live-metrics" aria-label="Live render metrics">
        <div>
          <dt>Requested</dt>
          <dd data-testid="live-render-requested">{snapshot.requested}</dd>
        </div>
        <div>
          <dt>Committed</dt>
          <dd data-testid="live-render-committed">{snapshot.committed}</dd>
        </div>
        <div>
          <dt>Superseded</dt>
          <dd data-testid="live-render-superseded">{settled ? snapshot.superseded : "—"}</dd>
        </div>
        <div>
          <dt>Exact</dt>
          <dd data-testid="live-render-exact">{snapshot.exactCommits}</dd>
        </div>
        <div>
          <dt>Blank checks</dt>
          <dd data-testid="live-render-blank">{snapshot.blankChecks}</dd>
        </div>
        <div>
          <dt>Generation</dt>
          <dd>{snapshot.latestGeneration ?? "—"}</dd>
        </div>
        <div>
          <dt>p50 commit</dt>
          <dd data-testid="live-render-p50">{formatLatency(snapshot.p50Ms)}</dd>
        </div>
        <div>
          <dt>p95 commit</dt>
          <dd data-testid="live-render-p95">{formatLatency(snapshot.p95Ms)}</dd>
        </div>
        <div>
          <dt>Max commit</dt>
          <dd>{formatLatency(snapshot.maxMs)}</dd>
        </div>
      </dl>
    </div>
  );
}
