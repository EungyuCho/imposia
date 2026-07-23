export interface BundleMeasurement {
  readonly name: string;
  readonly rawBytes: number;
  readonly gzipBytes: number;
  readonly gzipBudgetBytes: number;
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
  const rows = measurements.map(({ name, rawBytes, gzipBytes, gzipBudgetBytes }) => {
    const headroomBytes = gzipBudgetBytes - gzipBytes;
    return `| ${name} | ${formatBytes(rawBytes)} | ${formatBytes(gzipBytes)} | ${formatBytes(gzipBudgetBytes)} | ${formatBytes(headroomBytes)} |`;
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
