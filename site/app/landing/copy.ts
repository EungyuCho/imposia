import type { Locale } from "../../lib/i18n";

export interface LandingCopy {
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly nav: { docs: string; examples: string; api: string; language: string };
  readonly hero: {
    badgeTag: string;
    badge: string;
    tagline: string;
    getStarted: string;
    demo: string;
    viewerLabel: string;
    liveViewerLabel: string;
  };
  readonly features: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: readonly { title: string; description: string }[];
  };
  readonly how: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: readonly { title: string; description: string }[];
    codeLabel: string;
  };
  readonly bench: {
    eyebrow: string;
    title: string;
    subtitle: string;
    stats: {
      edit: { label: string; description: string };
      large: { label: string; description: string };
      print: { label: string; description: string };
      partial: { label: string; unit: string; description: string };
    };
    medianOf: string;
    footnote: string;
    charts: {
      edit: string;
      paginate: string;
      bundle: string;
      lowerIsBetter: string;
      bundleSubtitle: string;
      failed: string;
      caveat: string;
    };
  };
  readonly packages: {
    eyebrow: string;
    title: string;
    npm: string;
    recommended: string;
    descriptions: { react: string; core: string; viewer: string; client: string };
  };
  readonly cta: { title: string; subtitle: string; docs: string; copy: string; copied: string };
  readonly footer: { docs: string; changelog: string };
}

export const LANDING_COPY: Record<Locale, LandingCopy> = {
  en: {
    metaTitle: "Imposia — HTML in. Pages out.",
    metaDescription:
      "Turn HTML and CSS into real pages. Preview them in your app, then print or save as PDF — all in the browser.",
    nav: { docs: "Docs", examples: "Examples", api: "API", language: "Language" },
    hero: {
      badgeTag: "New",
      badge: "Print-ready pages for React",
      tagline:
        "Turn HTML and CSS into real pages. Preview them in your app, then print or save as PDF — all in the browser.",
      getStarted: "Get Started",
      demo: "Live demo",
      viewerLabel: "Illustration of the Imposia page viewer showing a two-page spread",
      liveViewerLabel: "Live Imposia page viewer: a sample document paginated in your browser",
    },
    features: {
      eyebrow: "WHY IMPOSIA",
      title: "Everything you need to ship pages",
      subtitle: "Keep the HTML and CSS you already have. Imposia handles the pages.",
      items: [
        {
          title: "Real pages from HTML",
          description:
            "Lay out existing markup into sized pages with margins, running heads, and page numbers.",
        },
        {
          title: "Native print and PDF",
          description:
            "print() opens the browser's print dialog. Readers print on paper or choose Save as PDF.",
        },
        {
          title: "No half-built frames",
          description:
            "The next set of pages is finished off-screen. The preview swaps only when layout is complete.",
        },
        {
          title: "One document everywhere",
          description:
            "Preview and print read the same committed pages, so page counts never drift.",
        },
        {
          title: "React-first, framework-free",
          description: "Drop in <ImposiaPageViewer />, or drive @imposia/core from any framework.",
        },
        {
          title: "Controlled asset loading",
          description:
            "Images, fonts, and stylesheets go through your assetResolver. No surprise network requests.",
        },
      ],
    },
    how: {
      eyebrow: "HOW IT WORKS",
      title: "HTML in. Pages out.",
      subtitle: "One component, three steps, and the same pages on screen and on paper.",
      steps: [
        {
          title: "Pass your HTML",
          description:
            "Give the viewer an HTML string with page size and margins. Your CSS still applies.",
        },
        {
          title: "Imposia paginates",
          description:
            "Pages are laid out in a staging frame. The last finished set stays on screen until the new one is ready.",
        },
        {
          title: "Preview, print, save",
          description:
            "Readers flip through pages in your app, then print or save as PDF from the same result.",
        },
      ],
      codeLabel: "Example source files",
    },
    bench: {
      eyebrow: "BENCHMARKS",
      title: "Measured, not claimed.",
      subtitle:
        "Same fixtures, same browser, recorded by the repository's benchmark script. Every number re-runs from a fresh clone.",
      stats: {
        edit: {
          label: "Edit → updated pages",
          description: "One-word edit in a 50-page report until the new pages are committed",
        },
        large: {
          label: "200 pages",
          description: "Pagination of a 200-page document, from HTML to committed pages",
        },
        print: {
          label: "print() → dialog",
          description: "From the print() call until the browser's print dialog is requested",
        },
        partial: {
          label: "Partial frames",
          unit: "frames",
          description: "Incomplete page sets shown on screen during 20 rapid updates",
        },
      },
      medianOf: "median of",
      footnote:
        "harness in scripts/benchmark-compare.ts and scripts/benchmark.ts · pnpm benchmark:compare",
      charts: {
        edit: "Live edit latency · 50 pages",
        paginate: "Pagination · 200 pages",
        bundle: "Bundle size",
        lowerIsBetter: "lower is better",
        bundleSubtitle: "full browser bundle, gzip, lower is better",
        failed: "failed",
        caveat:
          "Paged.js and Vivliostyle have no incremental update, so an edit renders them again from scratch. All three produced the same page counts.",
      },
    },
    packages: {
      eyebrow: "PACKAGES",
      title: "Start with React. Go lower when you need to.",
      npm: "View on npm",
      recommended: "Recommended",
      descriptions: {
        react: "ImposiaPageViewer component and hooks for React 18+.",
        core: "Framework-free pagination engine with diagnostics.",
        viewer: "Page viewer shell: single, spread, zoom, and navigation.",
        client: "Browser client that bundles pagination and viewer APIs.",
      },
    },
    cta: {
      title: "Your HTML is already a document.",
      subtitle: "Add one component and give it pages.",
      docs: "Read the docs",
      copy: "Copy install command",
      copied: "Copied",
    },
    footer: { docs: "Docs", changelog: "Changelog" },
  },
  ko: {
    metaTitle: "Imposia — HTML을 넣으면 페이지가 나옵니다",
    metaDescription:
      "HTML과 CSS를 실제 페이지로 만듭니다. 앱 안에서 미리 보고, 인쇄하거나 PDF로 저장하세요. 모두 브라우저에서 동작합니다.",
    nav: { docs: "문서", examples: "예제", api: "API", language: "언어" },
    hero: {
      badgeTag: "New",
      badge: "React를 위한 인쇄용 페이지",
      tagline:
        "HTML과 CSS를 실제 페이지로 만듭니다. 앱 안에서 미리 보고, 인쇄하거나 PDF로 저장하세요. 모두 브라우저에서 동작합니다.",
      getStarted: "시작하기",
      demo: "라이브 데모",
      viewerLabel: "두 페이지를 펼쳐 보여 주는 Imposia 페이지 뷰어 예시 그림",
      liveViewerLabel: "실시간 Imposia 페이지 뷰어: 브라우저에서 페이지로 나눈 예제 문서",
    },
    features: {
      eyebrow: "WHY IMPOSIA",
      title: "페이지를 만드는 데 필요한 모든 것",
      subtitle: "지금 쓰는 HTML과 CSS는 그대로 두세요. 페이지는 Imposia가 나눕니다.",
      items: [
        {
          title: "HTML로 만드는 실제 페이지",
          description:
            "기존 마크업을 여백, 머리글, 쪽 번호가 있는 정해진 크기의 페이지로 배치합니다.",
        },
        {
          title: "브라우저 인쇄와 PDF",
          description:
            "print()는 브라우저의 인쇄 창을 엽니다. 사용자는 종이로 인쇄하거나 PDF로 저장을 고릅니다.",
        },
        {
          title: "반쯤 만든 화면이 없음",
          description:
            "다음 페이지 묶음은 화면 밖에서 완성합니다. 레이아웃이 끝났을 때만 미리보기를 교체합니다.",
        },
        {
          title: "어디서나 같은 문서",
          description:
            "미리보기와 인쇄가 같은 확정 페이지를 읽으므로 페이지 수가 어긋나지 않습니다.",
        },
        {
          title: "React 우선, 프레임워크 무관",
          description:
            "<ImposiaPageViewer />를 넣거나, 어떤 프레임워크에서든 @imposia/core를 직접 사용하세요.",
        },
        {
          title: "통제된 리소스 로딩",
          description:
            "이미지, 폰트, 스타일시트는 모두 assetResolver를 거칩니다. 예상하지 못한 네트워크 요청이 없습니다.",
        },
      ],
    },
    how: {
      eyebrow: "HOW IT WORKS",
      title: "HTML을 넣으면 페이지가 나옵니다.",
      subtitle: "컴포넌트 하나, 세 단계. 화면과 종이에 같은 페이지가 나옵니다.",
      steps: [
        {
          title: "HTML 전달",
          description:
            "페이지 크기와 여백과 함께 HTML 문자열을 뷰어에 넘기세요. 작성한 CSS는 그대로 적용됩니다.",
        },
        {
          title: "Imposia가 페이지를 나눔",
          description:
            "페이지는 준비용 프레임에서 배치됩니다. 새 페이지가 준비될 때까지 마지막으로 완성된 페이지가 화면에 남습니다.",
        },
        {
          title: "미리보기, 인쇄, 저장",
          description:
            "사용자는 앱에서 페이지를 넘겨 보고, 같은 결과를 인쇄하거나 PDF로 저장합니다.",
        },
      ],
      codeLabel: "예제 소스 파일",
    },
    bench: {
      eyebrow: "BENCHMARKS",
      title: "주장이 아니라 측정값입니다.",
      subtitle:
        "같은 픽스처, 같은 브라우저에서 저장소의 벤치마크 스크립트로 기록했습니다. 모든 수치는 새로 클론한 저장소에서 다시 잴 수 있습니다.",
      stats: {
        edit: {
          label: "수정 → 페이지 갱신",
          description: "50페이지 보고서에서 단어 하나를 고친 뒤 새 페이지가 확정될 때까지",
        },
        large: {
          label: "200페이지",
          description: "200페이지 문서를 HTML에서 확정 페이지까지 나누는 시간",
        },
        print: {
          label: "print() → 인쇄 창",
          description: "print() 호출부터 브라우저에 인쇄 창을 요청할 때까지",
        },
        partial: {
          label: "미완성 프레임",
          unit: "프레임",
          description: "빠른 연속 업데이트 20회 동안 화면에 보인 미완성 페이지 묶음",
        },
      },
      medianOf: "중앙값, 측정 횟수",
      footnote:
        "측정 코드: scripts/benchmark-compare.ts, scripts/benchmark.ts · pnpm benchmark:compare",
      charts: {
        edit: "실시간 수정 지연 · 50페이지",
        paginate: "페이지 분할 · 200페이지",
        bundle: "번들 크기",
        lowerIsBetter: "낮을수록 좋음",
        bundleSubtitle: "전체 브라우저 번들, gzip, 낮을수록 좋음",
        failed: "실패",
        caveat:
          "Paged.js와 Vivliostyle은 증분 업데이트가 없어 수정할 때 처음부터 다시 렌더링합니다. 세 라이브러리 모두 같은 페이지 수를 냈습니다.",
      },
    },
    packages: {
      eyebrow: "PACKAGES",
      title: "React로 시작하고, 필요하면 더 낮은 계층으로.",
      npm: "npm에서 보기",
      recommended: "추천",
      descriptions: {
        react: "React 18 이상을 위한 ImposiaPageViewer 컴포넌트와 hooks.",
        core: "진단 정보를 제공하는 프레임워크 독립 페이지 분할 엔진.",
        viewer: "단일·펼침 보기, 확대·축소, 페이지 이동을 제공하는 뷰어.",
        client: "페이지 분할과 뷰어 API를 함께 제공하는 브라우저 클라이언트.",
      },
    },
    cta: {
      title: "당신의 HTML은 이미 문서입니다.",
      subtitle: "컴포넌트 하나로 페이지를 입히세요.",
      docs: "문서 읽기",
      copy: "설치 명령 복사",
      copied: "복사됨",
    },
    footer: { docs: "문서", changelog: "변경 내역" },
  },
  ja: {
    metaTitle: "Imposia — HTML を入れれば、ページが出る",
    metaDescription:
      "HTML と CSS を本物のページにします。アプリ内でプレビューし、印刷または PDF として保存。すべてブラウザーで動きます。",
    nav: { docs: "ドキュメント", examples: "サンプル", api: "API", language: "言語" },
    hero: {
      badgeTag: "New",
      badge: "React のための印刷可能なページ",
      tagline:
        "HTML と CSS を本物のページにします。アプリ内でプレビューし、印刷または PDF として保存。すべてブラウザーで動きます。",
      getStarted: "はじめる",
      demo: "ライブデモ",
      viewerLabel: "見開き 2 ページを表示する Imposia ページビューアーのイメージ",
      liveViewerLabel: "動作中の Imposia ページビューアー: ブラウザーでページ分割したサンプル文書",
    },
    features: {
      eyebrow: "WHY IMPOSIA",
      title: "ページを届けるために必要なものすべて",
      subtitle: "今ある HTML と CSS はそのまま。ページは Imposia が組みます。",
      items: [
        {
          title: "HTML から本物のページ",
          description:
            "既存のマークアップを、余白・柱・ノンブル付きの決まったサイズのページに組版します。",
        },
        {
          title: "ブラウザー印刷と PDF",
          description:
            "print() はブラウザーの印刷ダイアログを開きます。読者は紙に印刷するか、PDF として保存を選べます。",
        },
        {
          title: "作りかけの画面を見せない",
          description:
            "次のページセットは画面外で完成させます。レイアウトが終わったときだけプレビューを切り替えます。",
        },
        {
          title: "どこでも同じドキュメント",
          description: "プレビューと印刷が同じ確定ページを読むので、ページ数がずれません。",
        },
        {
          title: "React ファースト、フレームワーク非依存",
          description:
            "<ImposiaPageViewer /> を置くだけ。どのフレームワークからでも @imposia/core を直接使えます。",
        },
        {
          title: "制御されたリソース読み込み",
          description:
            "画像・フォント・スタイルシートはすべて assetResolver を通ります。想定外のネットワーク要求はありません。",
        },
      ],
    },
    how: {
      eyebrow: "HOW IT WORKS",
      title: "HTML を入れれば、ページが出る。",
      subtitle: "コンポーネント 1 つ、3 ステップ。画面にも紙にも同じページ。",
      steps: [
        {
          title: "HTML を渡す",
          description:
            "ページサイズと余白を添えて、HTML 文字列をビューアーに渡します。CSS はそのまま適用されます。",
        },
        {
          title: "Imposia がページ分割",
          description:
            "ページは準備用フレームで組まれます。新しいセットが整うまで、最後に完成したページが画面に残ります。",
        },
        {
          title: "プレビュー、印刷、保存",
          description:
            "読者はアプリ内でページをめくり、同じ結果を印刷または PDF として保存します。",
        },
      ],
      codeLabel: "サンプルのソースファイル",
    },
    bench: {
      eyebrow: "BENCHMARKS",
      title: "主張ではなく、計測値。",
      subtitle:
        "同じフィクスチャー、同じブラウザーで、リポジトリのベンチマークスクリプトが記録しました。どの数値もクローンし直して再計測できます。",
      stats: {
        edit: {
          label: "編集 → ページ更新",
          description: "50 ページのレポートで単語を 1 つ変えてから新しいページが確定するまで",
        },
        large: {
          label: "200 ページ",
          description: "200 ページの文書を HTML から確定ページまで分割する時間",
        },
        print: {
          label: "print() → ダイアログ",
          description: "print() の呼び出しから、ブラウザーに印刷ダイアログを要求するまで",
        },
        partial: {
          label: "未完成フレーム",
          unit: "フレーム",
          description: "20 回の連続更新中に画面に出た未完成のページセット",
        },
      },
      medianOf: "中央値・計測回数",
      footnote:
        "計測コード: scripts/benchmark-compare.ts, scripts/benchmark.ts · pnpm benchmark:compare",
      charts: {
        edit: "ライブ編集の遅延 · 50 ページ",
        paginate: "ページ分割 · 200 ページ",
        bundle: "バンドルサイズ",
        lowerIsBetter: "低いほど良い",
        bundleSubtitle: "ブラウザー用バンドル全体、gzip、低いほど良い",
        failed: "失敗",
        caveat:
          "Paged.js と Vivliostyle には差分更新がないため、編集のたびに最初から描画し直します。3 つとも同じページ数になりました。",
      },
    },
    packages: {
      eyebrow: "PACKAGES",
      title: "React から始めて、必要なら下のレイヤーへ。",
      npm: "npm で見る",
      recommended: "おすすめ",
      descriptions: {
        react: "React 18 以降向けの ImposiaPageViewer コンポーネントと hooks。",
        core: "診断情報付きのフレームワーク非依存ページ分割エンジン。",
        viewer: "単ページ・見開き表示、ズーム、ページ移動を備えたビューアー。",
        client: "ページ分割とビューアーの API をまとめたブラウザークライアント。",
      },
    },
    cta: {
      title: "あなたの HTML は、もうドキュメントです。",
      subtitle: "コンポーネントを 1 つ足して、ページにしましょう。",
      docs: "ドキュメントを読む",
      copy: "インストールコマンドをコピー",
      copied: "コピーしました",
    },
    footer: { docs: "ドキュメント", changelog: "変更履歴" },
  },
  "zh-CN": {
    metaTitle: "Imposia — 输入 HTML，输出页面",
    metaDescription:
      "把 HTML 和 CSS 变成真正的页面。在应用内预览，然后打印或保存为 PDF——全部在浏览器中完成。",
    nav: { docs: "文档", examples: "示例", api: "API", language: "语言" },
    hero: {
      badgeTag: "New",
      badge: "为 React 准备的可打印页面",
      tagline:
        "把 HTML 和 CSS 变成真正的页面。在应用内预览，然后打印或保存为 PDF——全部在浏览器中完成。",
      getStarted: "开始使用",
      demo: "在线演示",
      viewerLabel: "Imposia 页面查看器展示双页跨页的示意图",
      liveViewerLabel: "实时运行的 Imposia 页面查看器：在你的浏览器中分页的示例文档",
    },
    features: {
      eyebrow: "WHY IMPOSIA",
      title: "交付页面所需的一切",
      subtitle: "保留你已有的 HTML 和 CSS，分页交给 Imposia。",
      items: [
        {
          title: "由 HTML 生成真实页面",
          description: "把现有标记排成带页边距、页眉和页码的固定尺寸页面。",
        },
        {
          title: "原生打印与 PDF",
          description: "print() 会打开浏览器的打印对话框。读者可以打印到纸上，或选择另存为 PDF。",
        },
        {
          title: "不显示半成品画面",
          description: "下一组页面在屏幕外完成。只有排版完成时，预览才会切换。",
        },
        {
          title: "处处同一份文档",
          description: "预览和打印读取同一组已提交页面，页数不会出现偏差。",
        },
        {
          title: "React 优先，不绑定框架",
          description: "放入 <ImposiaPageViewer />，或在任意框架中直接使用 @imposia/core。",
        },
        {
          title: "受控的资源加载",
          description: "图片、字体和样式表都经过你的 assetResolver，不会出现意外的网络请求。",
        },
      ],
    },
    how: {
      eyebrow: "HOW IT WORKS",
      title: "输入 HTML，输出页面。",
      subtitle: "一个组件，三个步骤，屏幕上和纸上是同样的页面。",
      steps: [
        {
          title: "传入 HTML",
          description: "把 HTML 字符串连同页面尺寸和页边距交给查看器，你的 CSS 依然生效。",
        },
        {
          title: "Imposia 分页",
          description: "页面在暂存框架中排版。新的一组准备好之前，上一组完成的页面会一直显示。",
        },
        {
          title: "预览、打印、保存",
          description: "读者在应用中翻阅页面，然后从同一结果打印或保存为 PDF。",
        },
      ],
      codeLabel: "示例源文件",
    },
    bench: {
      eyebrow: "BENCHMARKS",
      title: "实测，而非宣称。",
      subtitle:
        "相同的测试样例、相同的浏览器，由仓库中的基准脚本记录。每个数字都能从全新克隆的仓库重新测得。",
      stats: {
        edit: {
          label: "编辑 → 页面更新",
          description: "在 50 页报告中修改一个词，直到新页面提交",
        },
        large: {
          label: "200 页",
          description: "把 200 页文档从 HTML 分页到已提交页面的时间",
        },
        print: {
          label: "print() → 对话框",
          description: "从调用 print() 到向浏览器请求打印对话框",
        },
        partial: {
          label: "不完整帧",
          unit: "帧",
          description: "连续快速更新 20 次期间屏幕上出现的不完整页面组",
        },
      },
      medianOf: "中位数，运行次数",
      footnote:
        "测量代码：scripts/benchmark-compare.ts、scripts/benchmark.ts · pnpm benchmark:compare",
      charts: {
        edit: "实时编辑延迟 · 50 页",
        paginate: "分页 · 200 页",
        bundle: "包体积",
        lowerIsBetter: "越低越好",
        bundleSubtitle: "完整浏览器包，gzip，越低越好",
        failed: "失败",
        caveat: "Paged.js 和 Vivliostyle 没有增量更新，编辑时会从头重新渲染。三者得到的页数相同。",
      },
    },
    packages: {
      eyebrow: "PACKAGES",
      title: "从 React 开始，需要时再深入底层。",
      npm: "在 npm 查看",
      recommended: "推荐",
      descriptions: {
        react: "适用于 React 18+ 的 ImposiaPageViewer 组件和 hooks。",
        core: "不依赖框架、带诊断信息的分页引擎。",
        viewer: "页面查看器：单页、跨页、缩放与翻页导航。",
        client: "打包了分页与查看器 API 的浏览器客户端。",
      },
    },
    cta: {
      title: "你的 HTML 本来就是一份文档。",
      subtitle: "加一个组件，给它页面。",
      docs: "阅读文档",
      copy: "复制安装命令",
      copied: "已复制",
    },
    footer: { docs: "文档", changelog: "更新日志" },
  },
};
