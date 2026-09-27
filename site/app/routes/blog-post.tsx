import { ArrowLeft } from "lucide-react";
import type { LinksFunction, MetaFunction } from "react-router";
import { Link, Navigate, useParams } from "react-router";
import blogHref from "../../blog.css?url";
import { ARTICLE_COPY } from "../../lib/article-copy";
import { getArticleLocales } from "../../lib/article-index";
import { getArticle } from "../../lib/articles";
import { isSupportedLocale, type Locale } from "../../lib/i18n";
import { localizedSearchLinks } from "../../lib/seo";
import { getMDXComponents } from "../../mdx-components";
import { ArticleShell } from "../articles/shell";

export const links: LinksFunction = () => [{ href: blogHref, rel: "stylesheet" }];

export const meta: MetaFunction = ({ params }) => {
  const lang = params.lang;
  const slug = params.slug;
  if (!lang || !isSupportedLocale(lang) || !slug) return [];
  const article = getArticle(slug, lang);
  if (!article)
    return [{ title: "Article not found · Imposia" }, { name: "robots", content: "noindex" }];
  return [
    { title: `${article.title} · Imposia` },
    { name: "description", content: article.description },
    ...localizedSearchLinks(lang, `blog/${slug}`, getArticleLocales(slug), article.locale),
  ];
};

function publicationDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(ARTICLE_COPY[locale].dateLocale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export default function BlogPostRoute() {
  const { lang, slug } = useParams<"lang" | "slug">();
  if (!lang || !isSupportedLocale(lang)) return <Navigate replace to="/en/blog" />;
  const copy = ARTICLE_COPY[lang];
  const article = slug ? getArticle(slug, lang) : undefined;

  if (!article) {
    return (
      <ArticleShell lang={lang}>
        <main className="blog-main blog-missing">
          <h1>{copy.notFound}</h1>
          <Link to={`/${lang}/blog`}>{copy.back}</Link>
        </main>
      </ArticleShell>
    );
  }

  const headings = article.toc.filter((item) => item.depth === 2);

  return (
    <ArticleShell lang={lang} slug={article.slug}>
      <main className="blog-main blog-post-layout">
        <Link className="blog-back" to={`/${lang}/blog`}>
          <ArrowLeft aria-hidden="true" size={16} />
          {copy.back}
        </Link>
        {article.locale !== lang && (
          <p className="blog-fallback" role="note">
            {copy.englishNotice}{" "}
            <Link lang="en" to={`/en/blog/${article.slug}`}>
              English →
            </Link>
          </p>
        )}
        <div className="blog-post-grid">
          <article className="blog-post" lang={article.locale}>
            <header className="blog-post-header">
              <span className="blog-eyebrow">{article.category} / Imposia</span>
              <h1>{article.title}</h1>
              <p>{article.description}</p>
              <time dateTime={article.date}>{publicationDate(article.date, article.locale)}</time>
            </header>
            {headings.length > 0 && (
              <details className="blog-mobile-toc">
                <summary>{copy.contents}</summary>
                <ol>
                  {headings.map((item) => (
                    <li key={item.url}>
                      <a href={item.url}>{item.title}</a>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            <div className="blog-content">
              <article.Body components={getMDXComponents()} />
            </div>
          </article>
          {headings.length > 0 && (
            <aside className="blog-toc" aria-label={copy.contents}>
              <div className="blog-toc-inner">
                <h2>{copy.contents}</h2>
                <ol>
                  {headings.map((item) => (
                    <li key={item.url}>
                      <a href={item.url}>{item.title}</a>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          )}
        </div>
        <div className="blog-end">
          <Link to={`/${lang}/blog`}>
            <ArrowLeft aria-hidden="true" size={16} />
            {copy.back}
          </Link>
        </div>
      </main>
    </ArticleShell>
  );
}
