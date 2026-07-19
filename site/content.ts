export const LOCALES = ["en", "ko", "zh-CN", "ja"] as const;

export type Locale = (typeof LOCALES)[number];

export interface MetaCopy {
  readonly title: string;
  readonly description: string;
  readonly socialTitle: string;
  readonly socialDescription: string;
  readonly openGraphLocale: string;
}

export interface SectionHeadingCopy {
  readonly index: string;
  readonly title: string;
  readonly description: string;
}

interface InvariantCopy {
  readonly title: string;
  readonly detail: string;
}

interface DiagramPointCopy {
  readonly title: string;
  readonly detail: string;
}

interface WorkflowStepCopy {
  readonly number: string;
  readonly title: string;
  readonly description: string;
}

interface MetricCopy {
  readonly term: string;
  readonly value: string;
}

interface CompatibilityRowCopy {
  readonly capability: string;
  readonly contract: string;
  readonly status: string;
}

interface PackageCopy {
  readonly name: string;
  readonly title: string;
  readonly description: string;
}

export interface MarketingCopy {
  readonly meta: MetaCopy;
  readonly skipLink: string;
  readonly languageLabel: string;
  readonly languageNames: Readonly<Record<Locale, string>>;
  readonly primaryNavigationLabel: string;
  readonly footerNavigationLabel: string;
  readonly brandNote: string;
  readonly nav: {
    readonly why: string;
    readonly how: string;
    readonly compatibility: string;
    readonly packages: string;
    readonly quickStart: string;
  };
  readonly hero: {
    readonly eyebrow: string;
    readonly titleStart: string;
    readonly titleEmphasis: string;
    readonly lede: string;
    readonly demoCta: string;
    readonly contractCta: string;
    readonly proofLabel: string;
    readonly sheetKind: string;
    readonly sheetFormat: string;
    readonly sheetTitle: string;
    readonly sheetSource: string;
    readonly sheetGeneration: string;
    readonly commitMark: string;
  };
  readonly invariantsLabel: string;
  readonly invariants: readonly InvariantCopy[];
  readonly why: {
    readonly heading: SectionHeadingCopy;
    readonly body: string;
    readonly diagramLabel: string;
    readonly source: DiagramPointCopy;
    readonly staged: DiagramPointCopy;
    readonly committed: DiagramPointCopy;
  };
  readonly how: {
    readonly heading: SectionHeadingCopy;
    readonly body: string;
    readonly workflowLabel: string;
    readonly steps: readonly WorkflowStepCopy[];
    readonly lab: {
      readonly label: string;
      readonly header: string;
      readonly status: string;
      readonly title: string;
      readonly description: string;
      readonly cta: string;
      readonly metrics: readonly MetricCopy[];
    };
  };
  readonly compatibility: {
    readonly heading: SectionHeadingCopy;
    readonly tableCaption: string;
    readonly capabilityHeader: string;
    readonly contractHeader: string;
    readonly statusHeader: string;
    readonly rows: readonly CompatibilityRowCopy[];
  };
  readonly packages: {
    readonly heading: SectionHeadingCopy;
    readonly items: readonly PackageCopy[];
  };
  readonly quickStart: {
    readonly heading: SectionHeadingCopy;
    readonly title: string;
    readonly description: string;
    readonly tabListLabel: string;
    readonly reactTab: string;
    readonly coreTab: string;
    readonly copyInstall: string;
    readonly copied: string;
    readonly copyFailed: string;
    readonly sampleText: string;
  };
  readonly closing: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly cta: string;
  };
  readonly footer: {
    readonly tagline: string;
    readonly demo: string;
    readonly readme: string;
    readonly compatibility: string;
    readonly license: string;
    readonly metaTitle: string;
    readonly metaBody: string;
    readonly contributors: string;
  };
}

export const CONTENT: Readonly<Record<Locale, MarketingCopy>> = {
  en: {
    meta: {
      title: "Imposia — HTML in. Pages out.",
      description:
        "Imposia turns HTML and CSS into committed, inspectable page documents in one canonical browser iframe.",
      socialTitle: "Imposia — pages that keep their promise",
      socialDescription:
        "A React-first, browser-only publishing toolkit for paginated HTML/CSS, native print, and reflowable EPUB.",
      openGraphLocale: "en_US",
    },
    skipLink: "Skip to content",
    languageLabel: "Language",
    languageNames: {
      en: "English",
      ko: "Korean",
      "zh-CN": "Simplified Chinese",
      ja: "Japanese",
    },
    primaryNavigationLabel: "Primary navigation",
    footerNavigationLabel: "Footer navigation",
    brandNote: "Browser publishing",
    nav: {
      why: "Why",
      how: "How it works",
      compatibility: "Compatibility",
      packages: "Packages",
      quickStart: "Quick start",
    },
    hero: {
      eyebrow: "React-first / browser-only",
      titleStart: "HTML in. ",
      titleEmphasis: "Pages out.",
      lede: "Turn HTML and CSS into a paginated, inspectable browser document. One committed page document persists through preview and native print; EPUB export is a reflowable projection from the latest committed semantic source.",
      demoCta: "Explore the demo",
      contractCta: "View compatibility",
      proofLabel: "HTML source becoming one committed page document",
      sheetKind: "Semantic source",
      sheetFormat: "A4 / 20 mm",
      sheetTitle: "One document. Every surface.",
      sheetSource: "Sanitized HTML + CSS",
      sheetGeneration: "Generation 24",
      commitMark: "Committed generation",
    },
    invariantsLabel: "Imposia product invariants",
    invariants: [
      { title: "Browser ESM", detail: "No second rendering runtime" },
      { title: "One canonical iframe", detail: "Presentation and native print" },
      { title: "Typed warnings", detail: "Constraints stay visible" },
      { title: "Reflowable EPUB 3.3", detail: "From retained semantic source" },
    ],
    why: {
      heading: {
        index: "01 / Why Imposia",
        title: "One document. No drift.",
        description:
          "Publishing breaks when editor, preview, and print each invent a different document.",
      },
      body: "Imposia keeps the latest successful committed generation at the center. While a revision paginates in a temporary staged generation, the prior commit remains visible and authoritative. A failure, abort, or newer revision never leaks a half-finished result into presentation.",
      diagramLabel: "Source revision moving from staging to the committed document",
      source: { title: "Source revision", detail: "Sanitized HTML and CSS" },
      staged: { title: "Staged generation", detail: "Temporary and noncanonical" },
      committed: { title: "Committed generation", detail: "One canonical iframe" },
    },
    how: {
      heading: {
        index: "02 / How it works",
        title: "Stage. Commit. Keep one authority.",
        description:
          "Core separates source preparation from presentation without creating a second page document.",
      },
      body: "Core sanitizes source, resolves admitted assets through the host boundary, normalizes page media, and paginates in the browser. React and Viewer retain the same controller and canonical iframe instead of cloning pages or rerunning layout.",
      workflowLabel: "Three-stage publishing workflow",
      steps: [
        {
          number: "01",
          title: "Prepare in staging",
          description:
            "A temporary staged generation resolves assets and paginates while the committed generation stays visible.",
        },
        {
          number: "02",
          title: "Commit atomically",
          description:
            "Only complete success replaces the canonical iframe. Failure and supersession preserve the prior commit.",
        },
        {
          number: "03",
          title: "Present without cloning",
          description:
            "Viewer modes and native print use that iframe; EPUB projects the latest committed semantic source.",
        },
      ],
      lab: {
        label: "Interactive publishing lab",
        header: "Imposia publishing lab",
        status: "Live example",
        title: "Test the real browser pipeline.",
        description:
          "Edit source, inspect normalized page media and warnings, switch Viewer modes, invoke native print, and export a reflowable EPUB from the working demo.",
        cta: "Open the publishing lab",
        metrics: [
          { term: "Runtime", value: "Browser ESM" },
          { term: "Page authority", value: "Canonical iframe" },
          { term: "Publishing", value: "Print + EPUB 3.3" },
        ],
      },
    },
    compatibility: {
      heading: {
        index: "03 / Compatibility",
        title: "A contract, not a resemblance.",
        description:
          "Supported behavior is named precisely; constrained and experimental cases stay explicit.",
      },
      tableCaption: "Browser publishing compatibility ledger",
      capabilityHeader: "Capability",
      contractHeader: "Public boundary",
      statusHeader: "Status",
      rows: [
        {
          capability: "Browser lifecycle",
          contract:
            "Core, React, and Viewer retain one controller and one canonical iframe through presentation and native print.",
          status: "Stable",
        },
        {
          capability: "Page media",
          contract:
            "A4, Letter, custom absolute geometry, supported @page selectors, and six margin boxes.",
          status: "Stable",
        },
        {
          capability: "Complex fragmentation",
          contract:
            "Declared table, flex, grid, and multi-column subsets emit typed recovery warnings outside their bounds.",
          status: "Constrained",
        },
        {
          capability: "Footnotes and page floats",
          contract: "Opt-in page-local behavior with typed defer and fallback warnings.",
          status: "Experimental",
        },
        {
          capability: "Server and byte renderers",
          contract:
            "Node/CLI rendering, server export, fixed-layout EPUB, and PDF-byte output are not provided.",
          status: "Unsupported",
        },
      ],
    },
    packages: {
      heading: {
        index: "04 / Packages",
        title: "Choose an integration layer.",
        description:
          "Four browser ESM packages expose one publishing system without changing document ownership.",
      },
      items: [
        {
          name: "@imposia/react",
          title: "React adapter",
          description:
            "Components, hooks, and an imperative handle for React applications. The primary integration surface.",
        },
        {
          name: "@imposia/core",
          title: "Page-document runtime",
          description:
            "Framework-neutral lifecycle, pagination, resolver, extension, print, and EPUB control.",
        },
        {
          name: "@imposia/client",
          title: "Unified client",
          description: "Core and Viewer APIs from one framework-neutral, browser-only dependency.",
        },
        {
          name: "@imposia/viewer",
          title: "Presentation shell",
          description:
            "Continuous, single, and spread presentation for the Core iframe, plus an independent PDF.js viewer.",
        },
      ],
    },
    quickStart: {
      heading: {
        index: "05 / Quick start",
        title: "Start at your layer.",
        description:
          "Use the React adapter for application UI or mount Core directly in any browser ESM project.",
      },
      title: "Install one browser package.",
      description:
        "Both paths create the same Core-owned page document. Pick the API that fits your application, not a different renderer.",
      tabListLabel: "Quick-start package",
      reactTab: "React",
      coreTab: "Core",
      copyInstall: "Copy install command",
      copied: "Install command copied",
      copyFailed: "Copy failed",
      sampleText: "Browser-native pages.",
    },
    closing: {
      eyebrow: "One document / all the way through",
      title: "Write for the web. Arrive on the page.",
      description:
        "Build inspectable browser publishing around a committed document, explicit compatibility, and no hidden rendering authority.",
      cta: "Explore the demo",
    },
    footer: {
      tagline: "Browser-native publishing with one committed page document.",
      demo: "Demo",
      readme: "Documentation",
      compatibility: "Compatibility",
      license: "Apache-2.0 license",
      metaTitle: "Browser-only by contract",
      metaBody:
        "React-first. Core works without React. Native print and reflowable EPUB publishing.",
      contributors: "Imposia contributors",
    },
  },
  ko: {
    meta: {
      title: "Imposia — HTML을 넣으면, 페이지가 됩니다.",
      description:
        "Imposia는 HTML과 CSS를 하나의 표준 브라우저 iframe 안에서 커밋되고 검사 가능한 페이지 문서로 만듭니다.",
      socialTitle: "Imposia — 약속을 지키는 페이지",
      socialDescription:
        "페이지가 매겨진 HTML/CSS, 네이티브 인쇄, 리플로우형 EPUB을 위한 React 우선·브라우저 전용 퍼블리싱 툴킷.",
      openGraphLocale: "ko_KR",
    },
    skipLink: "본문으로 건너뛰기",
    languageLabel: "언어",
    languageNames: {
      en: "영어",
      ko: "한국어",
      "zh-CN": "중국어(간체)",
      ja: "일본어",
    },
    primaryNavigationLabel: "주요 탐색",
    footerNavigationLabel: "바닥글 탐색",
    brandNote: "브라우저 퍼블리싱",
    nav: {
      why: "선택하는 이유",
      how: "작동 방식",
      compatibility: "호환성",
      packages: "패키지",
      quickStart: "빠른 시작",
    },
    hero: {
      eyebrow: "React 우선 / 브라우저 전용",
      titleStart: "HTML을 넣으면, ",
      titleEmphasis: "페이지가 됩니다.",
      lede: "HTML과 CSS를 페이지가 매겨지고 검사 가능한 브라우저 문서로 바꾸세요. 하나의 커밋된 페이지 문서는 미리보기와 네이티브 인쇄까지 유지되며, EPUB 내보내기는 최신 커밋 시맨틱 소스에서 만든 리플로우형 투영입니다.",
      demoCta: "데모 살펴보기",
      contractCta: "호환성 확인",
      proofLabel: "HTML 소스가 하나의 커밋된 페이지 문서가 되는 과정",
      sheetKind: "시맨틱 소스",
      sheetFormat: "A4 / 20 mm",
      sheetTitle: "모든 화면에 하나의 문서.",
      sheetSource: "정제된 HTML + CSS",
      sheetGeneration: "24번 세대",
      commitMark: "커밋된 세대",
    },
    invariantsLabel: "Imposia 제품 불변 조건",
    invariants: [
      { title: "브라우저 ESM", detail: "두 번째 렌더링 런타임 없음" },
      { title: "하나의 표준 iframe", detail: "표시와 네이티브 인쇄" },
      { title: "타입이 있는 경고", detail: "제약을 숨기지 않음" },
      { title: "리플로우형 EPUB 3.3", detail: "보존된 시맨틱 소스 기반" },
    ],
    why: {
      heading: {
        index: "01 / Imposia를 선택하는 이유",
        title: "문서는 하나. 어긋남은 없습니다.",
        description: "편집기, 미리보기, 인쇄가 각자 다른 문서를 만들면 퍼블리싱 결과가 흔들립니다.",
      },
      body: "Imposia는 가장 최근에 성공한 커밋된 세대를 워크플로우 중심에 둡니다. 변경본이 임시 스테이징 세대에서 페이지네이션되는 동안 이전 커밋은 계속 보이며 권한을 유지합니다. 실패, 중단, 더 새로운 변경은 미완성 결과를 표시에 섞지 않습니다.",
      diagramLabel: "소스 변경이 스테이징을 거쳐 커밋된 문서로 이동하는 과정",
      source: { title: "소스 변경", detail: "정제된 HTML과 CSS" },
      staged: { title: "스테이징 세대", detail: "임시·비표준 상태" },
      committed: { title: "커밋된 세대", detail: "하나의 표준 iframe" },
    },
    how: {
      heading: {
        index: "02 / 작동 방식",
        title: "스테이징하고, 커밋하고, 권한은 하나로.",
        description: "Core는 두 번째 페이지 문서를 만들지 않고 소스 준비와 표시를 분리합니다.",
      },
      body: "Core는 소스를 정제하고, 허용된 에셋을 호스트 경계에서 해석하고, 페이지 미디어를 정규화한 뒤 브라우저에서 페이지를 나눕니다. React와 Viewer는 페이지를 복제하거나 레이아웃을 다시 실행하지 않고 같은 컨트롤러와 표준 iframe을 유지합니다.",
      workflowLabel: "3단계 퍼블리싱 워크플로우",
      steps: [
        {
          number: "01",
          title: "스테이징에서 준비",
          description:
            "임시 스테이징 세대가 에셋을 해석하고 페이지를 나누는 동안 커밋된 세대는 계속 표시됩니다.",
        },
        {
          number: "02",
          title: "원자적으로 커밋",
          description:
            "완전히 성공한 결과만 표준 iframe을 교체합니다. 실패하거나 대체된 작업은 이전 커밋을 보존합니다.",
        },
        {
          number: "03",
          title: "복제 없이 표시",
          description:
            "Viewer 모드와 네이티브 인쇄는 그 iframe을 사용하고, EPUB은 최신 커밋 시맨틱 소스를 투영합니다.",
        },
      ],
      lab: {
        label: "인터랙티브 퍼블리싱 실험실",
        header: "Imposia 퍼블리싱 실험실",
        status: "실행 가능한 예제",
        title: "실제 브라우저 파이프라인을 시험하세요.",
        description:
          "작동하는 데모에서 소스를 편집하고, 정규화된 페이지 미디어와 경고를 확인하고, Viewer 모드를 바꾸고, 네이티브 인쇄와 리플로우형 EPUB 내보내기를 실행할 수 있습니다.",
        cta: "퍼블리싱 실험실 열기",
        metrics: [
          { term: "런타임", value: "브라우저 ESM" },
          { term: "페이지 권한", value: "표준 iframe" },
          { term: "퍼블리싱", value: "인쇄 + EPUB 3.3" },
        ],
      },
    },
    compatibility: {
      heading: {
        index: "03 / 호환성",
        title: "비슷한 출력이 아닌, 명확한 계약.",
        description: "지원 동작은 정확히 이름 붙이고, 제약·실험 기능은 분명하게 드러냅니다.",
      },
      tableCaption: "브라우저 퍼블리싱 호환성 원장",
      capabilityHeader: "기능",
      contractHeader: "공개 경계",
      statusHeader: "상태",
      rows: [
        {
          capability: "브라우저 생명주기",
          contract:
            "Core, React, Viewer는 표시와 네이티브 인쇄까지 하나의 컨트롤러와 표준 iframe을 유지합니다.",
          status: "안정",
        },
        {
          capability: "페이지 미디어",
          contract:
            "A4, Letter, 사용자 지정 절대 크기, 지원되는 @page 선택자, 여섯 개의 마진 박스를 제공합니다.",
          status: "안정",
        },
        {
          capability: "복합 프래그먼테이션",
          contract:
            "표, flex, grid, 다단의 명시된 제약 하위 집합을 지원하며, 입력이 경계를 벗어나면 타입이 있는 복구 경고를 반환합니다.",
          status: "제약 있음",
        },
        {
          capability: "각주와 페이지 플로트",
          contract: "옵트인 페이지 로컬 동작이며 타입이 있는 지연·대체 경고를 제공합니다.",
          status: "실험적",
        },
        {
          capability: "서버 및 바이트 렌더러",
          contract:
            "Node/CLI 렌더링, 서버 내보내기, 고정 레이아웃 EPUB, PDF 바이트 출력은 제공하지 않습니다.",
          status: "미지원",
        },
      ],
    },
    packages: {
      heading: {
        index: "04 / 패키지",
        title: "통합 계층을 선택하세요.",
        description:
          "네 개의 브라우저 ESM 패키지가 문서 소유권을 바꾸지 않고 하나의 퍼블리싱 시스템을 제공합니다.",
      },
      items: [
        {
          name: "@imposia/react",
          title: "React 어댑터",
          description: "React 앱을 위한 컴포넌트, 훅, 명령형 핸들입니다. 주 통합 화면입니다.",
        },
        {
          name: "@imposia/core",
          title: "페이지 문서 런타임",
          description:
            "프레임워크 중립 생명주기, 페이지네이션, resolver, extension, 인쇄, EPUB 제어를 제공합니다.",
        },
        {
          name: "@imposia/client",
          title: "통합 클라이언트",
          description:
            "하나의 프레임워크 중립·브라우저 전용 의존성에서 Core와 Viewer API를 제공합니다.",
        },
        {
          name: "@imposia/viewer",
          title: "표시 셸",
          description:
            "Core iframe을 연속·한 페이지·양면 모드로 표시하고 독립 PDF.js 뷰어도 제공합니다.",
        },
      ],
    },
    quickStart: {
      heading: {
        index: "05 / 빠른 시작",
        title: "앱에 맞는 계층에서 시작하세요.",
        description:
          "애플리케이션 UI에는 React 어댑터를, 모든 브라우저 ESM 프로젝트에는 Core를 직접 사용할 수 있습니다.",
      },
      title: "브라우저 패키지 하나를 설치하세요.",
      description:
        "두 경로 모두 Core가 소유하는 같은 페이지 문서를 만듭니다. 다른 렌더러가 아니라 앱에 맞는 API를 선택하세요.",
      tabListLabel: "빠른 시작 패키지",
      reactTab: "React",
      coreTab: "Core",
      copyInstall: "설치 명령 복사",
      copied: "설치 명령을 복사했습니다",
      copyFailed: "복사하지 못했습니다",
      sampleText: "브라우저 네이티브 페이지.",
    },
    closing: {
      eyebrow: "처음부터 끝까지 / 하나의 문서",
      title: "웹을 위해 쓰고, 페이지에 닿으세요.",
      description:
        "커밋된 문서, 명시적인 호환성, 숨은 렌더링 권한이 없는 브라우저 퍼블리싱을 구축하세요.",
      cta: "데모 살펴보기",
    },
    footer: {
      tagline: "하나의 커밋된 페이지 문서를 사용하는 브라우저 네이티브 퍼블리싱.",
      demo: "데모",
      readme: "문서",
      compatibility: "호환성",
      license: "Apache-2.0 라이선스",
      metaTitle: "계약에 따른 브라우저 전용",
      metaBody: "React 우선. Core는 React 없이 동작. 네이티브 인쇄와 리플로우형 EPUB 퍼블리싱.",
      contributors: "Imposia 기여자",
    },
  },
  "zh-CN": {
    meta: {
      title: "Imposia — 输入 HTML，输出页面。",
      description:
        "Imposia 在一个规范浏览器 iframe 中，将 HTML 与 CSS 转换为已提交、可检查的页面文档。",
      socialTitle: "Imposia — 始终兑现承诺的页面",
      socialDescription:
        "面向分页 HTML/CSS、原生打印与可重排 EPUB 的 React 优先、仅浏览器出版工具包。",
      openGraphLocale: "zh_CN",
    },
    skipLink: "跳到正文",
    languageLabel: "语言",
    languageNames: {
      en: "英语",
      ko: "韩语",
      "zh-CN": "简体中文",
      ja: "日语",
    },
    primaryNavigationLabel: "主导航",
    footerNavigationLabel: "页脚导航",
    brandNote: "浏览器出版",
    nav: {
      why: "为什么选择",
      how: "工作原理",
      compatibility: "兼容性",
      packages: "软件包",
      quickStart: "快速开始",
    },
    hero: {
      eyebrow: "React 优先 / 仅浏览器",
      titleStart: "输入 HTML，",
      titleEmphasis: "输出页面。",
      lede: "将 HTML 与 CSS 转换为带分页、可检查的浏览器文档。一份已提交页面文档贯穿预览与原生打印；EPUB 导出则是从最近提交的语义源生成的可重排投射。",
      demoCta: "查看演示",
      contractCta: "查看兼容性",
      proofLabel: "HTML 源内容转换为一份已提交页面文档",
      sheetKind: "语义源",
      sheetFormat: "A4 / 20 mm",
      sheetTitle: "一份文档，贯穿所有界面。",
      sheetSource: "已清理的 HTML + CSS",
      sheetGeneration: "第 24 代",
      commitMark: "已提交版本",
    },
    invariantsLabel: "Imposia 产品不变量",
    invariants: [
      { title: "浏览器 ESM", detail: "没有第二套渲染运行时" },
      { title: "一个规范 iframe", detail: "展示与原生打印" },
      { title: "类型化警告", detail: "不隐藏能力边界" },
      { title: "可重排 EPUB 3.3", detail: "来自保留的语义源" },
    ],
    why: {
      heading: {
        index: "01 / 为什么选择 Imposia",
        title: "一份文档，不再漂移。",
        description: "如果编辑器、预览和打印各自创建文档，出版结果就会发生偏差。",
      },
      body: "Imposia 始终以最近一次成功的已提交版本为中心。修订内容在临时暂存版本中分页时，上一次提交仍然可见并保持权威。失败、中止或更新的修订不会把半成品混入展示界面。",
      diagramLabel: "源修订从暂存状态进入已提交文档的过程",
      source: { title: "源修订", detail: "已清理的 HTML 与 CSS" },
      staged: { title: "暂存版本", detail: "临时且非规范" },
      committed: { title: "已提交版本", detail: "一个规范 iframe" },
    },
    how: {
      heading: {
        index: "02 / 工作原理",
        title: "暂存、提交，并保持唯一权威。",
        description: "Core 将源准备与展示分离，但不会创建第二份页面文档。",
      },
      body: "Core 清理源内容，通过宿主边界解析允许的资源，标准化页面媒体，并在浏览器中完成分页。React 与 Viewer 保留同一个控制器和规范 iframe，不复制页面，也不重新执行布局。",
      workflowLabel: "三阶段出版工作流",
      steps: [
        {
          number: "01",
          title: "在暂存环境中准备",
          description: "临时暂存版本解析资源并分页，同时已提交版本始终保持可见。",
        },
        {
          number: "02",
          title: "原子提交",
          description:
            "只有完全成功的结果才能替换规范 iframe；失败或被取代的任务会保留上一次提交。",
        },
        {
          number: "03",
          title: "不复制，直接展示",
          description: "Viewer 模式与原生打印使用该 iframe；EPUB 则投射最近提交的语义源。",
        },
      ],
      lab: {
        label: "交互式出版实验室",
        header: "Imposia 出版实验室",
        status: "可运行示例",
        title: "亲手测试真实的浏览器管线。",
        description:
          "在可运行的演示中编辑源内容、检查标准化页面媒体和警告、切换 Viewer 模式、调用原生打印，并导出可重排 EPUB。",
        cta: "打开出版实验室",
        metrics: [
          { term: "运行时", value: "浏览器 ESM" },
          { term: "页面权威", value: "规范 iframe" },
          { term: "出版", value: "打印 + EPUB 3.3" },
        ],
      },
    },
    compatibility: {
      heading: {
        index: "03 / 兼容性",
        title: "明确契约，而非貌似相同。",
        description: "精确定义支持行为，并明确标示受限与实验性能力。",
      },
      tableCaption: "浏览器出版兼容性清单",
      capabilityHeader: "能力",
      contractHeader: "公开边界",
      statusHeader: "状态",
      rows: [
        {
          capability: "浏览器生命周期",
          contract: "Core、React 与 Viewer 在展示和原生打印期间保留同一个控制器和规范 iframe。",
          status: "稳定",
        },
        {
          capability: "页面媒体",
          contract: "支持 A4、Letter、自定义绝对尺寸、指定的 @page 选择器以及六个页边距框。",
          status: "稳定",
        },
        {
          capability: "复杂分片",
          contract:
            "支持明确受限的表格、flex、grid 与多栏子集；输入超出边界时会返回类型化恢复警告。",
          status: "受限",
        },
        {
          capability: "脚注与页浮动",
          contract: "需要显式启用的页内行为，并提供类型化延迟与回退警告。",
          status: "实验性",
        },
        {
          capability: "服务端与字节渲染器",
          contract: "不提供 Node/CLI 渲染、服务端导出、固定版式 EPUB 或 PDF 字节输出。",
          status: "不支持",
        },
      ],
    },
    packages: {
      heading: {
        index: "04 / 软件包",
        title: "选择适合的集成层。",
        description: "四个浏览器 ESM 软件包公开同一套出版系统，不会改变文档所有权。",
      },
      items: [
        {
          name: "@imposia/react",
          title: "React 适配器",
          description: "为 React 应用提供组件、Hook 与命令式句柄，是主要集成界面。",
        },
        {
          name: "@imposia/core",
          title: "页面文档运行时",
          description: "提供框架无关的生命周期、分页、resolver、extension、打印与 EPUB 控制。",
        },
        {
          name: "@imposia/client",
          title: "统一客户端",
          description: "通过一个框架无关、仅浏览器依赖同时提供 Core 与 Viewer API。",
        },
        {
          name: "@imposia/viewer",
          title: "展示外壳",
          description: "以连续、单页或跨页模式展示 Core iframe，并提供独立的 PDF.js 查看器。",
        },
      ],
    },
    quickStart: {
      heading: {
        index: "05 / 快速开始",
        title: "从适合应用的层开始。",
        description: "应用界面可使用 React 适配器，任何浏览器 ESM 项目都可直接挂载 Core。",
      },
      title: "只需安装一个浏览器软件包。",
      description:
        "两条路径都会创建由 Core 拥有的同一份页面文档。请选择适合应用的 API，而不是另一套渲染器。",
      tabListLabel: "快速开始软件包",
      reactTab: "React",
      coreTab: "Core",
      copyInstall: "复制安装命令",
      copied: "已复制安装命令",
      copyFailed: "复制失败",
      sampleText: "浏览器原生页面。",
    },
    closing: {
      eyebrow: "从始至终 / 一份文档",
      title: "为 Web 创作，抵达纸页。",
      description: "围绕已提交文档、明确兼容性和无隐藏渲染权威，构建可检查的浏览器出版流程。",
      cta: "查看演示",
    },
    footer: {
      tagline: "以一份已提交页面文档为核心的浏览器原生出版。",
      demo: "演示",
      readme: "文档",
      compatibility: "兼容性",
      license: "Apache-2.0 许可证",
      metaTitle: "契约明确的仅浏览器产品",
      metaBody: "React 优先。Core 无需 React。支持原生打印与可重排 EPUB 出版。",
      contributors: "Imposia 贡献者",
    },
  },
  ja: {
    meta: {
      title: "Imposia — HTMLから、ページへ。",
      description:
        "Imposia は HTML と CSS を、1つの標準ブラウザー iframe 内でコミット済みの検査可能なページ文書へ変換します。",
      socialTitle: "Imposia — 約束を守るページ",
      socialDescription:
        "ページ化 HTML/CSS、ネイティブ印刷、リフロー型 EPUB のための React ファースト、ブラウザー専用パブリッシングツールキット。",
      openGraphLocale: "ja_JP",
    },
    skipLink: "本文へ移動",
    languageLabel: "言語",
    languageNames: {
      en: "英語",
      ko: "韓国語",
      "zh-CN": "中国語（簡体字）",
      ja: "日本語",
    },
    primaryNavigationLabel: "メインナビゲーション",
    footerNavigationLabel: "フッターナビゲーション",
    brandNote: "ブラウザーパブリッシング",
    nav: {
      why: "選ばれる理由",
      how: "仕組み",
      compatibility: "互換性",
      packages: "パッケージ",
      quickStart: "クイックスタート",
    },
    hero: {
      eyebrow: "React ファースト / ブラウザー専用",
      titleStart: "HTMLから、",
      titleEmphasis: "ページへ。",
      lede: "HTML と CSS をページ化された検査可能なブラウザー文書へ変換します。1つのコミット済みページ文書をプレビューとネイティブ印刷まで維持し、EPUB 書き出しは最新のコミット済みセマンティックソースから作るリフロー型の投影です。",
      demoCta: "デモを見る",
      contractCta: "互換性を見る",
      proofLabel: "HTML ソースが1つのコミット済みページ文書になる流れ",
      sheetKind: "セマンティックソース",
      sheetFormat: "A4 / 20 mm",
      sheetTitle: "すべての画面に、1つの文書。",
      sheetSource: "サニタイズ済み HTML + CSS",
      sheetGeneration: "第24世代",
      commitMark: "コミット済み世代",
    },
    invariantsLabel: "Imposia の製品不変条件",
    invariants: [
      { title: "ブラウザー ESM", detail: "第2のレンダリングランタイムなし" },
      { title: "1つの標準 iframe", detail: "表示とネイティブ印刷" },
      { title: "型付き警告", detail: "制約を隠さない" },
      { title: "リフロー型 EPUB 3.3", detail: "保持したセマンティックソースから" },
    ],
    why: {
      heading: {
        index: "01 / Imposia が選ばれる理由",
        title: "文書は1つ。ずれは生まれない。",
        description:
          "エディター、プレビュー、印刷が別々の文書を作ると、パブリッシング結果はずれていきます。",
      },
      body: "Imposia は直近で成功したコミット済み世代を中心に据えます。改訂を一時的なステージド世代でページ分割している間も、以前のコミットは表示され、権限を保ちます。失敗、中断、より新しい改訂によって、未完成の結果が表示へ混ざることはありません。",
      diagramLabel: "ソース改訂がステージングを経てコミット済み文書になる流れ",
      source: { title: "ソース改訂", detail: "サニタイズ済み HTML と CSS" },
      staged: { title: "ステージド世代", detail: "一時的で非標準" },
      committed: { title: "コミット済み世代", detail: "1つの標準 iframe" },
    },
    how: {
      heading: {
        index: "02 / 仕組み",
        title: "ステージし、コミットし、権限は1つに。",
        description: "Core は第2のページ文書を作らずに、ソース準備と表示を分離します。",
      },
      body: "Core はソースをサニタイズし、許可されたアセットをホスト境界で解決し、ページメディアを正規化してブラウザー内でページ分割します。React と Viewer はページを複製したりレイアウトを再実行したりせず、同じコントローラーと標準 iframe を保持します。",
      workflowLabel: "3段階のパブリッシングワークフロー",
      steps: [
        {
          number: "01",
          title: "ステージングで準備",
          description:
            "一時的なステージド世代でアセットを解決しページ分割する間も、コミット済み世代は表示され続けます。",
        },
        {
          number: "02",
          title: "アトミックにコミット",
          description:
            "完全に成功した結果だけが標準 iframe を置き換えます。失敗や置き換えは以前のコミットを維持します。",
        },
        {
          number: "03",
          title: "複製せずに表示",
          description:
            "Viewer モードとネイティブ印刷はその iframe を使い、EPUB は最新のコミット済みセマンティックソースを投影します。",
        },
      ],
      lab: {
        label: "インタラクティブパブリッシングラボ",
        header: "Imposia パブリッシングラボ",
        status: "実行できるサンプル",
        title: "実際のブラウザーパイプラインを試す。",
        description:
          "動作するデモでソースを編集し、正規化されたページメディアと警告を確認し、Viewer モードの切り替え、ネイティブ印刷、リフロー型 EPUB 書き出しを試せます。",
        cta: "パブリッシングラボを開く",
        metrics: [
          { term: "ランタイム", value: "ブラウザー ESM" },
          { term: "ページ権限", value: "標準 iframe" },
          { term: "パブリッシング", value: "印刷 + EPUB 3.3" },
        ],
      },
    },
    compatibility: {
      heading: {
        index: "03 / 互換性",
        title: "似た出力ではなく、明確な契約。",
        description: "対応動作を正確に定義し、制約付き・実験的なケースを明示します。",
      },
      tableCaption: "ブラウザーパブリッシング互換性台帳",
      capabilityHeader: "機能",
      contractHeader: "公開境界",
      statusHeader: "状態",
      rows: [
        {
          capability: "ブラウザーライフサイクル",
          contract:
            "Core、React、Viewer は表示とネイティブ印刷まで1つのコントローラーと標準 iframe を保持します。",
          status: "安定",
        },
        {
          capability: "ページメディア",
          contract:
            "A4、Letter、独自の絶対寸法、対応する @page セレクター、6つのマージンボックスを提供します。",
          status: "安定",
        },
        {
          capability: "複雑なフラグメンテーション",
          contract:
            "表、flex、grid、段組みの明示された制約付きサブセットに対応し、入力が境界を超えると型付きの復旧警告を返します。",
          status: "制約付き",
        },
        {
          capability: "脚注とページフロート",
          contract:
            "オプトインのページローカル動作で、型付きの繰り越し・フォールバック警告があります。",
          status: "実験的",
        },
        {
          capability: "サーバーとバイトレンダラー",
          contract:
            "Node/CLI レンダリング、サーバー書き出し、固定レイアウト EPUB、PDF バイト出力は提供しません。",
          status: "未対応",
        },
      ],
    },
    packages: {
      heading: {
        index: "04 / パッケージ",
        title: "統合レイヤーを選ぶ。",
        description:
          "4つのブラウザー ESM パッケージが、文書所有権を変えずに同じパブリッシングシステムを公開します。",
      },
      items: [
        {
          name: "@imposia/react",
          title: "React アダプター",
          description:
            "React アプリ向けのコンポーネント、フック、命令型ハンドルを提供する主要な統合画面です。",
        },
        {
          name: "@imposia/core",
          title: "ページ文書ランタイム",
          description:
            "フレームワーク非依存のライフサイクル、ページ分割、resolver、extension、印刷、EPUB 制御を提供します。",
        },
        {
          name: "@imposia/client",
          title: "統合クライアント",
          description:
            "1つのフレームワーク非依存・ブラウザー専用依存関係から Core と Viewer API を提供します。",
        },
        {
          name: "@imposia/viewer",
          title: "表示シェル",
          description:
            "Core iframe の連続・単一・見開き表示に加え、独立した PDF.js ビューアも提供します。",
        },
      ],
    },
    quickStart: {
      heading: {
        index: "05 / クイックスタート",
        title: "アプリに合うレイヤーから始める。",
        description:
          "アプリケーション UI には React アダプターを、どのブラウザー ESM プロジェクトでも Core を直接利用できます。",
      },
      title: "ブラウザーパッケージを1つインストール。",
      description:
        "どちらも Core が所有する同じページ文書を作ります。別のレンダラーではなく、アプリに合う API を選んでください。",
      tabListLabel: "クイックスタート用パッケージ",
      reactTab: "React",
      coreTab: "Core",
      copyInstall: "インストールコマンドをコピー",
      copied: "インストールコマンドをコピーしました",
      copyFailed: "コピーできませんでした",
      sampleText: "ブラウザーネイティブなページ。",
    },
    closing: {
      eyebrow: "最初から最後まで / 1つの文書",
      title: "Web のために書き、紙のページへ。",
      description:
        "コミット済み文書、明示的な互換性、隠れたレンダリング権限のない、検査可能なブラウザーパブリッシングを構築できます。",
      cta: "デモを見る",
    },
    footer: {
      tagline: "1つのコミット済みページ文書を中心にしたブラウザーネイティブパブリッシング。",
      demo: "デモ",
      readme: "ドキュメント",
      compatibility: "互換性",
      license: "Apache-2.0 ライセンス",
      metaTitle: "契約に基づくブラウザー専用",
      metaBody:
        "React ファースト。Core は React なしで動作。ネイティブ印刷とリフロー型 EPUB パブリッシング。",
      contributors: "Imposia コントリビューター",
    },
  },
};

export function isLocale(value: string | null): value is Locale {
  return value !== null && LOCALES.some((locale) => locale === value);
}
