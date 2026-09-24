import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { BookOpen } from "lucide-react";
import type { Locale } from "./i18n";
import { i18nConfig } from "./i18n";

// The same labels as the landing page navigation (site/app/landing/copy.ts).
const navigationLabels: Record<Locale, { docs: string; examples: string; api: string }> = {
  en: { docs: "Docs", examples: "Examples", api: "API" },
  ko: { docs: "문서", examples: "예제", api: "API" },
  "zh-CN": { docs: "文档", examples: "示例", api: "API" },
  ja: { docs: "ドキュメント", examples: "サンプル", api: "API" },
};

export function baseOptions(lang: Locale): BaseLayoutProps {
  const labels = navigationLabels[lang];

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
      { text: labels.examples, url: "/examples/demo/index.html" },
      { text: labels.api, url: `/${lang}/docs/api` },
    ],
    i18n: i18nConfig,
  };
}
