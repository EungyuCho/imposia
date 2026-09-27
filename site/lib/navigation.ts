import type { Locale } from "./i18n";

/** Shared top-level navigation labels for landing, docs, and articles. */
export const NAV_LABELS: Record<
  Locale,
  { docs: string; blog: string; examples: string; api: string; language: string }
> = {
  en: { docs: "Docs", blog: "Blog", examples: "Examples", api: "API", language: "Language" },
  ko: { docs: "문서", blog: "블로그", examples: "예제", api: "API", language: "언어" },
  "zh-CN": { docs: "文档", blog: "博客", examples: "示例", api: "API", language: "语言" },
  ja: { docs: "ドキュメント", blog: "ブログ", examples: "サンプル", api: "API", language: "言語" },
};
