import { doesNotMatch, match } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteUrl } from "../site/lib/site-url";
import {
  SITE_BLOG_ROUTES,
  SITE_DOC_ROUTES,
  SITE_INDEXABLE_ROUTES,
  SITE_LOCALE_ROOT_ROUTES,
} from "../site/prerender-paths";

const BUILD_ROOT = join("site", "build", "client");
const expectedRedirects = [
  "/ /en 302",
  "/:lang/docs/api-reference /:lang/docs/api 301",
  "/:lang/docs/api-reference/ /:lang/docs/api 301",
  "/:lang/docs/publishing-contract /:lang/docs/concepts/publishing-model 301",
  "/:lang/docs/publishing-contract/ /:lang/docs/concepts/publishing-model 301",
] as const;

for (const route of SITE_DOC_ROUTES) {
  const path = route.slice(1);
  const html = await readFile(join(BUILD_ROOT, path, "index.html"), "utf8");
  const locale = path.split("/", 1)[0];

  match(
    html,
    /id="(?:nd-nav|nd-docs-layout|nd-notebook-layout)"/,
    `Expected /${path} to contain the rendered site shell.`,
  );
  match(html, new RegExp(`<html lang="${locale}"`), `Expected /${path} to declare ${locale}.`);
  doesNotMatch(html, /hydrate-fallback/, `Expected /${path} to contain prerendered page content.`);
}

for (const route of SITE_LOCALE_ROOT_ROUTES) {
  const path = route.slice(1);
  const html = await readFile(join(BUILD_ROOT, path, "index.html"), "utf8");
  match(html, new RegExp(`<html lang="${path}"`), `Expected /${path} to declare ${path}.`);
  match(html, /id="imposia-landing"/, `Expected /${path} to contain the prerendered landing page.`);
  doesNotMatch(html, /hydrate-fallback/, `Expected /${path} to contain prerendered page content.`);
}

for (const route of SITE_BLOG_ROUTES) {
  const path = route.slice(1);
  const html = await readFile(join(BUILD_ROOT, path, "index.html"), "utf8");
  const locale = path.split("/", 1)[0];
  match(html, new RegExp(`<html lang="${locale}"`), `Expected /${path} to declare ${locale}.`);
  match(html, /id="imposia-blog"/, `Expected /${path} to contain the blog shell.`);
  doesNotMatch(html, /hydrate-fallback/, `Expected /${path} to contain prerendered page content.`);
}

const sitemap = await readFile(join(BUILD_ROOT, "sitemap.xml"), "utf8");
const listedUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedUrls = SITE_INDEXABLE_ROUTES.map(siteUrl);
if (new Set(listedUrls).size !== listedUrls.length) {
  throw new Error("Sitemap contains duplicate URLs.");
}
if (listedUrls.join("\n") !== expectedUrls.join("\n")) {
  throw new Error("Sitemap URLs do not match the indexable prerender routes.");
}
for (const route of SITE_INDEXABLE_ROUTES) {
  const html = await readFile(join(BUILD_ROOT, route.slice(1), "index.html"), "utf8");
  match(
    html,
    new RegExp(
      `<link[^>]+rel="canonical"[^>]+href="${siteUrl(route).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
    ),
    `Expected ${route} to declare its final canonical URL.`,
  );
}

const robots = await readFile(join(BUILD_ROOT, "robots.txt"), "utf8");
match(robots, /Sitemap: https:\/\/imposia\.pages\.dev\/sitemap\.xml/);

const redirects = await readFile(join(BUILD_ROOT, "_redirects"), "utf8");

for (const redirect of expectedRedirects) {
  match(redirects, new RegExp(`^${redirect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
}

console.log(
  `Verified ${SITE_DOC_ROUTES.length} prerendered documentation routes, ` +
    `${SITE_LOCALE_ROOT_ROUTES.length} landing pages, ` +
    `${SITE_BLOG_ROUTES.length} blog routes, ${expectedUrls.length} sitemap URLs, and ` +
    `${expectedRedirects.length} deployment redirects.`,
);
