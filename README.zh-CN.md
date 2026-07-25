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
  <strong>把 React HTML 打印出来，或保存为 PDF。</strong>
  <br/>
  <sub>在应用中预览分页结果，再通过浏览器原生打印流程输出纸张或保存 PDF；也可导出 EPUB。</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-browser%20ESM-4338ca" alt="Browser ESM">
  <img src="https://img.shields.io/badge/React-%3E%3D18-149eca?logo=react&logoColor=white" alt="React 18 或更高版本">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white" alt="TypeScript 6.0">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-6d28d9" alt="Apache-2.0 许可证"></a>
</p>

<p align="center">
  <a href="https://imposia.pages.dev">文档</a> ·
  <a href="https://www.npmjs.com/org/imposia">npm 软件包</a> ·
  <a href="https://github.com/EungyuCho/imposia">GitHub</a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#为什么选择-imposia">为什么选择 Imposia</a> ·
  <a href="#工作原理">工作原理</a> ·
  <a href="#软件包">软件包</a> ·
  <a href="#发布契约">兼容性</a> ·
  <a href="#交互式演示">演示</a>
</p>

**继续使用现有的 HTML 和 CSS。Imposia 会把它们排成完整页面，供应用内预览、
浏览器原生打印或“保存为 PDF”使用。**

Imposia 是一个面向 React、仅在浏览器中运行的文档工具。它会先完成下一版页面，
再替换屏幕上的文档，因此连续的客户端更新不会露出尚未完成的布局。预览与打印
共用同一组页面。与页面一起确认的语义源内容也可导出为可重排 EPUB 3.3 `Blob`。

调用 `print()` 会打开浏览器原生打印对话框。用户可以选择打印机，也可以选择
**保存为 PDF**。Imposia 不会另外运行 PDF 渲染器，也不会返回 PDF 字节。

Core 无需 React 即可使用。Imposia 不提供 Node 运行时、命令行渲染器、服务端
导出、固定版式 EPUB、PDF 字节 API，也不承诺完整的 CSS 分片兼容性。

<p align="center">
  <img src="./docs/images/imposia-readme-hero.png" width="100%" alt="浏览器文档经过 Imposia 后转换为分页页面和展开书籍">
</p>

---

## 为什么选择 Imposia

如果每个界面都维护不同的文档，浏览器出版流程很容易发生偏差：编辑器测量
一棵树，预览复制另一棵树，打印又重建第三棵树。细微差异最终会变成页数不一致、
引用失效以及难以复现的输出。

Imposia 将一份页面文档放在整个工作流的中心。

| 出版问题 | 常见结果 | Imposia 的契约 |
| :--- | :--- | :--- |
| 内容跨越分页边界 | 片段丢失、重复或顺序错乱 | 验证范围内的输入在拼接页面后与原有顺序完全一致；不支持的情况会保持为一个整体或发出警告，而不会假装成功 |
| 分页期间 CSR 状态变化 | 预览显示不完整或过期版本 | 准备期间保留上一份已确认文档，仅在下一版本全部完成后替换 |
| 预览与打印不一致 | 每个界面都会重新执行布局 | 同一个 canonical iframe 贯穿分页、展示和原生打印 |
| HTML 转 PDF 需要另一套渲染器 | 应用预览与 PDF 结果不同 | `print()` 把已完成页面交给浏览器原生打印对话框，用户可直接保存为 PDF |
| 编写的 URL 被隐式请求 | 渲染流程出现不受控的网络通道 | 所有允许的 HTML/CSS 资源都必须经过宿主 `assetResolver` 边界 |
| 不支持的布局看起来“差不多” | 静默近似掩盖错误输出 | 受限或不支持的情况会保持为一个整体，或返回带有代码的警告 |
| React 维护第二套渲染器 | 组件行为与框架无关行为产生偏差 | React 保留同一个 Core 控制器与 iframe |
| 导出依赖服务端管线 | 仅浏览器应用必须把内容交给另一套运行时 | 当前源内容可在规定上限内直接导出保留语义结构的可重排 EPUB `Blob` |

---

## 快速开始

安装 React 适配器：

```bash
pnpm add @imposia/react react react-dom
```

挂载页面文档，然后预览、打印或保存为 PDF：

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
        单页阅读
      </button>

      <button type="button" onClick={() => void viewer.current?.print()}>
        打印 / 保存为 PDF
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

`print()` 会把 Viewer 中的页面交给浏览器原生打印对话框。需要纸张时选择打印机，
需要文件时选择**保存为 PDF**。

命令式句柄始终指向当前已确认的 Core 版本。它不会创建第二个控制器、iframe、
布局流程或资源请求通道。
`documentOptions` 在控制器挂载时固定。需要更换 `assetResolver`、扩展、限制或页面
配置时，请递增 `documentOptionsRevision`，以使用新的 canonical iframe 重建控制器。
`source` 与 `sourceRevision` 更新仍会复用现有 iframe。

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

Imposia 以一份文档作为统一依据，同时把源内容处理与界面展示分开。

```text
 HTML / CSS 源内容
        │
        ├── 查找资源 ──► 宿主 assetResolver ──► Core 管理的 Blob URL
        │
        ▼
 清理输入 + 规范化页面媒体
        │
        ▼
 在临时 iframe 中分页
        │
        ▼
 一次性将完整结果写入 canonical iframe
        │
        ├──► 不可变页面元数据 + 警告 + 耗时
        ├──► 连续 / 单页 / 跨页展示
        └──► 浏览器原生打印

 保留语义结构的最新已确认源内容 ──► 大小受限的可重排 EPUB 3.3 Blob
```

| 阶段 | 处理内容 |
| :--- | :--- |
| **解析** | Imposia 发现 HTML 与 CSS 资源，并向宿主请求允许的字节。源内容中的 URL 不会变成 iframe 请求。 |
| **清理** | 标记、CSS、`assetResolver` 输出和扩展输出都在 Core 的 CSP、各项限制及警告策略内处理。 |
| **分页** | 页面尺寸、支持的 `@page` 规则、内容拆分、引用和出版内容都在临时 iframe 中计算。 |
| **展示** | Viewer 与 React 直接显示 canonical iframe，不复制页面，也不重新计算布局。 |
| **发布** | 原生打印使用这个 iframe。EPUB 则根据最后确认的源内容及其语义结构生成大小受限的可重排归档。 |

准备新版本时，canonical iframe 仍显示上一份已确认文档。只有全部准备完成的结果
才会一次性更新 iframe 内容并移除 staging iframe。如果任务失败、被中止或被更新的
任务取代，上一份文档会保持不变。

---

## 软件包

四个浏览器 ESM 软件包从不同集成层公开同一套出版系统：

| 软件包 | 角色 | 适用场景 |
| :--- | :--- | :--- |
| [`@imposia/react`](https://www.npmjs.com/package/@imposia/react) | 主要 React 适配器 | React 18+ 应用需要组件、Hook 或命令式页面句柄 |
| [`@imposia/client`](https://www.npmjs.com/package/@imposia/client) | 统一的框架无关入口 | 希望通过一个浏览器依赖同时使用 Core 与 Viewer API |
| [`@imposia/core`](https://www.npmjs.com/package/@imposia/core) | canonical 页面文档运行时 | 不使用 React，直接控制生命周期、分页、资源解析、扩展、打印与 EPUB |
| [`@imposia/viewer`](https://www.npmjs.com/package/@imposia/viewer) | 页面与 PDF 展示 | 展示 Core iframe，或挂载独立的 PDF.js Canvas 查看器 |

软件包按集成方式划分，但文档始终由 Core 统一管理。

---

## 有序 Publication 与 Reader 导航

当多份保留语义结构的源内容需要共享一套阅读顺序、全局页序列、目录
（`outline`）与 EPUB spine 时，请使用 `ImposiaPublicationViewer`：

```tsx
import {
  ImposiaPublicationViewer,
  type ImposiaPublicationViewerHandle,
  type PublicationSnapshot,
} from "@imposia/react";
import { useRef } from "react";

const snapshot: PublicationSnapshot = {
  metadata: { title: "Field Notes", language: "zh-CN" },
  entries: [
    { id: "cover", title: "封面", html: "<h1>Field Notes</h1>" },
    { id: "chapter", title: "正文", html: "<h1>第一章</h1>" },
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

内置 Reader 会把已确认的 `outline` 展示为目录，并提供语义搜索与大小受限的
页面缩略图。React 句柄通过 `navigate()`、`search()`、`selectSearchResult()`、
`getThumbnails()` 与 `selectThumbnail()` 使用同一当前控制器路径。Inspector、
Contents、Search 与 Page thumbnails 位于 canonical iframe 之外，互斥显示并支持
键盘操作。

搜索结果与缩略图仅属于特定控制器及其已确认版本。替换文档后，请重新解析目标或
重新搜索；此前保存的值不能继续使用。Reader UI 不会重新解析源内容、把页面转换为
图像、新增 iframe，也不会再次分页。

---

## Canonical 页面文档

`PageDocument` 不只包含界面中显示的预览，还代表一个版本完整的已确认出版状态：

- 标准化的纸张与内容尺寸
- 不可变页面元数据、左右页、命名上下文和空白页标记
- 有序正文、装饰、警告与计时数据
- 用于展示与打印的隔离 canonical iframe
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

宿主只能通过 `assetResolver` 获取外部资源。Core 将批准的字节转换为自己管理的 Blob
URL，并在替换文档、任务失败或销毁控制器时释放。输入标记无法让隔离 iframe 直接请求其中
编写的 URL。

### 按声明顺序运行扩展

扩展可以转换字符串输入、过滤 `assetResolver` 请求并添加页面装饰。扩展不接触
DOM 或网络，严格按声明顺序执行；也不能替换 `assetResolver`、放宽 CSP 或限制、绕过
生命周期回滚。

```ts
import { mountPageDocument, type PageExtension } from "@imposia/core";

const lastPageFooter: PageExtension = {
  name: "example/last-page-footer",
  decoratePage: ({ blank, number, totalPages }) =>
    blank || number !== totalPages
      ? undefined
      : { footerHtml: "完 · {{pageNumber}} / {{totalPages}}" },
};

const controller = mountPageDocument(host, source, {
  extensions: [lastPageFooter],
});
```

Publication 扩展会逐项转换输入的 `entry`，并在 Core 添加受保护的组合标记
（composition marker）之前运行：

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

两种扩展都只接收冻结值。输出会再次经过清理并受到限制；失败时保留当前已确认
版本。任务被中止、被更新的任务取代或控制器被销毁时，会中止 `context.signal`，
并执行通过 `context.onCleanup()` 注册的清理回调。

---

## 发布契约

Imposia 会明确标注支持边界。它不承诺所有浏览器与打印结果完全相同，而是提供
范围较小但能够验证的功能。

| 状态 | 包含的行为 |
| :--- | :--- |
| **Stable** | 浏览器 ESM API、canonical iframe 生命周期、通过 `assetResolver` 隔离资源、页面尺寸、支持的 `@page` 选择器与页边距框、分页控制、原生打印、可重排 EPUB 导出 |
| **Constrained** | 行边界表格、column/no-wrap flex、单列 non-spanning grid、受限 multi-column 布局、本地 target reference 与 named string |
| **Experimental** | 可选的页面内脚注和顶部/底部 page float，并提供明确的 defer 与 fallback 警告 |
| **Unsupported** | Node 或 CLI 渲染、服务端导出、固定版式 EPUB、PDF 字节、任意 CSS 分片、跨浏览器页数完全一致 |

Chromium 是结构分页的参考实现。Firefox 与 WebKit 用于验证公开 API、隔离、
`assetResolver` 边界、生命周期、清理、原生打印调用与 EPUB 归档行为。测量结果与换行
位置可能不同。

在依赖受限或实验性能力前，请查阅权威的
[兼容性矩阵](./docs/compatibility.md)。

---

## 可重排 EPUB

`PageDocument.exportEpub()` 根据最后确认的源内容及其语义结构，返回
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

导出仅允许当前保留的 `assetResolver` 资源，并执行元数据、条目数、字节数、中止与
生命周期限制。页面容器、页边距装饰、生成的页码计数器、Blob URL
以及只用于分页结果的实验性内容不会进入归档。

这是语义化、可重排的 EPUB 3.3，而不是页面预览的固定版式快照。如需 PDF，
请调用 `print()` 并使用浏览器的“另存为 PDF”功能。

---

## Viewer 主题

Viewer 主题是由使用方管理的 CSS 模块。先加载软件包样式，再在单个
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

用户可切换的主题也能按实例传入同一组 Token：

```ts
const viewer = mountPageViewer(host, pageDocument, {
  theme: {
    "--imposia-viewer-color-ink": "#171522",
    "--imposia-viewer-color-accent": "#8b6cff",
  },
});

viewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
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
标准化页面媒体、页边距框、按顺序运行的扩展、受限出版案例、Viewer 控件、原生
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

`pnpm check` 会运行前置验证、类型检查、lint、单元测试、软件包构建、
浏览器 E2E 测试、生产依赖漏洞审计与依赖许可证审计。完整检查项和已保存产物清单位于
[`docs/verification.md`](./docs/verification.md)。

产品契约与架构决策可从 [`docs/routing.md`](./docs/routing.md) 查阅。当示例与
实现细节不一致时，请以兼容性矩阵为唯一事实来源。

## 贡献与发布

提交变更前，请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)，确认 clean-room 与真实
浏览器观测要求。面向维护者的发布顺序及软件包仓库前置条件见
[RELEASING.md](./RELEASING.md)，各版本的公开变更见 [CHANGELOG.md](./CHANGELOG.md)。
请通过 [SECURITY.md](./SECURITY.md) 中的私密渠道报告漏洞，并在社区交流中遵守
[Code of Conduct](./CODE_OF_CONDUCT.md)。

---

<p align="center">
  <em>为 Web 编写，并用同一份文档一直走到纸张。</em>
  <br/><br/>
  <strong>Imposia</strong>
  <br/><br/>
  <a href="./LICENSE"><code>Apache-2.0</code></a>
</p>
