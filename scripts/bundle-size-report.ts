export interface BundleMeasurement {
  readonly name: string;
  readonly minifiedBytes: number;
  readonly gzipBytes: number;
  readonly gzipBudgetBytes: number;
}

export interface EpubImpactMeasurement {
  readonly fullMinifiedBytes: number;
  readonly stubMinifiedBytes: number;
  readonly fullGzipBytes: number;
  readonly stubGzipBytes: number;
  readonly fullBrotliBytes: number;
  readonly stubBrotliBytes: number;
}

export interface BundleBudgetViolation {
  readonly name: string;
  readonly gzipBytes: number;
  readonly gzipBudgetBytes: number;
}

export class BundleBudgetError extends Error {
  readonly violations: readonly BundleBudgetViolation[];

  constructor(violations: readonly BundleBudgetViolation[]) {
    super(
      violations
        .map(
          ({ name, gzipBytes, gzipBudgetBytes }) =>
            `${name} exceeds its gzip budget by ${formatBytes(gzipBytes - gzipBudgetBytes)}.`,
        )
        .join("\n"),
    );
    this.name = "BundleBudgetError";
    this.violations = violations;
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function bundleBudgetViolations(
  measurements: readonly BundleMeasurement[],
): readonly BundleBudgetViolation[] {
  return measurements.flatMap(({ name, gzipBytes, gzipBudgetBytes }) =>
    gzipBytes > gzipBudgetBytes ? [Object.freeze({ name, gzipBytes, gzipBudgetBytes })] : [],
  );
}

export function assertBundleBudgets(measurements: readonly BundleMeasurement[]): void {
  const violations = bundleBudgetViolations(measurements);
  if (violations.length > 0) throw new BundleBudgetError(Object.freeze(violations));
}

export function renderBundleSizeReport(measurements: readonly BundleMeasurement[]): string {
  const violationCount = bundleBudgetViolations(measurements).length;
  const rows = measurements.map(({ name, minifiedBytes, gzipBytes, gzipBudgetBytes }) => {
    const headroomBytes = gzipBudgetBytes - gzipBytes;
    return `| ${name} | ${formatBytes(minifiedBytes)} | ${formatBytes(gzipBytes)} | ${formatBytes(gzipBudgetBytes)} | ${formatBytes(headroomBytes)} |`;
  });
  return [
    "Bundle size report",
    "",
    "| Consumer route | Minified | Gzip | Gzip budget | Headroom |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    violationCount === 0
      ? `All ${measurements.length} consumer routes are within their gzip budgets.`
      : `${violationCount} of ${measurements.length} consumer routes ${
          violationCount === 1 ? "exceeds its gzip budget" : "exceed their gzip budgets"
        }.`,
  ].join("\n");
}

export function renderEpubImpactReport(measurement: EpubImpactMeasurement): string {
  const measurements: readonly (readonly [string, number, number])[] = [
    ["Minified", measurement.fullMinifiedBytes, measurement.stubMinifiedBytes],
    ["Gzip", measurement.fullGzipBytes, measurement.stubGzipBytes],
    ["Brotli", measurement.fullBrotliBytes, measurement.stubBrotliBytes],
  ];
  const rows = measurements.map(
    ([name, fullBytes, stubBytes]) =>
      `| ${name} | ${formatBytes(fullBytes)} | ${formatBytes(stubBytes)} | ${formatBytes(
        fullBytes - stubBytes,
      )} |`,
  );
  return [
    "EPUB implementation impact",
    "",
    "| Measurement | Full Core | EPUB stubs | Difference |",
    "| --- | ---: | ---: | ---: |",
    ...rows,
  ].join("\n");
}
