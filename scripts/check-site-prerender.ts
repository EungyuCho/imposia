import { doesNotMatch, match } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_PRERENDER_ROUTES } from "../site/prerender-paths";

const BUILD_ROOT = join("site", "build", "client");
const expectedRedirects = [
  "/ /en 302",
  "/:lang/docs/api-reference /:lang/docs/api 301",
  "/:lang/docs/api-reference/ /:lang/docs/api 301",
  "/:lang/docs/publishing-contract /:lang/docs/concepts/publishing-model 301",
  "/:lang/docs/publishing-contract/ /:lang/docs/concepts/publishing-model 301",
] as const;

for (const route of SITE_PRERENDER_ROUTES) {
  const path = route.slice(1);
  const html = await readFile(join(BUILD_ROOT, path, "index.html"), "utf8");
  const locale = path.split("/", 1)[0];

  match(
    html,
    /id="(?:nd-nav|nd-docs-layout)"/,
    `Expected /${path} to contain the rendered site shell.`,
  );
  match(html, new RegExp(`<html lang="${locale}"`), `Expected /${path} to declare ${locale}.`);
  doesNotMatch(html, /hydrate-fallback/, `Expected /${path} to contain prerendered page content.`);
}

const redirects = await readFile(join(BUILD_ROOT, "_redirects"), "utf8");

for (const redirect of expectedRedirects) {
  match(redirects, new RegExp(`^${redirect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
}

console.log(
  `Verified ${SITE_PRERENDER_ROUTES.length} prerendered site routes and ${expectedRedirects.length} deployment redirects.`,
);
