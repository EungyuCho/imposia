import { LOCALES, type Locale } from "../lib/i18n";

export interface MarketingFeature {
  readonly description: string;
  readonly proof: string;
  readonly title: string;
}

export interface MarketingOutcome {
  readonly description: string;
  readonly title: string;
}

export interface MarketingCopy {
  readonly codeLabel: string;
  readonly copiedLabel: string;
  readonly copyFailedLabel: string;
  readonly copyLabel: string;
  readonly description: string;
  readonly docsCta: string;
  readonly eyebrow: string;
  readonly featureDescription: string;
  readonly featureEyebrow: string;
  readonly featureTitle: string;
  readonly features: readonly MarketingFeature[];
  readonly footerDescription: string;
  readonly metadataDescription: string;
  readonly metadataTitle: string;
  readonly outcomes: readonly MarketingOutcome[];
  readonly outcomesLabel: string;
  readonly primaryCta: string;
  readonly publishingContractLabel: string;
  readonly skipLink: string;
  readonly title: string;
}

export const HERO_CODE = [
  'import { ImposiaPageViewer } from "@imposia/react";',
  "<ImposiaPageViewer source={{ html }} />",
] as const;

export const marketingCopy: Record<Locale, MarketingCopy> = {
  en: {
    metadataTitle: "Imposia — Print React HTML or save it as PDF",
    metadataDescription:
      "Turn React HTML into complete browser-native pages for in-app preview, native print, Save as PDF, and reflowable EPUB.",
    outcomesLabel: "What you can do with Imposia",
    eyebrow: "Browser-native document publishing for React",
    title: "Turn React HTML into pages you can preview, print, and save as PDF.",
    description:
      "Add a paginated document surface without sending HTML to a server renderer. Imposia keeps the last complete document visible while it prepares the next, then uses that committed result for preview and print.",
    codeLabel: "React quick start",
    copyLabel: "Copy code",
    copiedLabel: "Copied",
    copyFailedLabel: "Copy failed",
    primaryCta: "Try the publishing lab",
    docsCta: "Start building",
    publishingContractLabel: "Publishing model",
    skipLink: "Skip to content",
    outcomes: [
      {
        title: "Preview in your app",
        description: "Render paginated HTML inside the product your users already know.",
      },
      {
        title: "Print or save as PDF",
        description:
          "Open native browser print from the same committed pages, then print or choose Save as PDF.",
      },
      {
        title: "Publish a real EPUB",
        description: "Export reflowable EPUB 3.3 from the latest committed semantic source.",
      },
    ],
    featureEyebrow: "What your product gains",
    featureTitle: "One browser document path, from live content to reader-ready output.",
    featureDescription:
      "Keep authoring in React. Imposia handles page boundaries, complete updates, native print, and semantic export in the browser.",
    features: [
      {
        title: "Start with one React component",
        description:
          "Pass HTML to ImposiaPageViewer and add a paginated surface without introducing a document server.",
        proof: "@IMPOSIA/REACT",
      },
      {
        title: "Keep complete pages on screen",
        description:
          "A source update replaces the visible document only after the next generation finishes.",
        proof: "ATOMIC COMMIT",
      },
      {
        title: "Protect content at page breaks",
        description:
          "Within the declared contract, authored content remains exactly once and in source order across pages.",
        proof: "NO GAPS · NO DUPLICATES",
      },
      {
        title: "Use native print and Save as PDF",
        description:
          "Open the browser print dialog from the accepted page sequence. PDF output comes from its Save as PDF option, not a separate PDF renderer.",
        proof: "NATIVE PRINT · PDF",
      },
      {
        title: "Export semantic EPUB",
        description:
          "Create a reflowable EPUB 3.3 Blob from the committed source rather than wrapping page DOM.",
        proof: "REFLOWABLE EPUB",
      },
      {
        title: "Drop down to Core when needed",
        description:
          "Use framework-neutral controllers and Viewer APIs for custom integration and presentation.",
        proof: "CORE · VIEWER",
      },
    ],
    footerDescription:
      "React-first document publishing, framework-neutral underneath, and browser-only by design.",
  },
  ko: {
    metadataTitle: "Imposia — React HTML을 브라우저에서 인쇄하고 PDF로 저장하세요",
    metadataDescription:
      "React HTML을 앱 미리보기, 브라우저 기본 인쇄, PDF 저장, 리플로우형 EPUB에 쓸 완성된 페이지로 만듭니다.",
    outcomesLabel: "Imposia로 할 수 있는 일",
    eyebrow: "React HTML을 인쇄 가능한 문서로",
    title: "React에서 만든 HTML을 미리보고, 인쇄하고, PDF로 저장하세요.",
    description:
      "HTML을 서버 렌더러로 보내지 않고 앱 안에서 페이지로 만드세요. 새 문서를 준비하는 동안에는 마지막으로 완성된 페이지를 계속 보여 주고, 미리본 페이지를 그대로 인쇄하거나 PDF로 저장할 수 있습니다.",
    codeLabel: "React 빠른 시작",
    copyLabel: "코드 복사",
    copiedLabel: "복사됨",
    copyFailedLabel: "복사 실패",
    primaryCta: "라이브 데모 보기",
    docsCta: "만들어 보기",
    publishingContractLabel: "미리보기와 출력 원리",
    skipLink: "본문으로 바로가기",
    outcomes: [
      {
        title: "앱에서 페이지를 미리봅니다",
        description: "별도 문서 서버 없이, 지금 쓰는 제품 화면 안에 페이지를 띄웁니다.",
      },
      {
        title: "인쇄하거나 PDF로 저장합니다",
        description: "미리본 페이지로 브라우저 인쇄 창을 열어 바로 인쇄하거나 PDF로 저장합니다.",
      },
      {
        title: "리플로우형 EPUB으로 내보냅니다",
        description: "완성된 문서의 의미 구조를 읽기 편한 EPUB 3.3으로 만듭니다.",
      },
    ],
    featureEyebrow: "HTML 하나로 이어지는 작업",
    featureTitle: "미리보기부터 인쇄, PDF 저장, EPUB까지 한 흐름으로 이어집니다.",
    featureDescription:
      "React 앱은 지금처럼 HTML을 만들면 됩니다. Imposia가 브라우저에서 페이지를 나누고, 완성된 문서만 화면에 바꾸어 표시하며, 인쇄와 내보내기까지 연결합니다.",
    features: [
      {
        title: "React 컴포넌트 하나로 시작합니다",
        description: "HTML을 ImposiaPageViewer에 넘겨 문서 서버 없이 페이지 화면을 추가합니다.",
        proof: "@IMPOSIA/REACT",
      },
      {
        title: "완성된 페이지만 보여 줍니다",
        description: "원본이 바뀌어도 다음 문서를 끝까지 만든 뒤에만 화면을 바꿉니다.",
        proof: "완성 후 교체",
      },
      {
        title: "페이지 경계에서도 내용을 지킵니다",
        description:
          "지원 범위 안에서는 원문 내용이 페이지를 넘어가도 빠지거나 겹치지 않고 순서를 유지합니다.",
        proof: "누락 없음 · 중복 없음",
      },
      {
        title: "브라우저에서 인쇄하고 PDF로 저장합니다",
        description:
          "미리본 페이지를 그대로 브라우저 인쇄에 사용합니다. 별도 PDF 렌더러는 없으며, PDF는 인쇄 창에서 저장합니다.",
        proof: "기본 인쇄 · PDF 저장",
      },
      {
        title: "의미 구조를 EPUB으로 내보냅니다",
        description:
          "페이지 DOM을 그대로 묶지 않고, 완성된 원본으로 리플로우형 EPUB 3.3 Blob을 만듭니다.",
        proof: "리플로우형 EPUB",
      },
      {
        title: "직접 제어하려면 Core를 사용합니다",
        description:
          "직접 통합하거나 화면을 구성할 때는 프레임워크에 묶이지 않는 Core와 Viewer API를 사용하세요.",
        proof: "CORE · VIEWER",
      },
    ],
    footerDescription:
      "React 앱에서 바로 시작하고, 필요할 때 Core와 Viewer로 확장하는 브라우저 문서 도구입니다.",
  },
  "zh-CN": {
    metadataTitle: "Imposia — 将 React HTML 原生打印或另存为 PDF",
    metadataDescription:
      "把 React HTML 转换为可在应用中预览、原生打印、另存为 PDF 并导出可重排 EPUB 的完整页面。",
    outcomesLabel: "Imposia 可以完成的工作",
    eyebrow: "面向 React 的浏览器文档出版",
    title: "把 React 生成的 HTML 变成可预览、打印或另存为 PDF 的分页文档。",
    description:
      "无需把 HTML 发送给服务端渲染器，即可在应用中加入分页文档。Imposia 准备新文档时会继续显示上一份完整文档，并让预览与打印共用确认后的结果。",
    codeLabel: "React 快速开始",
    copyLabel: "复制代码",
    copiedLabel: "已复制",
    copyFailedLabel: "复制失败",
    primaryCta: "体验出版实验室",
    docsCta: "开始构建",
    publishingContractLabel: "出版模型",
    skipLink: "跳到正文",
    outcomes: [
      {
        title: "在应用中预览分页文档",
        description: "直接在用户熟悉的产品界面中显示分页后的 HTML。",
      },
      {
        title: "打印或另存为 PDF",
        description: "从同一组确认页面打开浏览器打印对话框，直接打印或选择另存为 PDF。",
      },
      {
        title: "导出真正的 EPUB",
        description: "从最后确认的语义源导出可重排 EPUB 3.3。",
      },
    ],
    featureEyebrow: "产品将获得什么",
    featureTitle: "从应用中的实时内容到读者可用的输出，只保留一条文档路径。",
    featureDescription:
      "继续在 React 中创作内容。分页边界、完整版本替换、原生打印、PDF 保存与语义导出都在浏览器中完成。",
    features: [
      {
        title: "从一个 React 组件开始",
        description: "把 HTML 交给 ImposiaPageViewer，无需文档服务器即可加入分页界面。",
        proof: "@IMPOSIA/REACT",
      },
      {
        title: "始终显示完整页面",
        description: "源内容变化后，只有下一版本完成时才会替换当前可见文档。",
        proof: "原子提交",
      },
      {
        title: "在分页边界保护内容",
        description: "在已声明的支持范围内，源内容跨页后仍仅出现一次，并保持原始顺序。",
        proof: "无缺失 · 无重复",
      },
      {
        title: "原生打印并另存为 PDF",
        description:
          "从确认后的页面序列打开浏览器打印对话框。PDF 来自其中的另存为 PDF，而不是独立 PDF 渲染器。",
        proof: "原生打印 · PDF",
      },
      {
        title: "导出语义化 EPUB",
        description: "根据确认后的源内容生成可重排 EPUB 3.3 Blob，而不是包装分页 DOM。",
        proof: "可重排 EPUB",
      },
      {
        title: "需要时直接使用 Core",
        description: "自定义集成与展示可使用框架无关的 Core 和 Viewer API。",
        proof: "CORE · VIEWER",
      },
    ],
    footerDescription: "从 React 直接开始，并可深入使用框架无关 Core 的浏览器文档出版工具。",
  },
  ja: {
    metadataTitle: "Imposia — React HTMLを印刷・PDF保存できるページへ",
    metadataDescription:
      "React HTMLを、アプリ内プレビュー、ブラウザー標準印刷、PDF保存、リフロー型EPUBに使える完成済みページへ変換します。",
    outcomesLabel: "Imposiaでできること",
    eyebrow: "Reactアプリから始めるブラウザー出版",
    title: "Reactで作ったHTMLを、プレビュー・印刷・PDF保存できるページへ。",
    description:
      "HTMLをサーバーレンダラーへ送らず、アプリ内でページ文書に変換できます。新しい文書の準備中は最後に完成したページを表示し続け、プレビューしたページをそのまま印刷またはPDF保存に使えます。",
    codeLabel: "Reactクイックスタート",
    copyLabel: "コードをコピー",
    copiedLabel: "コピーしました",
    copyFailedLabel: "コピーできませんでした",
    primaryCta: "出版ラボを試す",
    docsCta: "作り始める",
    publishingContractLabel: "出版モデル",
    skipLink: "本文へ移動",
    outcomes: [
      {
        title: "アプリ内で\nページをプレビュー",
        description: "ユーザーが使い慣れた画面の中に、ページ分割したHTMLを表示します。",
      },
      {
        title: "印刷またはPDFとして保存",
        description:
          "同じ確定済みページからブラウザーの印刷画面を開き、印刷またはPDF保存を選べます。",
      },
      {
        title: "読みやすいEPUBとして出力",
        description: "最後に確定したセマンティックソースからリフロー型EPUB 3.3を出力します。",
      },
    ],
    featureEyebrow: "ひとつのHTMLから続く作業",
    featureTitle: "プレビュー、印刷、PDF保存、EPUB出力までをひとつの流れに。",
    featureDescription:
      "ReactアプリはこれまでどおりHTMLを作れます。Imposiaがブラウザー内でページを分割し、完成した文書だけを表示して、印刷と出力までつなぎます。",
    features: [
      {
        title: "ひとつのReactコンポーネントから開始",
        description:
          "HTMLをImposiaPageViewerへ渡すだけで、文書サーバーを増やさずページ表示を追加できます。",
        proof: "@IMPOSIA/REACT",
      },
      {
        title: "完成したページだけを表示",
        description: "ソースが変わっても、次の世代が完成してから表示中の文書を置き換えます。",
        proof: "アトミックコミット",
      },
      {
        title: "ページ境界でも内容を維持",
        description:
          "対応範囲内では、ソース内容がページをまたいでも欠落・重複せず、元の順序を保ちます。",
        proof: "欠落なし · 重複なし",
      },
      {
        title: "標準印刷とPDF保存",
        description:
          "確定済みページでブラウザーの印刷画面を開きます。PDFは別のレンダラーではなく、印刷画面から保存します。",
        proof: "標準印刷 · PDF",
      },
      {
        title: "セマンティックなEPUBを出力",
        description:
          "ページDOMを包むのではなく、確定済みソースからリフロー型EPUB 3.3 Blobを作ります。",
        proof: "リフロー型EPUB",
      },
      {
        title: "直接制御するならCore",
        description: "独自の統合や表示には、フレームワーク非依存のCoreとViewer APIを利用できます。",
        proof: "CORE · VIEWER",
      },
    ],
    footerDescription:
      "Reactアプリから始め、必要に応じてCoreとViewerへ広げられるブラウザー出版ツールです。",
  },
};

export function isSupportedLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale === value);
}
