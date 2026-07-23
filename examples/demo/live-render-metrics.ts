export type LatencySummary = Readonly<{
  p50Ms: number | undefined;
  p95Ms: number | undefined;
  maxMs: number | undefined;
}>;

function percentile(sortedValues: readonly number[], percentileValue: number): number | undefined {
  if (sortedValues.length === 0) return undefined;
  const index = Math.max(0, Math.ceil(percentileValue * sortedValues.length) - 1);
  return sortedValues[index];
}

export function summarizeLatencies(values: readonly number[]): LatencySummary {
  const sortedValues = [...values].sort((left, right) => left - right);
  return {
    p50Ms: percentile(sortedValues, 0.5),
    p95Ms: percentile(sortedValues, 0.95),
    maxMs: sortedValues.at(-1),
  };
}
