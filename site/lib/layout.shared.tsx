import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import type { Locale } from "./i18n";
import { i18nConfig } from "./i18n";

const navigationLabels: Record<Locale, { docs: string; demo: string }> = {
  en: { docs: "Documentation", demo: "Demo" },
  ko: { docs: "문서", demo: "데모" },
  "zh-CN": { docs: "文档", demo: "演示" },
  ja: { docs: "ドキュメント", demo: "デモ" },
};

export function baseOptions(lang: Locale): BaseLayoutProps {
  const labels = navigationLabels[lang];

  return {
    githubUrl: "https://github.com/EungyuCho/imposia",
    nav: {
      title: "Imposia",
      url: `/${lang}`,
    },
    links: [
      { text: labels.docs, url: `/${lang}/docs` },
      { text: labels.demo, url: "/examples/demo/index.html" },
    ],
    i18n: i18nConfig,
  };
}
