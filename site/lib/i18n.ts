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

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
  "zh-CN": "简体中文",
  ja: "日本語",
};

export const i18nUI = defineI18nUI(i18n, {
  en: { displayName: LOCALE_NAMES.en },
  ko: { displayName: LOCALE_NAMES.ko },
  "zh-CN": { displayName: LOCALE_NAMES["zh-CN"] },
  ja: { displayName: LOCALE_NAMES.ja },
});

export function isSupportedLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
