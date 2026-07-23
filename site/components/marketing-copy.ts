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
      "Atomic browser-native HTML/CSR pagination for React preview, native print, and semantic export.",
    eyebrow: "HTML/CSR pagination integrity",
    title: "HTML in. Pages out.",
    description:
      "Turn current HTML and CSS into committed pages without losing or duplicating declared-flow content at page boundaries. Rapid CSR updates replace only complete generations.",
    codeLabel: "React quick start",
    copyLabel: "Copy code",
    copiedLabel: "Copied",
    copyFailedLabel: "Copy failed",
    primaryCta: "Explore the demo",
    docsCta: "Read the docs",
    publishingContractLabel: "Publishing contract",
    skipLink: "Skip to content",
    featureEyebrow: "One source, one committed sequence",
    featureTitle: "Page breaks and rapid updates stay internally consistent.",
    featureDescription:
      "Public fixtures flatten every page back to the exact source order. Preview and print share that committed document; EPUB remains a semantic projection.",
    features: [
      {
        title: "Exact committed sequence",
        description:
          "Every source token in the declared continuity fixture appears exactly once and in order across the committed page boundaries.",
        proof: "NO GAPS · NO DUPLICATES",
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
      "React 미리보기, 브라우저 기본 인쇄, 의미 기반 내보내기를 위한 원자적 HTML/CSR 페이지네이션.",
    eyebrow: "HTML/CSR 페이지네이션 정합성",
    title: "HTML을 넣으면, 페이지가 됩니다.",
    description:
      "선언된 흐름의 내용이 페이지 경계에서 빠지거나 중복되지 않도록 현재 HTML과 CSS를 커밋된 페이지로 만듭니다. 빠른 CSR 갱신도 완전한 세대만 교체합니다.",
    codeLabel: "React 빠른 시작",
    copyLabel: "코드 복사",
    copiedLabel: "복사됨",
    copyFailedLabel: "복사 실패",
    primaryCta: "데모 살펴보기",
    docsCta: "문서 읽기",
    publishingContractLabel: "퍼블리싱 계약",
    skipLink: "본문으로 바로가기",
    featureEyebrow: "하나의 원본, 하나의 커밋된 순서",
    featureTitle: "페이지 경계와 빠른 갱신에서도 내용 순서가 유지됩니다.",
    featureDescription:
      "공개 검증 픽스처의 모든 페이지를 이으면 원문 순서와 정확히 일치합니다. 미리보기와 인쇄는 이 문서를 공유하고, EPUB은 의미 구조를 투영합니다.",
    features: [
      {
        title: "정확한 커밋 순서",
        description:
          "선언된 연속성 픽스처의 모든 원문 토큰이 페이지 경계를 지나 정확히 한 번, 원문 순서대로 나타납니다.",
        proof: "누락 없음 · 중복 없음",
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
    metadataDescription: "面向 React 预览、原生打印与语义导出的原子化浏览器 HTML/CSR 分页。",
    eyebrow: "HTML/CSR 分页完整性",
    title: "输入 HTML，输出页面。",
    description:
      "把当前 HTML 与 CSS 转换为已提交页面，避免声明流内容在分页边界丢失或重复；快速 CSR 更新只替换完整版本。",
    codeLabel: "React 快速开始",
    copyLabel: "复制代码",
    copiedLabel: "已复制",
    copyFailedLabel: "复制失败",
    primaryCta: "查看演示",
    docsCta: "阅读文档",
    publishingContractLabel: "出版契约",
    skipLink: "跳到正文",
    featureEyebrow: "一份源内容，一条已提交序列",
    featureTitle: "分页边界与快速更新保持内容顺序一致。",
    featureDescription:
      "公开验证样例拼接所有页面后与源顺序完全一致。预览和打印共用该文档，EPUB 保留为语义投影。",
    features: [
      {
        title: "精确的已提交序列",
        description: "声明的连续性样例中，每个源标记跨越分页边界后仍仅出现一次，并保持原始顺序。",
        proof: "无缺失 · 无重复",
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
      "Reactプレビュー、ブラウザー標準印刷、セマンティック出力のためのアトミックなHTML/CSRページネーション。",
    eyebrow: "HTML/CSRページネーション整合性",
    title: "HTMLから、ページへ。",
    description:
      "宣言済みフローの内容をページ境界で欠落・重複させず、現在のHTMLとCSSを確定済みページへ変換します。高速なCSR更新も完全な世代だけを置き換えます。",
    codeLabel: "Reactクイックスタート",
    copyLabel: "コードをコピー",
    copiedLabel: "コピーしました",
    copyFailedLabel: "コピーできませんでした",
    primaryCta: "デモを見る",
    docsCta: "ドキュメントを読む",
    publishingContractLabel: "出版契約",
    skipLink: "本文へ移動",
    featureEyebrow: "ひとつのソース、ひとつの確定済み順序",
    featureTitle: "ページ境界と高速更新でも内容の順序を維持します。",
    featureDescription:
      "公開検証フィクスチャの全ページを連結するとソース順序と完全に一致します。プレビューと印刷はその文書を共有し、EPUBはセマンティック投影として残ります。",
    features: [
      {
        title: "正確な確定済み順序",
        description:
          "宣言済みの連続性フィクスチャでは、すべてのソーストークンがページ境界を越えても一度だけ元の順序で現れます。",
        proof: "欠落なし · 重複なし",
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
