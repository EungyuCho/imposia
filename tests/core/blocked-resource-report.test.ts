// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  resolvePageAssets,
  resourceBlockedWarnings,
} from "../../packages/core/src/page-document-assets.js";
import { unsupportedMimeReason } from "../../packages/core/src/page-document-blocked-reasons.js";
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
      reason: "a page extension refused this resource",
      sourceIdentity: "resource-0",
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
    expect(warnings.map((warning) => warning.sourceIdentity)).toEqual(["resource-0", "resource-1"]);
    for (const warning of warnings) {
      expect(warning.code).toBe("RESOURCE_BLOCKED");
      expect(warning.property).toBe("image");
      expect(warning.recovery).toBe("declared type text/plain is not a supported image type");
    }
    result.revoke();
  });

  // The privacy contract behind ASA-465: a resolver's `reason` is host-private text and
  // must never reach `document.warnings`. The blocked path carries only Core's fixed
  // phrase, and the warning names the resource by its sourceIdentity marker -- never by
  // its authored URL, which is source content.
  it("never carries the resolver's own blocked reason or the authored URL", async () => {
    const secret = "RESOLVER_REASON_SECRET https://user:token@private.invalid/asset.png";
    const resolver = (): Promise<AssetResolution> =>
      Promise.resolve({ status: "blocked", reason: secret });
    const result = await resolvePageAssets(
      '<img src="https://private.invalid/book/private-asset.png">',
      undefined,
      [],
      resolver,
      undefined,
      signal(),
    );

    expect(result.blockedResources).toHaveLength(1);
    expect(result.blockedResources[0]?.reason).toBe("the resolver refused this resource");

    const warnings = resourceBlockedWarnings(result.blockedResources, result.sourceIdentity, false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "RESOURCE_BLOCKED",
      message: "Blocked image: the resolver refused this resource.",
      property: "image",
      recovery: "the resolver refused this resource",
      sourceIdentity: "resource-0",
    });
    expect(warnings[0]?.value).toBeUndefined();
    const serialized = JSON.stringify(warnings);
    expect(serialized).not.toContain("RESOLVER_REASON_SECRET");
    expect(serialized).not.toContain("private.invalid");
    result.revoke();
  });

  // The declared MIME type is also resolver text. It is quoted only when it looks like a
  // MIME token; anything else is replaced, so it cannot smuggle arbitrary text either.
  it("does not quote a declared MIME type that is not a MIME token", async () => {
    const resolver = (): Promise<AssetResolution> =>
      Promise.resolve({
        status: "resolved",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "SECRET TOKEN in a mime field",
      });
    const result = await resolvePageAssets(
      '<img src="https://assets.example/a.png">',
      undefined,
      [],
      resolver,
      undefined,
      signal(),
    );

    expect(result.blockedResources).toHaveLength(1);
    expect(result.blockedResources[0]?.reason).toBe(
      "declared type (unprintable) is not a supported image type",
    );
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
    reason: unsupportedMimeReason("text/plain", "font"),
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
      property: "font",
      recovery: "declared type text/plain is not a supported font type",
    });
    expect(warnings[0]?.value).toBeUndefined();
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
