import type { Config } from "@react-router/dev/config";

const LOCALES = ["en", "ko", "zh-CN", "ja"] as const;
const DOC_PATHS = [
  "docs",
  "docs/getting-started",
  "docs/publishing-contract",
  "docs/api-reference",
] as const;

export default {
  prerender: LOCALES.flatMap((locale) => [
    `/${locale}`,
    ...DOC_PATHS.map((path) => `/${locale}/${path}`),
  ]),
  ssr: false,
} satisfies Config;
