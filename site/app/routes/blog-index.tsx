import { ArrowRight } from "lucide-react";
import type { LinksFunction, MetaFunction } from "react-router";
import { Link, Navigate, useParams } from "react-router";
import blogHref from "../../blog.css?url";
import { ARTICLE_COPY } from "../../lib/article-copy";
import { listArticles } from "../../lib/article-index";
import { isSupportedLocale, type Locale } from "../../lib/i18n";
import { localizedSearchLinks } from "../../lib/seo";
import { ArticleShell } from "../articles/shell";

export const links: LinksFunction = () => [{ href: blogHref, rel: "stylesheet" }];

export const meta: MetaFunction = ({ params }) => {
  const lang = params.lang;
  if (!lang || !isSupportedLocale(lang)) return [];
  const copy = ARTICLE_COPY[lang];
  return [
    { title: `${copy.indexTitle} · Imposia` },
    { name: "description", content: copy.indexDescription },
    ...localizedSearchLinks(lang, "blog"),
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

export default function BlogIndexRoute() {
  const lang = useParams<"lang">().lang;
  if (!lang || !isSupportedLocale(lang)) return <Navigate replace to="/en/blog" />;
  const copy = ARTICLE_COPY[lang];
  const articles = listArticles(lang);
  const [featured, ...remaining] = articles;

  return (
    <ArticleShell lang={lang}>
      <main className="blog-main blog-index">
        <header className="blog-index-header">
          <span className="blog-eyebrow">Imposia / Blog</span>
          <h1>{copy.indexTitle}</h1>
          <p>{copy.indexDescription}</p>
        </header>
        {featured && (
          <section aria-label={copy.latest} className="blog-feature">
            <div className="blog-feature-art" aria-hidden="true">
              <div className="blog-art-page blog-art-page-back" />
              <div className="blog-art-page blog-art-page-front">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>01 / 02</span>
            </div>
            <div className="blog-feature-copy">
              <p className="blog-eyebrow">
                {copy.latest} · <span lang={featured.locale}>{featured.category}</span>
              </p>
              <h2 lang={featured.locale}>
                <Link to={`/${lang}/blog/${featured.slug}`}>{featured.title}</Link>
              </h2>
              <p lang={featured.locale}>{featured.description}</p>
              <div className="blog-feature-bottom">
                <time dateTime={featured.date}>{publicationDate(featured.date, lang)}</time>
                <Link className="blog-read-link" to={`/${lang}/blog/${featured.slug}`}>
                  {copy.read} <ArrowRight aria-hidden="true" size={18} />
                </Link>
              </div>
              {featured.locale !== lang && <span className="blog-language-badge">English</span>}
            </div>
          </section>
        )}
        {remaining.length > 0 && (
          <ol className="blog-article-list">
            {remaining.map((article) => (
              <li key={article.slug}>
                <div>
                  <span className="blog-eyebrow" lang={article.locale}>
                    {article.category}
                  </span>
                  <h2 lang={article.locale}>
                    <Link to={`/${lang}/blog/${article.slug}`}>{article.title}</Link>
                  </h2>
                  <p lang={article.locale}>{article.description}</p>
                </div>
                <div className="blog-list-meta">
                  <time dateTime={article.date}>{publicationDate(article.date, lang)}</time>
                  {article.locale !== lang && <span className="blog-language-badge">English</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </ArticleShell>
  );
}
