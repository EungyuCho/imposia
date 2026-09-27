import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { BookOpen } from "lucide-react";
import type { Locale } from "./i18n";
import { i18nConfig } from "./i18n";
import { NAV_LABELS } from "./navigation";

export function baseOptions(lang: Locale): BaseLayoutProps {
  const labels = NAV_LABELS[lang];

  return {
    githubUrl: "https://github.com/EungyuCho/imposia",
    nav: {
      title: (
        <span className="imposia-logo">
          <span aria-hidden="true" className="imposia-mark">
            <BookOpen color="#fff" size={14} strokeWidth={2.2} />
          </span>
          Imposia
        </span>
      ),
      url: `/${lang}`,
    },
    links: [
      { text: labels.docs, url: `/${lang}/docs`, active: "nested-url" },
      { text: labels.blog, url: `/${lang}/blog`, active: "nested-url" },
      { text: labels.examples, url: "/examples/demo/index.html" },
      { text: labels.api, url: `/${lang}/docs/api` },
    ],
    i18n: i18nConfig,
  };
}
