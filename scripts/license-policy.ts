export interface PackageLicensePolicyItem {
  name: string;
  version: string;
  license: string;
  repositoryUrl: string | undefined;
}

export interface MissingPackageLicensePolicyItem {
  name: string;
  version: string;
  repositoryUrl: string | undefined;
}

const reviewedPackageLicenses = [
  {
    names: ["caniuse-lite"],
    version: "1.0.30001806",
    license: "CC-BY-4.0",
    repositoryUrl: "browserslist/caniuse-lite",
  },
  {
    names: [
      "lightningcss",
      "lightningcss-android-arm64",
      "lightningcss-darwin-arm64",
      "lightningcss-darwin-x64",
      "lightningcss-freebsd-x64",
      "lightningcss-linux-arm-gnueabihf",
      "lightningcss-linux-arm64-gnu",
      "lightningcss-linux-arm64-musl",
      "lightningcss-linux-x64-gnu",
      "lightningcss-linux-x64-musl",
      "lightningcss-win32-arm64-msvc",
      "lightningcss-win32-x64-msvc",
    ],
    version: "1.32.0",
    license: "MPL-2.0",
    repositoryUrl: "https://github.com/parcel-bundler/lightningcss.git",
  },
  {
    names: [
      "@img/sharp-libvips-darwin-arm64",
      "@img/sharp-libvips-darwin-x64",
      "@img/sharp-libvips-linux-arm",
      "@img/sharp-libvips-linux-arm64",
      "@img/sharp-libvips-linux-ppc64",
      "@img/sharp-libvips-linux-riscv64",
      "@img/sharp-libvips-linux-s390x",
      "@img/sharp-libvips-linux-x64",
      "@img/sharp-libvips-linuxmusl-arm64",
      "@img/sharp-libvips-linuxmusl-x64",
    ],
    version: "1.2.4",
    license: "LGPL-3.0-or-later",
    repositoryUrl: "git+https://github.com/lovell/sharp-libvips.git",
  },
] as const;

export const reviewedYukuBindingNames = [
  "@yuku-analyzer/binding-darwin-arm64",
  "@yuku-analyzer/binding-darwin-x64",
  "@yuku-analyzer/binding-freebsd-x64",
  "@yuku-analyzer/binding-linux-arm-gnu",
  "@yuku-analyzer/binding-linux-arm-musl",
  "@yuku-analyzer/binding-linux-arm64-gnu",
  "@yuku-analyzer/binding-linux-arm64-musl",
  "@yuku-analyzer/binding-linux-x64-gnu",
  "@yuku-analyzer/binding-linux-x64-musl",
  "@yuku-analyzer/binding-win32-arm64",
  "@yuku-analyzer/binding-win32-x64",
] as const;

const yukuReview = {
  version: "0.6.12",
  repositoryUrl: "https://github.com/yuku-toolchain/yuku",
  parentName: "yuku-analyzer",
  parentLicense: "MIT",
} as const;

export function hasReviewedPackageLicense(item: PackageLicensePolicyItem): boolean {
  return reviewedPackageLicenses.some(
    (review) =>
      review.names.some((name) => name === item.name) &&
      item.version === review.version &&
      item.license === review.license &&
      item.repositoryUrl === review.repositoryUrl,
  );
}

export function inheritedLicenseForReviewedPackage(
  item: MissingPackageLicensePolicyItem,
  parent: PackageLicensePolicyItem | undefined,
): string | undefined {
  if (
    !reviewedYukuBindingNames.some((name) => name === item.name) ||
    item.version !== yukuReview.version ||
    item.repositoryUrl !== yukuReview.repositoryUrl ||
    parent?.name !== yukuReview.parentName ||
    parent.version !== yukuReview.version ||
    parent.license !== yukuReview.parentLicense ||
    parent.repositoryUrl !== yukuReview.repositoryUrl
  ) {
    return undefined;
  }
  return parent.license;
}
