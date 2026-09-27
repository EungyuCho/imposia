import type { Locale } from "./i18n";

export const ARTICLE_COPY: Record<
  Locale,
  {
    indexTitle: string;
    indexDescription: string;
    latest: string;
    read: string;
    back: string;
    contents: string;
    englishNotice: string;
    notFound: string;
    footer: string;
    dateLocale: string;
  }
> = {
  en: {
    indexTitle: "Inside Imposia",
    indexDescription:
      "Notes on building a browser publishing runtime: its architecture, tradeoffs, and evidence.",
    latest: "Latest article",
    read: "Read article",
    back: "All articles",
    contents: "On this page",
    englishNotice: "This article is currently available in English.",
    notFound: "Article not found",
    footer: "Build pages in the browser.",
    dateLocale: "en-US",
  },
  ko: {
    indexTitle: "Imposia 이야기",
    indexDescription: "브라우저 퍼블리싱 런타임을 만든 과정과 설계 선택, 검증 결과를 기록합니다.",
    latest: "최신 글",
    read: "글 읽기",
    back: "모든 글",
    contents: "이 글의 목차",
    englishNotice: "이 글은 현재 영어로 제공됩니다.",
    notFound: "글을 찾을 수 없습니다",
    footer: "브라우저에서 페이지를 만듭니다.",
    dateLocale: "ko-KR",
  },
  "zh-CN": {
    indexTitle: "走进 Imposia",
    indexDescription: "关于浏览器出版运行时的架构、取舍和验证记录。",
    latest: "最新文章",
    read: "阅读文章",
    back: "所有文章",
    contents: "本文目录",
    englishNotice: "本文目前仅提供英文版本。",
    notFound: "未找到文章",
    footer: "在浏览器中生成页面。",
    dateLocale: "zh-CN",
  },
  ja: {
    indexTitle: "Imposia の舞台裏",
    indexDescription: "ブラウザー出版ランタイムの設計、判断、検証を記録します。",
    latest: "最新の記事",
    read: "記事を読む",
    back: "記事一覧",
    contents: "目次",
    englishNotice: "この記事は現在、英語で提供しています。",
    notFound: "記事が見つかりません",
    footer: "ブラウザーでページを作る。",
    dateLocale: "ja-JP",
  },
};
