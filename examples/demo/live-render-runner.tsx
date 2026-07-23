import { useCallback, useEffect, useRef, useState } from "react";
import { summarizeLatencies } from "./live-render-metrics.js";

export type RunnerStatus = "idle" | "running" | "complete" | "failed" | "cancelled";

export type RunnerPresetId = "typing" | "live" | "pressure";

export type RunnerPreset = Readonly<{
  id: RunnerPresetId;
  label: string;
  detail: string;
  updates: number;
  intervalMs: number;
}>;

type CommitSample = Readonly<{
  revision: number;
  generation: number;
  exactSequence: boolean;
}>;

export type LiveRenderSnapshot = Readonly<{
  status: RunnerStatus;
  requested: number;
  committed: number;
  superseded: number;
  exactCommits: number;
  blankChecks: number;
  latestGeneration: number | undefined;
  p50Ms: number | undefined;
  p95Ms: number | undefined;
  maxMs: number | undefined;
}>;

type ActiveRun = {
  readonly id: number;
  readonly targetRevision: number;
  readonly preset: RunnerPreset;
  readonly requestTimes: Map<number, number>;
  readonly committedRevisions: Set<number>;
  readonly latencies: number[];
  requested: number;
  exactCommits: number;
  blankChecks: number;
  latestGeneration: number | undefined;
};

type UseLiveRenderRunnerOptions = Readonly<{
  currentRevision: number;
  enabled: boolean;
  onRequestRevision: (revision: number) => void;
  isCanonicalIntact: () => boolean;
}>;

const livePreset: RunnerPreset = {
  id: "live",
  label: "Live / 50 ms",
  detail: "18 updates · reactive UI cadence",
  updates: 18,
  intervalMs: 50,
};

export const liveRenderPresets: readonly RunnerPreset[] = [
  {
    id: "typing",
    label: "Typing / 120 ms",
    detail: "12 updates · editor cadence",
    updates: 12,
    intervalMs: 120,
  },
  livePreset,
  {
    id: "pressure",
    label: "Pressure / 16 ms",
    detail: "24 updates · frame pressure",
    updates: 24,
    intervalMs: 16,
  },
] as const;

const idleSnapshot: LiveRenderSnapshot = {
  status: "idle",
  requested: 0,
  committed: 0,
  superseded: 0,
  exactCommits: 0,
  blankChecks: 0,
  latestGeneration: undefined,
  p50Ms: undefined,
  p95Ms: undefined,
  maxMs: undefined,
};

function snapshotFor(active: ActiveRun, status: RunnerStatus): LiveRenderSnapshot {
  const latency = summarizeLatencies(active.latencies);
  return {
    status,
    requested: active.requested,
    committed: active.committedRevisions.size,
    superseded: Math.max(0, active.requested - active.committedRevisions.size),
    exactCommits: active.exactCommits,
    blankChecks: active.blankChecks,
    latestGeneration: active.latestGeneration,
    ...latency,
  };
}

export function liveRenderPresetById(id: RunnerPresetId): RunnerPreset {
  return liveRenderPresets.find((preset) => preset.id === id) ?? livePreset;
}

export function useLiveRenderRunner({
  currentRevision,
  enabled,
  onRequestRevision,
  isCanonicalIntact,
}: UseLiveRenderRunnerOptions) {
  const [snapshot, setSnapshot] = useState<LiveRenderSnapshot>(idleSnapshot);
  const revisionRef = useRef(currentRevision);
  const runSequenceRef = useRef(0);
  const activeRef = useRef<ActiveRun | undefined>(undefined);
  const timeoutIdsRef = useRef<number[]>([]);

  useEffect(() => {
    revisionRef.current = currentRevision;
  }, [currentRevision]);

  const clearSchedule = useCallback(() => {
    for (const timeoutId of timeoutIdsRef.current) window.clearTimeout(timeoutId);
    timeoutIdsRef.current = [];
  }, []);

  const cancel = useCallback(() => {
    clearSchedule();
    const active = activeRef.current;
    activeRef.current = undefined;
    if (active !== undefined) setSnapshot(snapshotFor(active, "cancelled"));
  }, [clearSchedule]);

  useEffect(() => {
    if (!enabled) cancel();
  }, [cancel, enabled]);

  useEffect(
    () => () => {
      clearSchedule();
      activeRef.current = undefined;
    },
    [clearSchedule],
  );

  const start = useCallback(
    (presetId: RunnerPresetId) => {
      if (!enabled) return;
      clearSchedule();
      const preset = liveRenderPresetById(presetId);
      const id = runSequenceRef.current + 1;
      runSequenceRef.current = id;
      const active: ActiveRun = {
        id,
        targetRevision: revisionRef.current + preset.updates,
        preset,
        requestTimes: new Map(),
        committedRevisions: new Set(),
        latencies: [],
        requested: 0,
        exactCommits: 0,
        blankChecks: 0,
        latestGeneration: undefined,
      };
      activeRef.current = active;
      setSnapshot(snapshotFor(active, "running"));

      for (let index = 0; index < preset.updates; index += 1) {
        const revision = revisionRef.current + index + 1;
        const timeoutId = window.setTimeout(() => {
          if (activeRef.current?.id !== id) return;
          active.requested += 1;
          if (!isCanonicalIntact()) active.blankChecks += 1;
          active.requestTimes.set(revision, performance.now());
          setSnapshot(snapshotFor(active, "running"));
          onRequestRevision(revision);
        }, index * preset.intervalMs);
        timeoutIdsRef.current.push(timeoutId);
      }
    },
    [clearSchedule, enabled, isCanonicalIntact, onRequestRevision],
  );

  const recordCommit = useCallback(
    (sample: CommitSample) => {
      const active = activeRef.current;
      if (active === undefined || active.committedRevisions.has(sample.revision)) return;
      const requestedAt = active.requestTimes.get(sample.revision);
      if (requestedAt === undefined) return;

      active.committedRevisions.add(sample.revision);
      active.latencies.push(performance.now() - requestedAt);
      if (sample.exactSequence) active.exactCommits += 1;
      active.latestGeneration = sample.generation;

      const isFinalCommit =
        sample.revision >= active.targetRevision && active.requested === active.preset.updates;
      if (!isFinalCommit) {
        setSnapshot(snapshotFor(active, "running"));
        return;
      }

      clearSchedule();
      activeRef.current = undefined;
      setSnapshot(snapshotFor(active, sample.exactSequence ? "complete" : "failed"));
    },
    [clearSchedule],
  );

  return { snapshot, start, cancel, recordCommit };
}
