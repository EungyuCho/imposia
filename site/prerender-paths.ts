import { LOCALES } from "./lib/i18n";

export const SITE_DOC_PATHS = [
  "docs",
  "docs/getting-started",
  "docs/concepts/publishing-model",
  "docs/guides/assets",
  "docs/guides/react-publishing",
  "docs/api",
  "docs/api/react",
  "docs/api/core",
  "docs/api/viewer",
  "docs/changelog",
] as const;

export const SITE_PRERENDER_ROUTES = LOCALES.flatMap((locale) => [
  `/${locale}`,
  ...SITE_DOC_PATHS.map((path) => `/${locale}/${path}`),
]);
