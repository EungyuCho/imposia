import { describe, expect, it } from "vitest";
import {
  hasReviewedPackageLicense,
  inheritedLicenseForReviewedPackage,
  type PackageLicensePolicyItem,
  reviewedYukuBindingNames,
} from "../../scripts/license-policy.js";

describe("license policy exceptions", () => {
  it("requires exact package license tuples", () => {
    const reviewed: PackageLicensePolicyItem = {
      name: "@img/sharp-libvips-linux-x64",
      version: "1.2.4",
      license: "LGPL-3.0-or-later",
      repositoryUrl: "git+https://github.com/lovell/sharp-libvips.git",
    };

    expect(hasReviewedPackageLicense(reviewed)).toBe(true);
    for (const mismatch of [
      { ...reviewed, name: "@img/sharp-libvips-future" },
      { ...reviewed, version: "1.2.5" },
      { ...reviewed, license: "LGPL-2.1-or-later" },
      { ...reviewed, repositoryUrl: "https://example.com/sharp-libvips" },
    ]) {
      expect(hasReviewedPackageLicense(mismatch)).toBe(false);
    }
  });

  it("inherits Yuku binding licenses only for the reviewed release and repository", () => {
    const repositoryUrl = "https://github.com/yuku-toolchain/yuku";
    const parent: PackageLicensePolicyItem = {
      name: "yuku-analyzer",
      version: "0.6.12",
      license: "MIT",
      repositoryUrl,
    };

    expect(reviewedYukuBindingNames).toHaveLength(11);
    for (const name of reviewedYukuBindingNames) {
      expect(
        inheritedLicenseForReviewedPackage({ name, version: "0.6.12", repositoryUrl }, parent),
      ).toBe("MIT");
    }

    const reviewed = {
      name: reviewedYukuBindingNames[0],
      version: "0.6.12",
      repositoryUrl,
    };
    expect(
      inheritedLicenseForReviewedPackage(
        { ...reviewed, name: "@yuku-analyzer/binding-future" },
        parent,
      ),
    ).toBeUndefined();
    expect(
      inheritedLicenseForReviewedPackage({ ...reviewed, version: "0.6.13" }, parent),
    ).toBeUndefined();
    expect(
      inheritedLicenseForReviewedPackage(
        { ...reviewed, repositoryUrl: "https://example.com/yuku" },
        parent,
      ),
    ).toBeUndefined();
    expect(
      inheritedLicenseForReviewedPackage(reviewed, { ...parent, name: "future-analyzer" }),
    ).toBeUndefined();
    expect(
      inheritedLicenseForReviewedPackage(reviewed, { ...parent, version: "0.6.13" }),
    ).toBeUndefined();
    expect(
      inheritedLicenseForReviewedPackage(reviewed, { ...parent, license: "Apache-2.0" }),
    ).toBeUndefined();
    expect(
      inheritedLicenseForReviewedPackage(reviewed, {
        ...parent,
        repositoryUrl: "https://example.com/yuku",
      }),
    ).toBeUndefined();
  });
});
