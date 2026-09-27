import { LOCALES, type Locale } from "./i18n";

export interface ArticleSummary {
  readonly slug: string;
  readonly locale: Locale;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly category: string;
}

type Frontmatter = Pick<ArticleSummary, "title" | "description" | "date" | "category">;

const frontmatter = import.meta.glob<Frontmatter>("../content/articles/*.mdx", {
  eager: true,
  import: "frontmatter",
  query: { collection: "articles" },
});

const summaries = new Map<string, Map<Locale, ArticleSummary>>();

for (const [path, data] of Object.entries(frontmatter)) {
  const match = /\/([a-z0-9]+(?:-[a-z0-9]+)*)\.(en|ko|zh-CN|ja)\.mdx$/.exec(path);
  if (!match) throw new Error(`Invalid article filename: ${path}`);
  const [, slug, locale] = match;
  if (!slug || !locale || !LOCALES.includes(locale as Locale)) {
    throw new Error(`Invalid article path: ${path}`);
  }
  const localized = summaries.get(slug) ?? new Map<Locale, ArticleSummary>();
  if (localized.has(locale as Locale)) throw new Error(`Duplicate article: ${path}`);
  localized.set(locale as Locale, { slug, locale: locale as Locale, ...data });
  summaries.set(slug, localized);
}

for (const [slug, localized] of summaries) {
  const english = localized.get("en");
  if (!english) throw new Error(`Article ${slug} needs an English source for locale fallback.`);
  for (const article of localized.values()) {
    if (article.date !== english.date) {
      throw new Error(`All translations of ${slug} must have the same publication date.`);
    }
  }
}

export function getArticleSummary(slug: string, locale: Locale): ArticleSummary | undefined {
  const localized = summaries.get(slug);
  return localized?.get(locale) ?? localized?.get("en");
}

export function getArticleLocales(slug: string): readonly Locale[] {
  const localized = summaries.get(slug);
  return LOCALES.filter((locale) => localized?.has(locale));
}

export function listArticles(locale: Locale): readonly ArticleSummary[] {
  return [...summaries.keys()]
    .map((slug) => getArticleSummary(slug, locale))
    .filter((article): article is ArticleSummary => article !== undefined)
    .sort(
      (left, right) => right.date.localeCompare(left.date) || left.slug.localeCompare(right.slug),
    );
}
