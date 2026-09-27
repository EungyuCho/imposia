import { readdirSync } from "node:fs";
import { LOCALES } from "./lib/i18n";

export const SITE_DOC_PATHS = [
  "docs",
  "docs/getting-started",
  "docs/concepts/why-imposia",
  "docs/concepts/publishing-model",
  "docs/guides/assets",
  "docs/guides/react-publishing",
  "docs/api",
  "docs/api/react",
  "docs/api/core",
  "docs/api/viewer",
  "docs/changelog",
] as const;

/** `/:lang` renders that locale's landing page. */
export const SITE_LOCALE_ROOT_ROUTES = LOCALES.map((locale) => `/${locale}`);

export const SITE_DOC_ROUTES = LOCALES.flatMap((locale) =>
  SITE_DOC_PATHS.map((path) => `/${locale}/${path}`),
);

const articleFiles = readdirSync(new URL("./content/articles/", import.meta.url));
const articleSlugs = new Set(
  articleFiles.flatMap((file) => {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.en\.mdx$/.exec(file);
    return match?.[1] ? [match[1]] : [];
  }),
);

for (const file of articleFiles) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:en|ko|ja|zh-CN)\.mdx$/.test(file)) {
    throw new Error(`Invalid article filename: ${file}`);
  }
  const slug = file.replace(/\.(?:en|ko|ja|zh-CN)\.mdx$/, "");
  if (!articleSlugs.has(slug)) throw new Error(`Article ${file} has no English source.`);
}

export const SITE_BLOG_ROUTES = LOCALES.flatMap((locale) => [
  `/${locale}/blog`,
  ...[...articleSlugs].sort().map((slug) => `/${locale}/blog/${slug}`),
]);

export const SITE_PRERENDER_ROUTES = [
  ...SITE_LOCALE_ROOT_ROUTES,
  ...SITE_DOC_ROUTES,
  ...SITE_BLOG_ROUTES,
];
