import type { ComponentType } from "react";
import type { MdxComponents } from "../mdx-components";
import { type ArticleSummary, getArticleSummary } from "./article-index";
import type { Locale } from "./i18n";

export interface Article extends ArticleSummary {
  readonly Body: ComponentType<{ readonly components?: MdxComponents }>;
  readonly toc: readonly { depth: number; title: string; url: string }[];
}

interface ArticleModule {
  readonly default: Article["Body"];
  readonly toc: Article["toc"];
}

// The article body bundle is only imported by the detail route. The index uses
// frontmatter alone, so adding posts does not load every MDX body on the index.
const modules = import.meta.glob<ArticleModule>("../content/articles/*.mdx", {
  eager: true,
  query: { collection: "articles" },
});

export function getArticle(slug: string, locale: Locale): Article | undefined {
  const summary = getArticleSummary(slug, locale);
  if (!summary) return undefined;
  const module = modules[`../content/articles/${slug}.${summary.locale}.mdx`];
  if (!module) throw new Error(`Missing compiled article: ${slug}.${summary.locale}.mdx`);
  return { ...summary, Body: module.default, toc: module.toc };
}
