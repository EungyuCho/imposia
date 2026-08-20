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

/** `/:lang` forwards to that locale's documentation; it renders no content of its own. */
export const SITE_LOCALE_ROOT_ROUTES = LOCALES.map((locale) => `/${locale}`);

export const SITE_DOC_ROUTES = LOCALES.flatMap((locale) =>
  SITE_DOC_PATHS.map((path) => `/${locale}/${path}`),
);

export const SITE_PRERENDER_ROUTES = [...SITE_LOCALE_ROOT_ROUTES, ...SITE_DOC_ROUTES];
