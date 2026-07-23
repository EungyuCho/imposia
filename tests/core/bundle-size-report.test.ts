import { describe, expect, it } from "vitest";
import {
  assertBundleBudgets,
  BundleBudgetError,
  type BundleMeasurement,
  type EpubImpactMeasurement,
  renderBundleSizeReport,
  renderEpubImpactReport,
} from "../../scripts/bundle-size-report.js";

const WITHIN_BUDGET = Object.freeze([
  Object.freeze({
    name: "Core · PageDocument",
    minifiedBytes: 204_800,
    gzipBytes: 81_920,
    gzipBudgetBytes: 92_160,
  }),
  Object.freeze({
    name: "Viewer · PageDocument",
    minifiedBytes: 71_680,
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
        minifiedBytes: 307_200,
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

  it("renders the reproducible EPUB implementation delta", () => {
    const measurement = Object.freeze({
      fullMinifiedBytes: 379_989,
      stubMinifiedBytes: 362_442,
      fullGzipBytes: 111_364,
      stubGzipBytes: 105_836,
      fullBrotliBytes: 93_949,
      stubBrotliBytes: 89_299,
    }) satisfies EpubImpactMeasurement;

    expect(renderEpubImpactReport(measurement)).toBe(`EPUB implementation impact

| Measurement | Full Core | EPUB stubs | Difference |
| --- | ---: | ---: | ---: |
| Minified | 371.1 KiB | 353.9 KiB | 17.1 KiB |
| Gzip | 108.8 KiB | 103.4 KiB | 5.4 KiB |
| Brotli | 91.7 KiB | 87.2 KiB | 4.5 KiB |`);
  });
});
