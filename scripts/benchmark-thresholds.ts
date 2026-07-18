export const BENCHMARK_THRESHOLD_POLICY = "confirmed-dual-thresholds-v1" as const;

export type BenchmarkMetricKind = "cold-total" | "warm-total" | "phase";

export function isBenchmarkRegression(
  kind: BenchmarkMetricKind,
  baselineMs: number,
  currentMs: number,
): boolean {
  const increaseMs = currentMs - baselineMs;
  if (kind === "cold-total") return currentMs > baselineMs * 1.35 && increaseMs > 500;
  if (kind === "warm-total") return currentMs > baselineMs * 1.25 && increaseMs > 150;
  return baselineMs >= 100 && currentMs > baselineMs * 1.4 && increaseMs > 100;
}
