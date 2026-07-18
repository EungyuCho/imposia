import { afterAll, describe, expect, it } from "vitest";
import { createRenderer } from "../../packages/node/src/renderer.js";
import { compareRendererParity } from "../../scripts/compare-renderer-parity.js";
import { rendererParityFixtures } from "../../scripts/renderer-parity-fixtures.js";

describe("legacy and Core structural PDF parity", () => {
  const renderer = createRenderer();

  afterAll(async () => {
    await renderer.close();
  });

  it.each(rendererParityFixtures)("matches $name", async (fixture) => {
    const comparison = await compareRendererParity(renderer, fixture);
    expect(comparison.differences, JSON.stringify(comparison, null, 2)).toEqual([]);
  });
});
