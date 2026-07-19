import { defineI18n, type I18nConfig } from "fumadocs-core/i18n";
import { defineI18nUI } from "fumadocs-ui/i18n";

export const LOCALES = ["en", "ko", "zh-CN", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const i18nConfig = {
  languages: [...LOCALES],
  defaultLanguage: "en",
  fallbackLanguage: "en",
  hideLocale: "never",
} satisfies I18nConfig<Locale>;

export const i18n = defineI18n(i18nConfig);

export const i18nUI = defineI18nUI(i18n, {
  en: { displayName: "English" },
  ko: { displayName: "한국어" },
  "zh-CN": { displayName: "简体中文" },
  ja: { displayName: "日本語" },
});
