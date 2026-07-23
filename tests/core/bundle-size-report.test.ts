import { describe, expect, it } from "vitest";
import {
  assertBundleBudgets,
  BundleBudgetError,
  type BundleMeasurement,
  renderBundleSizeReport,
} from "../../scripts/bundle-size-report.js";

const WITHIN_BUDGET = Object.freeze([
  Object.freeze({
    name: "Core · PageDocument",
    rawBytes: 204_800,
    gzipBytes: 81_920,
    gzipBudgetBytes: 92_160,
  }),
  Object.freeze({
    name: "Viewer · PageDocument",
    rawBytes: 71_680,
    gzipBytes: 25_600,
    gzipBudgetBytes: 30_720,
  }),
]) satisfies readonly BundleMeasurement[];

describe("bundle size report", () => {
  it("renders minified and gzip sizes with remaining budget", () => {
    expect(renderBundleSizeReport(WITHIN_BUDGET)).toBe(`Bundle size report

| Consumer route | Minified | Gzip | Gzip budget | Headroom |
| --- | ---: | ---: | ---: | ---: |
| Core · PageDocument | 200.0 KiB | 80.0 KiB | 90.0 KiB | 10.0 KiB |
| Viewer · PageDocument | 70.0 KiB | 25.0 KiB | 30.0 KiB | 5.0 KiB |

All 2 consumer routes are within their gzip budgets.`);
  });

  it("rejects every consumer route that exceeds its gzip budget", () => {
    const measurements = Object.freeze([
      ...WITHIN_BUDGET,
      Object.freeze({
        name: "React · PageViewer",
        rawBytes: 307_200,
        gzipBytes: 123_905,
        gzipBudgetBytes: 122_880,
      }),
    ]) satisfies readonly BundleMeasurement[];

    expect(() => assertBundleBudgets(measurements)).toThrowError(
      new BundleBudgetError(
        Object.freeze([
          Object.freeze({
            name: "React · PageViewer",
            gzipBytes: 123_905,
            gzipBudgetBytes: 122_880,
          }),
        ]),
      ),
    );
    expect(renderBundleSizeReport(measurements)).toContain(
      "1 of 3 consumer routes exceeds its gzip budget.",
    );
    expect(renderBundleSizeReport(measurements)).not.toContain(
      "All 3 consumer routes are within their gzip budgets.",
    );
  });
});
