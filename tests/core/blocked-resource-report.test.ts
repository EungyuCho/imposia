// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  resolvePageAssets,
  resourceBlockedWarnings,
} from "../../packages/core/src/page-document-assets.js";
import type { AssetResolution } from "../../packages/core/src/page-document-types.js";

const signal = () => new AbortController().signal;

const unreachableResolver = (): Promise<AssetResolution> => {
  throw new Error("the resolver must not be reached for a preflight block");
};

describe("individually reported blocked resources", () => {
  // Regression: the extension veto used to be recorded once when the veto produced the
  // outcome and again when the outcome loop applied it, doubling every report and burning
  // the reporting cap twice as fast.
  it("records a vetoed resource exactly once", async () => {
    const result = await resolvePageAssets(
      '<img src="https://assets.example/a.png">',
      undefined,
      [],
      unreachableResolver,
      undefined,
      signal(),
      () => false,
    );

    expect(result.resourceBlocked).toBe(true);
    expect(result.blockedResources).toHaveLength(1);
    expect(result.blockedResources[0]).toMatchObject({
      kind: "image",
      url: "https://assets.example/a.png",
      reason: "a page extension refused this resource",
    });
    result.revoke();
  });

  // Regression: the scheme block took the same double-recording path as the veto.
  it("records a script-scheme resource exactly once", async () => {
    const result = await resolvePageAssets(
      '<img src="javascript:alert(1)">',
      undefined,
      [],
      unreachableResolver,
      undefined,
      signal(),
    );

    expect(result.resourceBlocked).toBe(true);
    expect(result.blockedResources).toHaveLength(1);
    expect(result.blockedResources[0]).toMatchObject({
      kind: "image",
      reason: "URL uses a scheme that can execute script",
    });
    result.revoke();
  });

  it("names every resource the resolver resolved but Core overruled", async () => {
    const resolver = (): Promise<AssetResolution> =>
      Promise.resolve({
        status: "resolved",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "text/plain",
      });
    const result = await resolvePageAssets(
      '<img src="https://assets.example/a.png"><img src="https://assets.example/b.png">',
      undefined,
      [],
      resolver,
      undefined,
      signal(),
    );

    expect(result.blockedResources).toHaveLength(2);
    for (const resource of result.blockedResources) {
      expect(resource.reason).toBe("declared type text/plain is not a supported image type");
    }

    const warnings = resourceBlockedWarnings(result.blockedResources, result.sourceIdentity, false);
    expect(warnings).toHaveLength(2);
    expect(warnings.map((warning) => warning.value)).toEqual([
      "https://assets.example/a.png",
      "https://assets.example/b.png",
    ]);
    for (const warning of warnings) {
      expect(warning.code).toBe("RESOURCE_BLOCKED");
      expect(warning.property).toBe("image");
      expect(warning.recovery).toBe("declared type text/plain is not a supported image type");
    }
    result.revoke();
  });

  it("passes a resolver's own blocked reason through", async () => {
    const resolver = (): Promise<AssetResolution> =>
      Promise.resolve({ status: "blocked", reason: "the corporate proxy refused it" });
    const result = await resolvePageAssets(
      '<img src="https://assets.example/a.png">',
      undefined,
      [],
      resolver,
      undefined,
      signal(),
    );

    expect(result.blockedResources).toHaveLength(1);
    expect(result.blockedResources[0]?.reason).toBe("the corporate proxy refused it");
    result.revoke();
  });

  it("caps individual reports while keeping the aggregate flag exact", async () => {
    const images = Array.from(
      { length: 25 },
      (_, index) => `<img src="https://assets.example/${index}.png">`,
    ).join("");
    const result = await resolvePageAssets(
      images,
      undefined,
      [],
      unreachableResolver,
      undefined,
      signal(),
      () => false,
    );

    expect(result.resourceBlocked).toBe(true);
    expect(result.blockedResources).toHaveLength(20);
    result.revoke();
  });
});

describe("resourceBlockedWarnings", () => {
  const blocked = Object.freeze({
    kind: "font" as const,
    url: "https://assets.example/a.woff2",
    reason: "declared type text/plain is not a supported font type",
    sourceIdentity: "resource-0",
  });

  // Regression: the aggregate-presence guard used to wrap the per-resource block, so one
  // sanitizer warning for a javascript: href suppressed every individual asset report --
  // exactly in the documents that needed the diagnostics.
  it("emits per-resource warnings even when an aggregate warning is already present", () => {
    const warnings = resourceBlockedWarnings([blocked], undefined, true);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "RESOURCE_BLOCKED",
      value: "https://assets.example/a.woff2",
      property: "font",
      recovery: "declared type text/plain is not a supported font type",
    });
  });

  it("keeps the single aggregate warning when nothing was recorded individually", () => {
    const warnings = resourceBlockedWarnings([], "resource-3", false);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "RESOURCE_BLOCKED",
      message: "Resource was blocked by the loading policy.",
      sourceIdentity: "resource-3",
    });
    expect(warnings[0]?.value).toBeUndefined();
  });

  it("does not duplicate an aggregate warning that is already present", () => {
    expect(resourceBlockedWarnings([], undefined, true)).toHaveLength(0);
  });
});
