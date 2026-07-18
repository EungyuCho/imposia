import { describe, expect, it } from "vitest";
import { isBenchmarkRegression } from "../../scripts/benchmark-thresholds.js";

describe("benchmark regression thresholds", () => {
  it("requires both the warm percentage and absolute limits", () => {
    expect(isBenchmarkRegression("warm-total", 100, 251)).toBe(true);
    expect(isBenchmarkRegression("warm-total", 100, 250)).toBe(false);
    expect(isBenchmarkRegression("warm-total", 1_000, 1_151)).toBe(false);
  });

  it("requires both the cold percentage and absolute limits", () => {
    expect(isBenchmarkRegression("cold-total", 1_000, 1_501)).toBe(true);
    expect(isBenchmarkRegression("cold-total", 1_000, 1_500)).toBe(false);
    expect(isBenchmarkRegression("cold-total", 2_000, 2_501)).toBe(false);
  });

  it("gates only material phases with both phase limits", () => {
    expect(isBenchmarkRegression("phase", 100, 201)).toBe(true);
    expect(isBenchmarkRegression("phase", 100, 200)).toBe(false);
    expect(isBenchmarkRegression("phase", 500, 601)).toBe(false);
    expect(isBenchmarkRegression("phase", 99, 1_000)).toBe(false);
  });
});
