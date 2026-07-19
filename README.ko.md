<p align="right">
  <a href="./README.md">English</a> |
  <strong>한국어</strong> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <br/>
  <img src="./docs/images/imposia-logo.png" width="520" alt="Imposia">
  <br/>
</p>

<p align="center">
  <strong>HTML in. Pages out.</strong>
  <br/>
  <sub>페이지가 매겨진 HTML/CSS, React 미리보기, 네이티브 인쇄, 리플로우형 EPUB을 위한 브라우저 네이티브 퍼블리싱 툴킷.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-browser%20ESM-4338ca" alt="Browser ESM">
  <img src="https://img.shields.io/badge/React-%3E%3D18-149eca?logo=react&logoColor=white" alt="React 18 이상">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-6d28d9" alt="Apache-2.0 라이선스"></a>
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> ·
  <a href="#왜-imposia인가">필요한 이유</a> ·
  <a href="#작동-방식">작동 방식</a> ·
  <a href="#패키지">패키지</a> ·
  <a href="#퍼블리싱-계약">호환성</a> ·
  <a href="#인터랙티브-데모">데모</a>
</p>

**두 번째 렌더링 런타임 없이 HTML과 CSS를 페이지가 매겨지고 검사 가능한
브라우저 문서로 변환하세요.**

Imposia는 React 우선, 브라우저 전용 퍼블리싱 툴킷입니다. 소스를 정제하고,
허용된 에셋을 해석한 뒤 최종 표시 기준이 아닌 임시 iframe에서 페이지를
준비합니다. 성공한 결과만 계속 유지되는 하나의 canonical iframe에 커밋해
미리보기와 네이티브 인쇄에 사용합니다. 동일한 최신 커밋 시맨틱
소스는 리플로우형 EPUB 3.3 `Blob`으로 내보낼 수 있습니다.

Core는 React 없이도 사용할 수 있습니다. Node 런타임, 명령줄 렌더러, 서버
내보내기, 고정 레이아웃 EPUB, PDF 바이트 API, 완전한 CSS 프래그먼테이션
호환성은 제공하지 않습니다.

<p align="center">
  <img src="./docs/images/imposia-readme-hero.png" width="100%" alt="브라우저 문서가 Imposia를 통과해 페이지와 펼친 책으로 변환되는 모습">
</p>

---

## 왜 Imposia인가?

브라우저 퍼블리싱은 각 화면이 서로 다른 문서를 소유할 때 쉽게 어긋납니다.
편집기는 하나의 트리를 측정하고, 미리보기는 다른 트리를 복제하며, 인쇄는
세 번째 트리를 다시 만듭니다. 작은 차이는 페이지 수 불일치, 깨진 참조,
재현하기 어려운 출력으로 이어집니다.

Imposia는 워크플로우 중심에 하나의 페이지 문서를 둡니다.

| 퍼블리싱 문제 | 일반적인 결과 | Imposia의 계약 |
| :--- | :--- | :--- |
| 미리보기와 인쇄가 달라짐 | 화면마다 레이아웃을 다시 실행함 | 하나의 canonical iframe이 페이지네이션, 표시, 네이티브 인쇄까지 유지됨 |
| 작성된 URL이 암묵적으로 요청됨 | 렌더링 과정에 통제되지 않는 네트워크 경로가 생김 | 허용되는 모든 HTML/CSS 에셋이 호스트 `assetResolver` 경계를 통과함 |
| 지원되지 않는 레이아웃이 그럴듯하게 보임 | 조용한 근사 처리로 잘못된 출력을 숨김 | 제한·미지원 사례는 원자적으로 유지되거나 타입이 있는 경고를 반환함 |
| React가 두 번째 렌더러를 소유함 | 컴포넌트와 프레임워크 중립 동작이 어긋남 | React가 동일한 Core 컨트롤러와 iframe을 유지함 |
| 내보내기에 서버 파이프라인이 필요함 | 브라우저 앱이 콘텐츠를 다른 런타임으로 넘김 | 현재 시맨틱 소스에서 제한된 리플로우형 EPUB `Blob`을 내보냄 |

---

## 빠른 시작

React 어댑터를 설치합니다.

```bash
pnpm add @imposia/react react react-dom
```

페이지 문서를 마운트한 뒤 커밋된 문서를 인쇄 또는 EPUB 대상으로 사용합니다.

```tsx
import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
} from "@imposia/react";
import { useRef } from "react";
import "@imposia/react/styles.css";

export function BookPreview() {
  const viewer = useRef<ImposiaPageViewerHandle>(null);

  return (
    <>
      <ImposiaPageViewer
        ref={viewer}
        source={{
          html: "<article><h1>Hello</h1><p>Browser-native pages.</p></article>",
        }}
        documentOptions={{ page: { size: "A4", margin: "18mm" } }}
        viewerOptions={{ mode: "spread", spread: { cover: true } }}
      />

      <button type="button" onClick={() => viewer.current?.setMode("single")}>
        단일 페이지
      </button>

      <button type="button" onClick={() => void viewer.current?.print()}>
        Print
      </button>

      <button
        type="button"
        onClick={() =>
          void viewer.current?.exportEpub({
            metadata: {
              title: "Hello",
              language: "en",
              identifier: "urn:example:hello",
            },
          })
        }
      >
        Export EPUB
      </button>
    </>
  );
}
```

명령형 핸들은 항상 현재 커밋된 Core 세대를 대상으로 합니다. 두 번째
컨트롤러, iframe, 레이아웃 패스, 에셋 요청 경로를 만들지 않습니다.
`documentOptions`는 컨트롤러를 마운트할 때 고정됩니다. resolver,
extension, 제한, 페이지 설정을 바꾸려면 `documentOptionsRevision`을
증가시켜 새 canonical iframe으로 구성된 컨트롤러로 교체하세요.
`source` 및 `sourceRevision` 갱신은 기존 iframe을 계속 사용합니다.

### React 없이 Core 사용하기

```bash
pnpm add @imposia/core
```

```ts
import { mountPageDocument } from "@imposia/core";

const controller = mountPageDocument(
  document.querySelector<HTMLElement>("#preview")!,
  {
    html: "<article><h1>Hello</h1><p>One canonical page DOM.</p></article>",
  },
  {
    page: { size: "A4", orientation: "portrait", margin: "18mm" },
  },
);

const pageDocument = await controller.ready;

console.log({
  pageCount: pageDocument.pageCount,
  pages: pageDocument.pages,
  warnings: pageDocument.warnings,
  timings: pageDocument.timings,
});
```

---

## 작동 방식

Imposia는 하나의 문서를 진실의 원천으로 유지하면서 소스 처리와 표시를
분리합니다.

```text
 HTML / CSS source
        │
        ├── discover assets ──► host assetResolver ──► Core-owned Blob URLs
        │
        ▼
 sanitize + normalize page media
        │
        ▼
 최종 표시 기준이 아닌 임시 iframe에서 페이지네이션
        │
        ▼
 성공한 결과를 계속 유지되는 canonical iframe에 원자적으로 커밋
        │
        ├──► immutable page metadata + warnings + timings
        ├──► continuous / single-page / spread presentation
        └──► native browser print

 latest committed semantic source ──► bounded reflowable EPUB 3.3 Blob
```

| 단계 | 처리 내용 |
| :--- | :--- |
| **해석** | Imposia가 HTML과 CSS 리소스를 발견하고 호스트에 허용된 바이트를 요청합니다. 작성된 URL은 iframe 요청이 되지 않습니다. |
| **정제** | 마크업, CSS, resolver 결과, extension 결과가 Core의 CSP, 제한, 경고 경계 안에 머뭅니다. |
| **페이지네이션** | 페이지 지오메트리, 지원되는 `@page` 규칙, 프래그먼테이션, 참조, 퍼블리싱 콘텐츠를 최종 표시 기준이 아닌 임시 iframe에서 해석합니다. |
| **표시** | Viewer와 React 화면은 페이지를 복제하거나 레이아웃을 재실행하지 않고 계속 유지되는 canonical iframe을 사용합니다. |
| **퍼블리싱** | 네이티브 인쇄는 해당 iframe을 대상으로 하며, EPUB은 최신 커밋 시맨틱 소스에서 제한된 리플로우형 아카이브를 만듭니다. |

새 세대를 준비하는 동안에도 이전 커밋은 계속 유지되는 canonical iframe에
계속 표시됩니다. 완전히 성공한 결과만 iframe 내용을 원자적으로 갱신하고
staging iframe을 제거합니다. 실패, 중단, 더 새로운 작업에 의한 대체는 이전
커밋을 그대로 보존합니다.

---

## 패키지

네 개의 브라우저 ESM 패키지가 서로 다른 통합 계층에서 동일한 퍼블리싱
시스템을 제공합니다.

| 패키지 | 역할 | 이런 경우에 선택하세요 |
| :--- | :--- | :--- |
| [`@imposia/react`](./packages/react) | 주 React 어댑터 | React 18+ 앱에서 컴포넌트, 훅, 명령형 페이지 핸들이 필요할 때 |
| [`@imposia/client`](./packages/client) | 통합 프레임워크 중립 진입점 | 하나의 브라우저 전용 의존성에서 Core와 Viewer API를 함께 사용할 때 |
| [`@imposia/core`](./packages/core) | canonical 페이지 문서 런타임 | React 없이 생명주기, 페이지네이션, resolver, extension, 인쇄, EPUB을 직접 제어할 때 |
| [`@imposia/viewer`](./packages/viewer) | 페이지 및 PDF 표시 | Core iframe을 표시하거나 독립 PDF.js 캔버스 뷰어를 마운트할 때 |

패키지 분리는 통합 방식만 바꿉니다. 문서 소유권의 단일 진실 원천은 계속
Core입니다.

---

## 순서가 있는 Publication과 Reader 탐색

여러 시맨틱 소스가 하나의 읽기 순서, 전역 페이지 순서, outline,
EPUB spine을 공유해야 할 때는 `ImposiaPublicationViewer`를 사용합니다.

```tsx
import {
  ImposiaPublicationViewer,
  type ImposiaPublicationViewerHandle,
  type PublicationSnapshot,
} from "@imposia/react";
import { useRef } from "react";

const snapshot: PublicationSnapshot = {
  metadata: { title: "Field Notes", language: "ko" },
  entries: [
    { id: "cover", title: "표지", html: "<h1>Field Notes</h1>" },
    { id: "chapter", title: "본문", html: "<h1>첫 번째 장</h1>" },
  ],
};

export function PublicationPreview() {
  const viewer = useRef<ImposiaPublicationViewerHandle>(null);

  return (
    <ImposiaPublicationViewer
      ref={viewer}
      snapshot={snapshot}
      viewerOptions={{ mode: "spread", spread: { cover: true }, inspector: true }}
    />
  );
}
```

기본 Reader는 커밋된 outline을 목차로 표시하고 시맨틱 검색과 내용에 상한을 둔
페이지 썸네일을 제공합니다. React 핸들에서도 `navigate()`, `search()`,
`selectSearchResult()`, `getThumbnails()`, `selectThumbnail()`로 동일한 현재
컨트롤러 경로를 사용합니다. Inspector, Contents, Search, Page thumbnails는
canonical iframe 밖에 있는 상호 배제·키보드 탐색 패널입니다.

검색 결과와 썸네일은 하나의 컨트롤러와 커밋 세대에 속합니다.
교체 후에는 다시 해석하거나 검색하세요. 보관한 오래된(stale) 값은 거부됩니다. Reader
UI는 작성 소스를 다시 파싱하거나 페이지를 래스터화하지 않으며, iframe이나
페이지네이션 패스를 추가하지 않습니다.

---

## Canonical 페이지 문서

`PageDocument`는 렌더링된 미리보기보다 더 많은 정보를 담습니다. 한 세대의
커밋된 퍼블리싱 상태입니다.

- 정규화된 용지 및 콘텐츠 지오메트리
- 불변 페이지 메타데이터, 페이지 면, 이름이 있는 컨텍스트, 빈 페이지 표시
- 순서가 있는 본문 텍스트, 장식, 경고, 타이밍
- 표시와 인쇄에 사용되는 격리된 canonical iframe
- 제한이 적용된 리플로우형 EPUB 내보내기 메서드

### 페이지 미디어와 퍼블리싱 CSS

안정 지원 범위에는 A4, Letter, 사용자 지정 절대 크기, 세로·가로 방향,
호스트 여백, 지원되는 `@page` selector, 여섯 개의 margin box가 포함됩니다.

```css
@page {
  size: A4;
  margin: 18mm;

  @top-left {
    content: string(chapter);
  }

  @bottom-center {
    content: counter(page) " / " counter(pages);
  }
}

h1 {
  string-set: chapter content();
}
```

지원되지 않는 선언은 동등한 브라우저 출력처럼 조용히 표시되지 않고 진단을
생성합니다.

### Resolver 전용 에셋

호스트 `assetResolver`는 유일하게 허용된 리소스 경계입니다. Core는 승인된
바이트를 소유 Blob URL로 바꾸고 교체, 실패, 파괴 시 해제합니다. 입력
마크업은 격리된 iframe에서 작성된 URL을 직접 요청할 수 없습니다.

### 순서가 보장되는 Extension

Extension은 문자열 입력을 변환하고, resolver 요청을 필터링하고, 페이지
장식을 추가할 수 있습니다. DOM 또는 네트워크 접근 없이 선언 순서대로
실행되며 resolver 교체, CSP·제한 완화, 생명주기 롤백 우회는 할 수 없습니다.

```ts
import { mountPageDocument, type PageExtension } from "@imposia/core";

const lastPageFooter: PageExtension = {
  name: "example/last-page-footer",
  decoratePage: ({ blank, number, totalPages }) =>
    blank || number !== totalPages
      ? undefined
      : { footerHtml: "끝 · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, {
  extensions: [lastPageFooter],
});
```

Publication extension은 작성된 각 entry를 독립적으로 변환하며, Core가
보호하는 composition marker를 추가하기 전에 실행됩니다.

```ts
import { mountPublication, type PublicationExtension } from "@imposia/core";

const entryPolicy: PublicationExtension = {
  name: "example/entry-policy",
  transformEntry(input, context) {
    if (input.entry.id === "appendix") {
      context.warn({
        code: "EXTENSION_APPENDIX_POLICY",
        message: "The appendix policy was applied.",
      });
    }
    return { html: `${input.html}<p>${input.publication.title}</p>` };
  },
};

const publication = mountPublication(host, snapshot, {
  extensions: [entryPolicy],
});
```

두 extension 형태는 동결된 값만 받습니다. 출력은 다시 제한·sanitize되며,
실패하면 커밋된 generation을 보존합니다. abort, supersession, destroy는
`context.signal`을 중단하고 `context.onCleanup()`에 등록된 정리를 실행합니다.

---

## 퍼블리싱 계약

Imposia는 경계를 명시적으로 구분합니다. 작고 검증 가능한 부분 집합이
브라우저-인쇄 호환성을 무조건 약속하는 것보다 유용합니다.

| 상태 | 포함되는 동작 |
| :--- | :--- |
| **Stable** | 브라우저 ESM API, canonical iframe 생명주기, resolver 격리, 페이지 지오메트리, 지원되는 `@page` selector와 margin box, break, 네이티브 인쇄, 리플로우형 EPUB 내보내기 |
| **Constrained** | 행 경계 테이블, column/no-wrap flex, 단일 열 non-spanning grid, 제한된 multi-column 레이아웃, 로컬 target reference, named string |
| **Experimental** | 명시적인 defer·fallback 경고를 제공하는 선택적 페이지 로컬 각주와 위·아래 page float |
| **Unsupported** | Node·CLI 렌더링, 서버 내보내기, 고정 레이아웃 EPUB, PDF 바이트, 임의 CSS 프래그먼테이션, 정확한 크로스 브라우저 페이지 수 일치 |

Chromium은 구조적 페이지네이션의 기준입니다. Firefox와 WebKit에서는 공개
API, 격리, resolver 경계, 생명주기, 정리, 네이티브 인쇄 호출, EPUB 아카이브
동작을 검증합니다. 메트릭과 줄바꿈은 달라질 수 있습니다.

제한 또는 실험적 기능에 의존하기 전에 공식
[호환성 매트릭스](./docs/compatibility.md)를 확인하세요.

---

## 리플로우형 EPUB

`PageDocument.exportEpub()`은 최신 커밋 시맨틱 소스로부터
`application/epub+zip` 브라우저 `Blob`을 반환합니다.

```ts
const epub = await pageDocument.exportEpub({
  metadata: {
    title: "The Browser Book",
    language: "en",
    identifier: "urn:example:browser-book",
  },
  limits: {
    maxEntries: 512,
    maxBytes: 16 * 1024 * 1024,
  },
});
```

내보내기는 유지 중인 resolver 에셋만 허용하며 메타데이터, 항목 수, 바이트,
중단, 생명주기 제한을 적용합니다. 페이지 wrapper, margin furniture, 생성된
페이지 counter, Blob URL, 페이지 전용 실험적 아티팩트는 제외합니다.

이는 페이지 미리보기의 고정 레이아웃 스냅샷이 아니라 시맨틱 리플로우형
EPUB 3.3입니다. PDF가 필요하면 `print()`를 호출하고 브라우저의 PDF로 저장
기능을 사용하세요.

---

## Viewer 테마

Viewer 테마는 소비자가 소유하는 CSS 모듈입니다. 패키지 스타일시트를 먼저
불러온 뒤 개별 `.imposia-viewer` 인스턴스에서 공개 변수를 재정의합니다.

```ts
import "@imposia/react/styles.css";
import "./viewer-theme.css";
```

```css
.imposia-viewer {
  --imposia-viewer-color-ink: #171522;
  --imposia-viewer-color-paper: #fff8e8;
  --imposia-viewer-color-accent: #4338ca;
  --imposia-viewer-font-serif: "Iowan Old Style", Georgia, serif;
}
```

사용자가 선택하는 테마는 동일한 토큰을 인스턴스별로 전달할 수 있습니다.

```ts
const viewer = mountPageViewer(host, pageDocument, {
  theme: {
    "--imposia-viewer-color-ink": "#171522",
    "--imposia-viewer-color-accent": "#8b6cff",
  },
});

viewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
```

테마는 React 또는 Core 생명주기를 추가하지 않고 표시만 바꿉니다. 전체 공개
토큰은 [`@imposia/viewer` 테마 계약](./packages/viewer/README.md#theme-modules)을
참고하세요.

---

## 독립 PDF Viewer

`@imposia/viewer`에는 연속·단일 페이지 PDF.js 캔버스 뷰어도 포함됩니다.
이는 별도의 표시 API이며 Core의 PDF 내보내기 경로가 아닙니다.

```ts
import { mountViewer } from "@imposia/viewer";
import "@imposia/viewer/styles.css";

const viewer = mountViewer(
  document.querySelector<HTMLElement>("#viewer")!,
  "/book.pdf",
  { workerSrc: "/pdf.worker.min.mjs" },
);

viewer.setMode("single");
viewer.setZoom(1.2);
viewer.nextPage();
```

Core 페이지 문서를 표시할 때는 `mountPageViewer()`를 사용하세요. 해당 문서의
컨트롤러가 만든 정확한 iframe을 유지합니다.

---

## 인터랙티브 데모

[`examples/demo`](./examples/demo)의 React 퍼블리싱 랩에서는 실시간 소스
변경, 정규화된 페이지 미디어, margin box, 순서가 있는 extension, 제한된
퍼블리싱 사례, Viewer 컨트롤, 네이티브 인쇄, EPUB 내보내기를 확인할 수
있습니다.

```bash
corepack pnpm install --frozen-lockfile
pnpm build
node scripts/serve-viewer.mjs
```

`http://127.0.0.1:4178/examples/demo/`를 여세요.

---

## 개발과 검증

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm check
```

`pnpm check`는 preflight 검증, 타입 검사, lint, 단위 테스트, 패키지 빌드,
브라우저 E2E suite, production 취약점 감사, 의존성 라이선스 감사를 실행합니다. 전체 gate와 캡처된
아티팩트 목록은 [`docs/verification.md`](./docs/verification.md)에 있습니다.

제품 계약과 아키텍처 결정은 [`docs/routing.md`](./docs/routing.md)에서
찾을 수 있습니다. 예제와 구현 세부사항이 다를 때는 호환성 매트릭스를
진실의 원천으로 사용합니다.

## 기여와 릴리스

변경을 제안하기 전에 [CONTRIBUTING.md](./CONTRIBUTING.md)를 읽고 clean-room 및
실제 브라우저 관찰 요구사항을 확인하세요. 유지보수자용 릴리스 순서와 registry
전제 조건은 [RELEASING.md](./RELEASING.md), 버전별 공개 변경은
[CHANGELOG.md](./CHANGELOG.md)에 있습니다. 취약점은 [SECURITY.md](./SECURITY.md)의 비공개
경로로 제보하고, 사용자 공간에서는 [Code of Conduct](./CODE_OF_CONDUCT.md)를
따르세요.

---

<p align="center">
  <em>웹을 위해 작성하고, 종이에 닿을 때까지 하나의 문서를 유지하세요.</em>
  <br/><br/>
  <strong>Imposia</strong>
  <br/><br/>
  <a href="./LICENSE"><code>Apache-2.0</code></a>
</p>
