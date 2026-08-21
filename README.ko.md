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
  <strong>React에서 만든 HTML을 인쇄하고 PDF로 저장하세요.</strong>
  <br/>
  <sub>앱에서 페이지를 미리보고, 브라우저 인쇄 창에서 종이로 출력하거나 PDF로 저장할 수 있습니다. EPUB 내보내기도 지원합니다.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-browser%20ESM-4338ca" alt="Browser ESM">
  <img src="https://img.shields.io/badge/React-%3E%3D18-149eca?logo=react&logoColor=white" alt="React 18 이상">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white" alt="TypeScript 6.0">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-6d28d9" alt="Apache-2.0 라이선스"></a>
</p>

<p align="center">
  <a href="https://imposia.pages.dev">문서</a> ·
  <a href="https://www.npmjs.com/org/imposia">npm 패키지</a> ·
  <a href="https://github.com/EungyuCho/imposia">GitHub</a>
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> ·
  <a href="#왜-imposia인가">필요한 이유</a> ·
  <a href="#작동-방식">작동 방식</a> ·
  <a href="#패키지">패키지</a> ·
  <a href="#퍼블리싱-계약">호환성</a> ·
  <a href="#인터랙티브-데모">데모</a>
</p>

**쓰던 HTML과 CSS를 그대로 페이지로 만드세요. 앱에서 미리본 결과를 브라우저
인쇄 창으로 보내 종이로 출력하거나 PDF로 저장할 수 있습니다.**

Imposia는 React 앱에서 실행되는 브라우저 전용 문서 도구입니다. 새 페이지를
끝까지 만든 뒤 화면을 바꾸기 때문에 클라이언트 상태가 빠르게 바뀌어도 덜 만든
문서가 드러나지 않습니다. 미리보기와 인쇄는 같은 페이지를 사용합니다. 함께
확정한 원본의 의미 구조는 리플로우형 EPUB 3.3 `Blob`으로도 내보낼 수 있습니다.

`print()`를 호출하면 브라우저의 기본 인쇄 창이 열립니다. 여기서 프린터를
선택하거나 **PDF로 저장**할 수 있습니다. Imposia가 별도의 PDF 렌더러를
실행하거나 PDF 바이트를 반환하는 방식은 아닙니다.

Core는 React 없이도 사용할 수 있습니다. Node 런타임, 명령줄 렌더러, 서버
내보내기, 고정 레이아웃 EPUB, PDF 바이트 API, 모든 CSS 분할 규칙과의 완전한
호환성은 제공하지 않습니다.

<p align="center">
  <img src="./docs/images/imposia-readme-hero.png" width="100%" alt="브라우저 문서가 Imposia를 통과해 페이지와 펼친 책으로 변환되는 모습">
</p>

---

## 왜 Imposia인가?

미리보기와 인쇄가 서로 다른 문서를 만들면 결과도 쉽게 어긋납니다. 편집기는
한 트리를 재고, 미리보기는 다른 트리를 복제하고, 인쇄는 다시 별도의 트리를
만드는 식입니다. 작은 차이도 페이지 수 불일치나 끊어진 참조로 이어집니다.

Imposia는 작업 흐름의 중심에 하나의 페이지 문서를 둡니다.

| 퍼블리싱 문제 | 일반적인 결과 | Imposia의 계약 |
| :--- | :--- | :--- |
| 내용이 페이지 경계를 넘음 | 조각이 빠지거나 중복되거나 순서가 바뀜 | 검증 범위에 포함된 입력은 페이지를 다시 이었을 때 원문 순서와 정확히 일치함. 지원하지 않는 사례는 성공한 것처럼 보이지 않고 한 덩어리로 유지하거나 경고함 |
| 페이지를 만드는 동안 CSR 상태가 바뀜 | 일부만 반영된 세대나 오래된 세대가 노출됨 | 준비하는 동안 이전 확정 문서를 유지하고, 다음 세대가 완성됐을 때만 교체함 |
| 미리보기와 인쇄가 달라짐 | 화면마다 레이아웃을 다시 실행함 | 하나의 canonical iframe을 페이지네이션, 화면 표시, 네이티브 인쇄에 함께 사용함 |
| HTML을 PDF로 만들 때 별도 렌더러가 필요함 | 앱의 미리보기와 PDF 결과가 달라짐 | `print()`로 완성된 페이지를 브라우저 인쇄 창에 보내고, 사용자가 PDF로 저장할 수 있음 |
| 작성된 URL이 암묵적으로 요청됨 | 렌더링 과정에 통제되지 않는 네트워크 경로가 생김 | 허용되는 모든 HTML/CSS 에셋이 호스트 `assetResolver` 경계를 통과함 |
| 지원되지 않는 레이아웃이 그럴듯하게 보임 | 적당히 근사한 잘못된 출력이 문제없이 보일 수 있음 | 제한되거나 지원하지 않는 사례는 한 덩어리로 유지하거나 코드가 있는 경고를 반환함 |
| React가 두 번째 렌더러를 소유함 | 컴포넌트와 프레임워크 중립 동작이 어긋남 | React가 동일한 Core 컨트롤러와 iframe을 유지함 |
| 내보내기에 서버 파이프라인이 필요함 | 브라우저 앱이 콘텐츠를 다른 런타임으로 넘김 | 현재 원본의 의미 구조를 보존한 리플로우형 EPUB `Blob`을 정해진 한도 안에서 내보냄 |

---

## 빠른 시작

React 어댑터를 설치합니다.

```bash
pnpm add @imposia/react react react-dom
```

페이지 문서를 띄운 뒤 같은 결과를 인쇄하거나 PDF로 저장합니다.

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
        인쇄 / PDF 저장
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

`print()`는 Viewer에 보이는 페이지를 브라우저의 기본 인쇄 창으로 보냅니다.
종이로 출력하려면 프린터를, 파일로 남기려면 **PDF로 저장**을 선택하세요.

명령형 핸들은 항상 현재 확정된 Core 세대를 대상으로 합니다. 별도의
컨트롤러, iframe, 레이아웃 계산, 에셋 요청 경로는 만들지 않습니다.
`documentOptions`는 컨트롤러를 마운트할 때 고정됩니다. `assetResolver`,
확장 기능, 제한, 페이지 설정을 바꾸려면 `documentOptionsRevision`을
증가시켜 새로운 canonical iframe을 가진 컨트롤러로 교체하세요.
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

Imposia는 하나의 문서를 기준으로 삼되, 원본을 다루는 일과 화면에 보여주는 일은 분리합니다.

```text
 HTML / CSS 원본
        │
        ├── 에셋 찾기 ──► 호스트 assetResolver ──► Core 소유 Blob URL
        │
        ▼
 정제 + 페이지 미디어 정규화
        │
        ▼
 준비용 iframe에서 페이지 계산
        │
        ▼
 완성된 결과를 canonical iframe에 한 번에 반영
        │
        ├──► 불변 페이지 메타데이터 + 경고 + 소요 시간
        ├──► 연속 / 단일 페이지 / 펼침면 표시
        └──► 브라우저 네이티브 인쇄

 의미 구조를 보존한 최신 확정 원본 ──► 크기가 제한된 리플로우형 EPUB 3.3 Blob
```

| 단계 | 하는 일 |
| :--- | :--- |
| **해석** | Imposia가 HTML과 CSS 리소스를 찾아 호스트에 허용된 바이트를 요청합니다. 문서에 작성된 URL을 iframe에서 직접 요청하지 않습니다. |
| **정제** | 마크업, CSS, `assetResolver` 결과, 확장 기능의 결과를 Core의 CSP와 각종 제한, 경고 정책 안에서 다룹니다. |
| **페이지네이션** | 페이지 크기, 지원되는 `@page` 규칙, 콘텐츠 분할, 참조, 퍼블리싱 콘텐츠를 준비용 iframe에서 계산합니다. |
| **표시** | Viewer와 React는 페이지를 복제하거나 레이아웃을 다시 계산하지 않고 canonical iframe을 그대로 보여줍니다. |
| **퍼블리싱** | 네이티브 인쇄는 이 iframe을 사용합니다. EPUB은 확정된 최신 원본의 의미 구조로 리플로우형 아카이브를 만듭니다. |

새 세대를 준비하는 동안에도 canonical iframe에는 이전에 확정한 문서가
표시됩니다. 준비가 모두 끝난 결과만 iframe에 한 번에 반영하고 준비용 iframe을
제거합니다. 작업이 실패하거나 중단되거나 더 새로운 요청으로 대체되면 이전
문서를 그대로 유지합니다.

---

## 패키지

네 개의 브라우저 ESM 패키지가 서로 다른 통합 계층에서 동일한 퍼블리싱
시스템을 제공합니다.

| 패키지 | 역할 | 이런 경우에 선택하세요 |
| :--- | :--- | :--- |
| [`@imposia/react`](https://www.npmjs.com/package/@imposia/react) | 주 React 어댑터 | React 18+ 앱에서 컴포넌트, 훅, 명령형 페이지 핸들이 필요할 때 |
| [`@imposia/client`](https://www.npmjs.com/package/@imposia/client) | 통합 프레임워크 중립 진입점 | 브라우저 전용 패키지 하나로 Core와 Viewer API를 함께 사용할 때 |
| [`@imposia/core`](https://www.npmjs.com/package/@imposia/core) | canonical 페이지 문서 런타임 | React 없이 수명 주기, 페이지네이션, 에셋 해석, 확장 기능, 인쇄, EPUB을 직접 제어할 때 |
| [`@imposia/viewer`](https://www.npmjs.com/package/@imposia/viewer) | 페이지 및 PDF 표시 | Core iframe을 표시하거나 독립 PDF.js 캔버스 뷰어를 마운트할 때 |

패키지는 통합 방식에 따라 나뉘지만 문서의 기준은 언제나 Core가 소유합니다.

---

## 순서가 있는 Publication과 Reader 탐색

의미 구조를 가진 여러 원본이 하나의 읽기 순서, 전역 페이지 순서, 개요
(`outline`), EPUB spine을 공유해야 한다면 `ImposiaPublicationViewer`를
사용하세요.

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

기본 Reader는 확정된 `outline`을 목차로 보여주며, 의미 기반 검색과 크기가
제한된 페이지 썸네일을 제공합니다. React 핸들의 `navigate()`, `search()`,
`selectSearchResult()`, `getThumbnails()`, `selectThumbnail()`도 현재
컨트롤러를 그대로 사용합니다. Inspector, Contents, Search, Page thumbnails는
canonical iframe 밖에 있으며, 한 번에 하나만 열리고 키보드로 탐색할 수
있습니다.

검색 결과와 썸네일은 특정 컨트롤러와 확정 세대에 속합니다. 문서를 교체한
뒤에는 목적지를 다시 확인하거나 검색하세요. 이전 세대에서 보관한 값은 사용할
수 없습니다. Reader UI는 원본을 다시 파싱하거나 페이지를 이미지로 만들지
않으며, iframe이나 별도의 페이지네이션 과정도 추가하지 않습니다.

---

## Canonical 페이지 문서

`PageDocument`는 화면에 표시된 미리보기뿐 아니라 한 세대에서 확정된
퍼블리싱 상태 전체를 담습니다.

- 정규화된 용지와 콘텐츠 크기
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

지원하지 않는 선언을 비슷한 브라우저 출력으로 조용히 흉내 내지 않고 진단을
남깁니다.

### Resolver 전용 에셋

호스트의 `assetResolver`만 외부 리소스를 가져올 수 있습니다. Core는 승인된
바이트를 자체 Blob URL로 바꾸고, 문서를 교체하거나 작업이 실패하거나
컨트롤러를 제거할 때 URL을 해제합니다. 입력 마크업은 격리된 iframe에서
작성된 URL을 직접 요청할 수 없습니다.

### 순서가 보장되는 Extension

확장 기능은 문자열 입력을 변환하고, `assetResolver` 요청을 걸러내며, 페이지
장식을 추가할 수 있습니다. DOM이나 네트워크에 접근하지 않고 선언한 순서대로
실행됩니다. `assetResolver`를 교체하거나 CSP와 각종 제한을 완화하거나 수명
주기 롤백을 우회할 수는 없습니다.

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

Publication 확장 기능은 작성된 각 `entry`를 독립적으로 변환하며, Core가
보호하는 조합 표식(`composition marker`)을 추가하기 전에 실행됩니다.

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

두 확장 기능은 동결된 값만 받습니다. 출력은 다시 정제되고 각종 제한을
적용받습니다. 확장 기능이 실패하면 현재 확정 세대를 보존합니다. 작업이
취소되거나 더 새로운 요청으로 대체되거나 컨트롤러가 제거되면
`context.signal`을 중단하고 `context.onCleanup()`에 등록된 정리 작업을
실행합니다.

---

## 퍼블리싱 계약

Imposia는 지원 경계를 명확히 구분합니다. 모든 브라우저와 인쇄 결과가 같다고
약속하기보다, 작더라도 검증할 수 있는 범위를 제공합니다.

| 상태 | 포함되는 동작 |
| :--- | :--- |
| **Stable** | 브라우저 ESM API, canonical iframe 수명 주기, `assetResolver` 격리, 페이지 크기, 지원되는 `@page` 선택자와 margin box, break, 네이티브 인쇄, 리플로우형 EPUB 내보내기 |
| **Constrained** | 행 경계에서 나뉘는 표, column/no-wrap flex, 단일 열 non-spanning grid, 제한된 multi-column 레이아웃, 로컬 target reference, named string |
| **Experimental** | 지연·대체 경고를 명시적으로 제공하는 선택형 페이지 내부 각주와 위·아래 page float |
| **Unsupported** | Node·CLI 렌더링, 서버 내보내기, 고정 레이아웃 EPUB, PDF 바이트, 임의 CSS 분할, 브라우저마다 같은 페이지 수를 보장하는 기능 |

Chromium은 구조적 페이지네이션의 기준입니다. Firefox와 WebKit에서는 공개
API, 격리, `assetResolver` 경계, 수명 주기, 정리, 네이티브 인쇄 호출, EPUB
아카이브 동작을 검증합니다. 측정값과 줄바꿈은 달라질 수 있습니다.

제한 또는 실험적 기능에 의존하기 전에 공식
[호환성 매트릭스](./docs/compatibility.md)를 확인하세요.

---

## 리플로우형 EPUB

`PageDocument.exportEpub()`은 의미 구조를 보존한 최신 확정 원본에서
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

내보내기에는 현재 관리 중인 `assetResolver` 에셋만 포함할 수 있습니다.
메타데이터, 항목 수, 바이트 수, 작업 중단, 수명 주기 제한도 적용합니다. 페이지
wrapper, margin furniture, 생성된 page counter, Blob URL, 페이지 전용 실험
결과물은 제외합니다.

이 EPUB 3.3은 페이지 미리보기의 고정 레이아웃 복사본이 아니라 의미 구조를
보존한 리플로우형 문서입니다. PDF가 필요하면 `print()`를 호출하고 브라우저의
PDF 저장 기능을 사용하세요.

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

사용자가 고른 테마도 같은 토큰을 각 인스턴스에 전달해 적용할 수 있습니다.

```ts
const viewer = mountPageViewer(host, pageDocument, {
  theme: {
    "--imposia-viewer-color-ink": "#171522",
    "--imposia-viewer-color-accent": "#8b6cff",
  },
});

viewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
```

테마는 React나 Core의 수명 주기를 바꾸지 않고 화면 표시만 바꿉니다. 전체 공개
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

Core 페이지 문서를 표시할 때는 `mountPageViewer()`를 사용하세요. 문서
컨트롤러가 만든 iframe을 그대로 유지합니다.

---

## 인터랙티브 데모

[`examples/demo`](./examples/demo)의 React 퍼블리싱 실험실에서는 실시간 소스
변경, 정규화된 페이지 미디어, margin box, 순서가 있는 확장 기능, 제한된
퍼블리싱 사례, Viewer 조작, 네이티브 인쇄, EPUB 내보내기를 확인할 수 있습니다.

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

`pnpm check`는 사전 검증, 타입 검사, lint, 단위 테스트, 패키지 빌드,
브라우저 E2E 테스트, 프로덕션 취약점 검사, 의존성 라이선스 감사를 실행합니다.
전체 검증 항목과 저장된 결과물은
[`docs/verification.md`](./docs/verification.md)에서 확인할 수 있습니다.

제품 계약과 아키텍처 결정은 [`docs/routing.md`](./docs/routing.md)에서
찾을 수 있습니다. 예제와 구현 세부사항이 다르면 호환성 매트릭스를 기준으로
판단하세요.

## 기여와 릴리스

변경을 제안하기 전에 [CONTRIBUTING.md](./CONTRIBUTING.md)를 읽고 clean-room과
실제 브라우저 관찰 요구사항을 확인하세요. 유지보수자용 릴리스 순서와 registry
전제 조건은 [RELEASING.md](./RELEASING.md), 버전별 공개 변경은
[CHANGELOG.md](./CHANGELOG.md)에 있습니다. 취약점은
[SECURITY.md](./SECURITY.md)에 안내된 비공개 경로로 제보하고, 사용자
커뮤니티에서는 [Code of Conduct](./CODE_OF_CONDUCT.md)를 따르세요.

---

<p align="center">
  <em>웹을 위해 작성하고, 종이에 닿을 때까지 하나의 문서를 유지하세요.</em>
  <br/><br/>
  <strong>Imposia</strong>
  <br/><br/>
  <a href="./LICENSE"><code>Apache-2.0</code></a>
</p>
