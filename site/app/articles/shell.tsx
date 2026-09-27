import { BookOpen, Languages } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ARTICLE_COPY } from "../../lib/article-copy";
import { LOCALE_NAMES, LOCALES, type Locale } from "../../lib/i18n";
import { NAV_LABELS } from "../../lib/navigation";

export function ArticleShell({
  lang,
  slug,
  children,
}: {
  lang: Locale;
  slug?: string;
  children: ReactNode;
}) {
  const nav = NAV_LABELS[lang];
  const copy = ARTICLE_COPY[lang];
  return (
    <div className="blog" id="imposia-blog">
      <header className="blog-nav">
        <nav aria-label="Imposia" className="blog-nav-left">
          <Link className="blog-logo" to={`/${lang}`}>
            <span aria-hidden="true" className="blog-mark">
              <BookOpen color="#fff" size={14} strokeWidth={2.2} />
            </span>
            Imposia
          </Link>
          <Link className="blog-nav-link" to={`/${lang}/docs`}>
            {nav.docs}
          </Link>
          <Link aria-current="page" className="blog-nav-link is-current" to={`/${lang}/blog`}>
            {nav.blog}
          </Link>
          <a className="blog-nav-link blog-nav-optional" href="/examples/demo/index.html">
            {nav.examples}
          </a>
          <Link className="blog-nav-link blog-nav-optional" to={`/${lang}/docs/api`}>
            {nav.api}
          </Link>
          <a
            className="blog-nav-link blog-nav-optional"
            href="https://github.com/EungyuCho/imposia"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
        <details className="blog-lang">
          <summary aria-label={nav.language}>
            <Languages aria-hidden="true" size={16} />
            <span>{lang === "zh-CN" ? "ZH" : lang.toUpperCase()}</span>
          </summary>
          <ul>
            {LOCALES.map((locale) => (
              <li key={locale}>
                <Link
                  aria-current={locale === lang ? "page" : undefined}
                  lang={locale}
                  to={`/${locale}/blog${slug ? `/${slug}` : ""}`}
                >
                  {LOCALE_NAMES[locale]}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </header>
      {children}
      <footer className="blog-footer">
        <span>Imposia</span>
        <span>{copy.footer}</span>
        <Link to={`/${lang}/docs`}>{nav.docs}</Link>
      </footer>
    </div>
  );
}
