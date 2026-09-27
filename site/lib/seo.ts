import { LOCALES, type Locale } from "./i18n";
import { siteUrl } from "./site-url";

/** Every variant lists the same translated URLs, including itself. */
export function localizedSearchLinks(
  locale: Locale,
  suffix = "",
  availableLocales: readonly Locale[] = LOCALES,
  canonicalLocale: Locale = locale,
) {
  const route = (language: Locale) => siteUrl(`/${language}${suffix ? `/${suffix}` : ""}`);
  return [
    { tagName: "link" as const, rel: "canonical", href: route(canonicalLocale) },
    ...(availableLocales.includes(locale) ? availableLocales : []).map((language) => ({
      tagName: "link" as const,
      rel: "alternate",
      hrefLang: language,
      href: route(language),
    })),
  ];
}
