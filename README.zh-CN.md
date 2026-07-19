<p align="right">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.ja.md">日本語</a> |
  <strong>简体中文</strong>
</p>

<p align="center">
  <br/>
  <img src="./docs/images/imposia-logo.png" width="520" alt="Imposia">
  <br/>
</p>

<p align="center">
  <strong>HTML in. Pages out.</strong>
  <br/>
  <sub>面向分页 HTML/CSS、React 预览、原生打印与可重排 EPUB 的浏览器原生出版工具包。</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-browser%20ESM-4338ca" alt="Browser ESM">
  <img src="https://img.shields.io/badge/React-%3E%3D18-149eca?logo=react&logoColor=white" alt="React 18 或更高版本">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-6d28d9" alt="Apache-2.0 许可证"></a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#为什么选择-imposia">为什么选择 Imposia</a> ·
  <a href="#工作原理">工作原理</a> ·
  <a href="#软件包">软件包</a> ·
  <a href="#发布契约">兼容性</a> ·
  <a href="#交互式演示">演示</a>
</p>

**无需引入第二套渲染运行时，即可将 HTML 与 CSS 转换为带分页、可检查的
浏览器文档。**

Imposia 是一个 React 优先、仅运行于浏览器的出版工具包。它负责清理源内容、
解析允许的资源、在一个规范 iframe 中完成分页，并让同一份文档贯穿预览与
浏览器原生打印。最新提交的语义源还可以导出为可重排 EPUB 3.3 `Blob`。

Core 无需 React 即可使用。Imposia 不提供 Node 运行时、命令行渲染器、服务端
导出、固定版式 EPUB、PDF 字节 API，也不承诺完整的 CSS 分片兼容性。

<p align="center">
  <img src="./docs/images/imposia-readme-hero.png" width="100%" alt="浏览器文档经过 Imposia 后转换为分页页面和展开书籍">
</p>

---

## 为什么选择 Imposia

当每个界面都维护不同的文档时，浏览器出版流程很容易发生偏差：编辑器测量
一棵树，预览复制另一棵树，打印又重建第三棵树。细微差异最终会变成页数不一致、
引用失效以及难以复现的输出。

Imposia 将一份页面文档放在整个工作流的中心。

| 出版问题 | 常见结果 | Imposia 的契约 |
| :--- | :--- | :--- |
| 预览与打印不一致 | 每个界面都会重新执行布局 | 同一个规范 iframe 贯穿分页、展示和原生打印 |
| 编写的 URL 被隐式请求 | 渲染流程出现不受控的网络通道 | 所有允许的 HTML/CSS 资源都必须经过宿主 `assetResolver` 边界 |
| 不支持的布局看起来“差不多” | 静默近似掩盖错误输出 | 受限或不支持的情况保持原子性，或返回带类型的警告 |
| React 维护第二套渲染器 | 组件行为与框架无关行为产生偏差 | React 保留同一个 Core 控制器与 iframe |
| 导出依赖服务端管线 | 仅浏览器应用必须把内容交给另一套运行时 | 当前语义源可直接导出受限的可重排 EPUB `Blob` |

---

## 快速开始

安装 React 适配器：

```bash
pnpm add @imposia/react react react-dom
```

挂载页面文档，然后对当前已提交文档执行打印或 EPUB 导出：

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
      />

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

命令式句柄始终指向当前已提交的 Core 版本。它不会创建第二个控制器、iframe、
布局流程或资源请求通道。

### 不使用 React，直接使用 Core

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

## 工作原理

Imposia 将源处理与展示分离，同时保持一份文档作为唯一事实来源。

```text
 HTML / CSS source
        │
        ├── discover assets ──► host assetResolver ──► Core-owned Blob URLs
        │
        ▼
 sanitize + normalize page media
        │
        ▼
 paginate one isolated canonical iframe
        │
        ├──► immutable page metadata + warnings + timings
        ├──► continuous / single-page presentation
        └──► native browser print

 latest committed semantic source ──► bounded reflowable EPUB 3.3 Blob
```

| 阶段 | 处理内容 |
| :--- | :--- |
| **解析** | Imposia 发现 HTML 与 CSS 资源，并向宿主请求允许的字节。源内容中的 URL 不会变成 iframe 请求。 |
| **清理** | 标记、CSS、resolver 输出与 extension 输出始终位于 Core 的 CSP、限制和警告边界内。 |
| **分页** | 页面尺寸、支持的 `@page` 规则、分片、引用与出版内容都在同一个 iframe 内解析。 |
| **展示** | Viewer 与 React 界面保留规范 iframe，不复制页面，也不重新执行布局。 |
| **发布** | 原生打印直接作用于该 iframe；EPUB 导出则把最新已提交语义源投射为受限归档。 |

源更新失败时会原子回滚。上一个已提交版本会一直保留，直到替换成功或控制器被销毁。

---

## 软件包

四个浏览器 ESM 软件包从不同集成层公开同一套出版系统：

| 软件包 | 角色 | 适用场景 |
| :--- | :--- | :--- |
| [`@imposia/react`](./packages/react) | 主要 React 适配器 | React 18+ 应用需要组件、Hook 或命令式页面句柄 |
| [`@imposia/client`](./packages/client) | 统一的框架无关入口 | 希望通过一个浏览器依赖同时使用 Core 与 Viewer API |
| [`@imposia/core`](./packages/core) | 规范页面文档运行时 | 不使用 React，直接控制生命周期、分页、resolver、extension、打印与 EPUB |
| [`@imposia/viewer`](./packages/viewer) | 页面与 PDF 展示 | 展示 Core iframe，或挂载独立的 PDF.js Canvas 查看器 |

软件包拆分只改变集成方式，不改变文档所有权。Core 始终是唯一事实来源。

---

## 规范页面文档

`PageDocument` 不只是一份渲染预览，它代表一个版本已提交的出版状态：

- 标准化的纸张与内容尺寸
- 不可变页面元数据、左右页、命名上下文和空白页标记
- 有序正文、装饰、警告与计时数据
- 用于展示与打印的隔离规范 iframe
- 带边界的可重排 EPUB 导出方法

### 页面媒体与出版 CSS

稳定支持范围包括 A4、Letter、自定义绝对尺寸、纵向与横向、宿主边距、支持的
`@page` 选择器以及六个页边距框：

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

不支持的声明不会被静默伪装成等价的浏览器输出，而是生成诊断信息。

### 仅通过 Resolver 加载资源

宿主 `assetResolver` 是唯一允许的资源边界。Core 将批准的字节转换为自有 Blob
URL，并在替换、失败或销毁时释放。输入标记无法让隔离 iframe 直接请求其中
编写的 URL。

### 顺序确定的 Extension

Extension 可以转换字符串输入、过滤 resolver 请求并添加页面装饰。它们不接触
DOM 或网络，严格按声明顺序执行；也不能替换 resolver、放宽 CSP 或限制、绕过
生命周期回滚。

```ts
import { mountPageDocument, type PageExtension } from "@imposia/core";

const runningHead: PageExtension = {
  name: "example/running-head",
  decoratePage: ({ blank }) =>
    blank
      ? undefined
      : { headerHtml: "Chapter · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, {
  extensions: [runningHead],
});
```

---

## 发布契约

Imposia 明确标注能力边界。相比无条件承诺浏览器到印刷的完全一致，一套较小且
可验证的能力子集更实用。

| 状态 | 包含的行为 |
| :--- | :--- |
| **Stable** | 浏览器 ESM API、规范 iframe 生命周期、resolver 隔离、页面尺寸、支持的 `@page` 选择器与页边距框、分页控制、原生打印、可重排 EPUB 导出 |
| **Constrained** | 行边界表格、column/no-wrap flex、单列 non-spanning grid、受限 multi-column 布局、本地 target reference 与 named string |
| **Experimental** | 可选的页面内脚注和顶部/底部 page float，并提供明确的 defer 与 fallback 警告 |
| **Unsupported** | Node 或 CLI 渲染、服务端导出、固定版式 EPUB、PDF 字节、任意 CSS 分片、跨浏览器页数完全一致 |

Chromium 是结构分页的参考实现。Firefox 与 WebKit 用于验证公开 API、隔离、
resolver 边界、生命周期、清理、原生打印调用与 EPUB 归档行为。测量结果与换行
位置可能不同。

在依赖受限或实验性能力前，请查阅权威的
[兼容性矩阵](./docs/compatibility.md)。

---

## 可重排 EPUB

`PageDocument.exportEpub()` 根据最新已提交语义源，返回
`application/epub+zip` 浏览器 `Blob`：

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

导出仅允许当前保留的 resolver 资源，并执行元数据、条目数、字节数、中止与
生命周期限制。页面 wrapper、margin furniture、生成的页码 counter、Blob URL
以及仅页面使用的实验性产物不会进入归档。

这是语义化、可重排的 EPUB 3.3，而不是页面预览的固定版式快照。如需 PDF，
请调用 `print()` 并使用浏览器的“另存为 PDF”功能。

---

## Viewer 主题

Viewer 主题是由使用方拥有的 CSS 模块。先加载软件包样式，再在单个
`.imposia-viewer` 实例上覆盖公开变量：

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

主题只改变展示，不会新增 React 或 Core 生命周期。完整公开 Token 请参阅
[`@imposia/viewer` 主题契约](./packages/viewer/README.md#theme-modules)。

---

## 独立 PDF Viewer

`@imposia/viewer` 还包含连续页与单页 PDF.js Canvas 查看器。这是独立展示 API，
不是 Core 的 PDF 导出通道。

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

展示 Core 页面文档时请使用 `mountPageViewer()`。它会保留该文档控制器创建的
原始 iframe。

---

## 交互式演示

[`examples/demo`](./examples/demo) 中的 React 出版实验室展示实时源更新、
标准化页面媒体、页边距框、有序 extension、受限出版案例、Viewer 控件、原生
打印与 EPUB 导出。

```bash
corepack pnpm install --frozen-lockfile
pnpm build
node scripts/serve-viewer.mjs
```

打开 `http://127.0.0.1:4178/examples/demo/`。

---

## 开发与验证

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm check
```

`pnpm check` 会运行 preflight 验证、类型检查、lint、单元测试、软件包构建、
浏览器 E2E 测试与依赖许可证审计。完整门禁和已保存产物映射位于
[`docs/verification.md`](./docs/verification.md)。

产品契约与架构决策可从 [`docs/routing.md`](./docs/routing.md) 查阅。当示例与
实现细节不一致时，请以兼容性矩阵为唯一事实来源。

---

<p align="center">
  <em>为 Web 编写，并让同一份文档一直抵达纸张。</em>
  <br/><br/>
  <strong>Imposia</strong>
  <br/><br/>
  <a href="./LICENSE"><code>Apache-2.0</code></a>
</p>
