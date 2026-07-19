import { LOCALES, type Locale } from "../lib/i18n";

export interface MarketingFeature {
  description: string;
  proof: string;
  title: string;
}

export interface MarketingCopy {
  codeLabel: string;
  copiedLabel: string;
  copyFailedLabel: string;
  copyLabel: string;
  description: string;
  docsCta: string;
  eyebrow: string;
  featureDescription: string;
  featureEyebrow: string;
  featureTitle: string;
  features: readonly MarketingFeature[];
  footerDescription: string;
  metadataDescription: string;
  metadataTitle: string;
  primaryCta: string;
  publishingContractLabel: string;
  skipLink: string;
  title: string;
}

export const HERO_CODE = [
  'import { ImposiaPageViewer } from "@imposia/react";',
  "<ImposiaPageViewer source={{ html }} />",
] as const;

export const marketingCopy: Record<Locale, MarketingCopy> = {
  en: {
    metadataTitle: "Imposia — HTML in. Pages out.",
    metadataDescription:
      "Browser-native HTML and CSS publishing for React, native print, and reflowable EPUB.",
    eyebrow: "Browser-native publishing",
    title: "HTML in. Pages out.",
    description:
      "Turn HTML and CSS into committed browser pages for preview and native print, then export reflowable EPUB from the same source.",
    codeLabel: "React quick start",
    copyLabel: "Copy code",
    copiedLabel: "Copied",
    copyFailedLabel: "Copy failed",
    primaryCta: "Explore the demo",
    docsCta: "Read the docs",
    publishingContractLabel: "Publishing contract",
    skipLink: "Skip to content",
    featureEyebrow: "One source, explicit outputs",
    featureTitle: "Preview, print, and EPUB stay in sync.",
    featureDescription:
      "Preview and print share the committed pages. EPUB comes from the semantic source committed with them.",
    features: [
      {
        title: "One canonical iframe",
        description:
          "Preview, Viewer, and print share the exact committed page document. A new generation appears only after pagination succeeds.",
        proof: "ONE COMMITTED DOCUMENT",
      },
      {
        title: "Browser-native pagination",
        description:
          "HTML, CSS page rules, and recursive flow fragmentation stay in the browser where the final document lives.",
        proof: "BROWSER ESM",
      },
      {
        title: "React-first, Core underneath",
        description:
          "Use the React component for application work or the framework-neutral Core controller for a custom surface.",
        proof: "REACT 18+ · CORE API",
      },
      {
        title: "Native print",
        description:
          "Printing calls the committed iframe's Window.print(). There is no cloned print document or second layout pass.",
        proof: "NO PRINT CLONE",
      },
      {
        title: "Reflowable EPUB 3.3",
        description:
          "Export a browser Blob from the latest committed semantic source, without pretending the paginated DOM is fixed-layout EPUB.",
        proof: "SEMANTIC EXPORT",
      },
      {
        title: "Explicit boundaries",
        description:
          "Typed warnings expose constrained behavior, while the host asset resolver remains the only admitted resource boundary.",
        proof: "WARNINGS, NOT GUESSWORK",
      },
    ],
    footerDescription: "React-first, framework-neutral underneath, and browser-only by design.",
  },
  ko: {
    metadataTitle: "Imposia — HTML을 넣으면, 페이지가 됩니다.",
    metadataDescription:
      "React, 브라우저 기본 인쇄, 리플로우형 EPUB을 위한 브라우저 네이티브 HTML/CSS 퍼블리싱.",
    eyebrow: "브라우저 네이티브 퍼블리싱",
    title: "HTML을 넣으면, 페이지가 됩니다.",
    description:
      "HTML과 CSS를 브라우저에서 페이지로 만들어 미리보기와 인쇄에 사용하고, 같은 원본에서 리플로우형 EPUB을 내보냅니다.",
    codeLabel: "React 빠른 시작",
    copyLabel: "코드 복사",
    copiedLabel: "복사됨",
    copyFailedLabel: "복사 실패",
    primaryCta: "데모 살펴보기",
    docsCta: "문서 읽기",
    publishingContractLabel: "퍼블리싱 계약",
    skipLink: "본문으로 바로가기",
    featureEyebrow: "하나의 원본, 목적에 맞는 출력",
    featureTitle: "미리보기와 출력이 같은 내용을 담습니다.",
    featureDescription:
      "미리보기와 인쇄는 확정된 페이지를 공유하고, EPUB은 함께 확정된 의미 구조에서 만듭니다.",
    features: [
      {
        title: "하나의 기준 iframe",
        description:
          "미리보기, Viewer, 인쇄가 동일하게 커밋된 페이지 문서를 사용합니다. 페이지네이션이 성공한 뒤에만 새 세대가 나타납니다.",
        proof: "하나의 커밋된 문서",
      },
      {
        title: "브라우저 네이티브 페이지네이션",
        description:
          "HTML, CSS 페이지 규칙, 재귀 흐름 분할이 최종 문서가 존재하는 브라우저 안에 머뭅니다.",
        proof: "BROWSER ESM",
      },
      {
        title: "React 우선, 그 아래 Core",
        description:
          "앱에서는 React 컴포넌트를, 직접 만든 화면에서는 프레임워크 중립적인 Core 컨트롤러를 사용하세요.",
        proof: "REACT 18+ · CORE API",
      },
      {
        title: "브라우저 기본 인쇄",
        description:
          "커밋된 iframe의 Window.print()를 호출합니다. 인쇄용 문서 복제나 두 번째 레이아웃 계산은 없습니다.",
        proof: "인쇄 복제 없음",
      },
      {
        title: "리플로우형 EPUB 3.3",
        description:
          "최신 커밋의 의미 구조를 브라우저 Blob으로 내보냅니다. 페이지 DOM을 고정 레이아웃 EPUB처럼 포장하지 않습니다.",
        proof: "의미 기반 내보내기",
      },
      {
        title: "명확한 경계",
        description:
          "제약된 동작은 타입이 있는 경고로 드러내고, 호스트의 에셋 리졸버만 리소스를 들이는 경계로 둡니다.",
        proof: "추측 대신 경고",
      },
    ],
    footerDescription:
      "React를 우선하고, 내부는 프레임워크 중립적이며, 처음부터 브라우저 전용으로 설계했습니다.",
  },
  "zh-CN": {
    metadataTitle: "Imposia — 输入 HTML，输出页面。",
    metadataDescription: "面向 React、浏览器原生打印与可重排 EPUB 的浏览器原生 HTML/CSS 出版工具。",
    eyebrow: "浏览器原生出版",
    title: "输入 HTML，输出页面。",
    description:
      "在浏览器中将 HTML 和 CSS 转换为可预览、可打印的页面，并从同一份源内容导出可重排 EPUB。",
    codeLabel: "React 快速开始",
    copyLabel: "复制代码",
    copiedLabel: "已复制",
    copyFailedLabel: "复制失败",
    primaryCta: "查看演示",
    docsCta: "阅读文档",
    publishingContractLabel: "出版契约",
    skipLink: "跳到正文",
    featureEyebrow: "一份源内容，明确的输出",
    featureTitle: "预览、打印与 EPUB 始终同步。",
    featureDescription: "预览与打印共用已提交页面，EPUB 则根据同时提交的语义源生成。",
    features: [
      {
        title: "一个规范 iframe",
        description:
          "预览、Viewer 与打印共用完全相同的已提交页面文档。只有分页成功后，新版本才会出现。",
        proof: "一个已提交文档",
      },
      {
        title: "浏览器原生分页",
        description: "HTML、CSS 页面规则与递归流分段都留在最终文档所在的浏览器中。",
        proof: "BROWSER ESM",
      },
      {
        title: "React 优先，Core 托底",
        description: "应用开发可使用 React 组件，自定义界面则可直接使用框架无关的 Core 控制器。",
        proof: "REACT 18+ · CORE API",
      },
      {
        title: "浏览器原生打印",
        description:
          "打印直接调用已提交 iframe 的 Window.print()，不会克隆打印文档，也不会再次排版。",
        proof: "无打印副本",
      },
      {
        title: "可重排 EPUB 3.3",
        description: "从最新提交的语义源导出浏览器 Blob，不会把分页 DOM 冒充为固定版式 EPUB。",
        proof: "语义化导出",
      },
      {
        title: "边界清晰可见",
        description: "类型化警告揭示受限行为，宿主资源解析器则是唯一允许资源进入的边界。",
        proof: "警告，而非猜测",
      },
    ],
    footerDescription: "以 React 为先，底层不绑定框架，并且从设计之初就只运行在浏览器中。",
  },
  ja: {
    metadataTitle: "Imposia — HTMLから、ページへ。",
    metadataDescription:
      "React、ブラウザー標準印刷、リフロー型EPUBのためのブラウザーネイティブHTML/CSS出版。",
    eyebrow: "ブラウザーネイティブ出版",
    title: "HTMLから、ページへ。",
    description:
      "HTMLとCSSをブラウザー内でプレビュー・印刷用のページに変換し、同じソースからリフロー型EPUBを書き出します。",
    codeLabel: "Reactクイックスタート",
    copyLabel: "コードをコピー",
    copiedLabel: "コピーしました",
    copyFailedLabel: "コピーできませんでした",
    primaryCta: "デモを見る",
    docsCta: "ドキュメントを読む",
    publishingContractLabel: "出版契約",
    skipLink: "本文へ移動",
    featureEyebrow: "ひとつのソース、明確な出力",
    featureTitle: "プレビュー、印刷、EPUBの内容を揃えます。",
    featureDescription:
      "プレビューと印刷は確定済みページを共有し、EPUBは同時に確定したセマンティックソースから作成します。",
    features: [
      {
        title: "ひとつの基準iframe",
        description:
          "プレビュー、Viewer、印刷は同じ確定済みページ文書を共有します。ページネーション成功後にだけ新しい世代が現れます。",
        proof: "ひとつの確定済み文書",
      },
      {
        title: "ブラウザーネイティブのページネーション",
        description:
          "HTML、CSSページ規則、再帰的なフロー分割は、最終文書が存在するブラウザー内に留まります。",
        proof: "BROWSER ESM",
      },
      {
        title: "React優先、その下にCore",
        description:
          "アプリにはReactコンポーネントを、独自UIにはフレームワーク非依存のCoreコントローラーを利用できます。",
        proof: "REACT 18+ · CORE API",
      },
      {
        title: "ブラウザー標準印刷",
        description:
          "確定済みiframeのWindow.print()を呼び出します。印刷文書の複製や二度目のレイアウト処理はありません。",
        proof: "印刷用複製なし",
      },
      {
        title: "リフロー型EPUB 3.3",
        description:
          "最新の確定済みセマンティックソースからブラウザーBlobを書き出します。ページDOMを固定レイアウトEPUBには見せかけません。",
        proof: "セマンティック出力",
      },
      {
        title: "明確な境界",
        description:
          "制約のある動作は型付き警告で示し、ホストのアセットリゾルバーだけをリソース受け入れ境界にします。",
        proof: "推測ではなく警告",
      },
    ],
    footerDescription: "Reactを第一に、内部はフレームワーク非依存で、初めからブラウザー専用です。",
  },
};

export function isSupportedLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale === value);
}
