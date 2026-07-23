import { doesNotMatch, match } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const BUILD_ROOT = join("site", "build", "client");
const LOCALES = ["en", "ko", "zh-CN", "ja"] as const;
const DOC_PATHS = [
  "docs",
  "docs/getting-started",
  "docs/publishing-contract",
  "docs/api-reference",
] as const;

const prerenderPaths = LOCALES.flatMap((locale) => [
  locale,
  ...DOC_PATHS.map((path) => `${locale}/${path}`),
]);

for (const path of prerenderPaths) {
  const html = await readFile(join(BUILD_ROOT, path, "index.html"), "utf8");

  match(
    html,
    /id="(?:nd-nav|nd-docs-layout)"/,
    `Expected /${path} to contain the rendered site shell.`,
  );
  doesNotMatch(html, /hydrate-fallback/, `Expected /${path} to contain prerendered page content.`);
}

console.log(`Verified ${prerenderPaths.length} prerendered site routes.`);
