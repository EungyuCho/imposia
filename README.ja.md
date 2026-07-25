<p align="right">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <strong>日本語</strong> |
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
  <sub>HTML/CSR をブラウザー上で完成したページに分割し、React プレビュー、ネイティブ印刷、意味構造を保った EPUB 書き出しにつなげます。</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-browser%20ESM-4338ca" alt="Browser ESM">
  <img src="https://img.shields.io/badge/React-%3E%3D18-149eca?logo=react&logoColor=white" alt="React 18 以上">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white" alt="TypeScript 6.0">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-6d28d9" alt="Apache-2.0 ライセンス"></a>
</p>

<p align="center">
  <a href="https://imposia.pages.dev">ドキュメント</a> ·
  <a href="https://www.npmjs.com/org/imposia">npm パッケージ</a> ·
  <a href="https://github.com/EungyuCho/imposia">GitHub</a>
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> ·
  <a href="#なぜ-imposia-なのか">選ばれる理由</a> ·
  <a href="#仕組み">仕組み</a> ·
  <a href="#パッケージ">パッケージ</a> ·
  <a href="#パブリッシング契約">互換性</a> ·
  <a href="#インタラクティブデモ">デモ</a>
</p>

**HTML と CSS を検査可能なブラウザーページに変換します。宣言された
フローの内容は、ページ境界をまたいでも欠落したり重複したりしません。**

Imposia は React ファーストのブラウザー専用パブリッシングツールキットです。
ソースをサニタイズして許可されたアセットを解決し、準備用の iframe でページを
作成します。ページの計算がすべて終わった結果だけを 1 つの canonical iframe に
反映し、プレビューとネイティブ印刷に使います。CSR 更新が続いても、次の文書が
完成するまでは直前に確定した文書を表示します。最後に確定したソースの意味構造は、
リフロー型 EPUB 3.3 `Blob` としても書き出せます。

Core は React なしでも利用できます。Node ランタイム、コマンドライン
レンダラー、サーバー書き出し、固定レイアウト EPUB、PDF バイト API、完全な
CSS フラグメンテーション互換性は提供しません。

<p align="center">
  <img src="./docs/images/imposia-readme-hero.png" width="100%" alt="ブラウザ文書が Imposia を通り、ページと開いた本へ変換される様子">
</p>

---

## なぜ Imposia なのか

ブラウザーパブリッシングでは、画面ごとに別の文書を使うと出力がずれやすく
なります。エディターは 1 つのツリーを計測し、プレビューは別のツリーを複製し、
印刷は 3 つ目のツリーを再構築します。小さな差が、ページ数の不一致、壊れた参照、
再現しにくい出力につながります。

Imposia はワークフローの中心に 1 つのページ文書を置きます。

| パブリッシングの課題 | 一般的に起きること | Imposia の契約 |
| :--- | :--- | :--- |
| 内容がページ境界をまたぐ | 断片が欠落・重複したり、順序が崩れたりする | 検証対象の入力は、ページを連結すると元の順序と完全に一致する。未対応のケースは成功として扱わず、一まとまりのまま保つか警告する |
| ページ分割中に CSR の状態が変わる | 不完全または古い世代が表示される | 準備中は直前に確定した文書を維持し、次の世代が完成したときだけ置き換える |
| プレビューと印刷が一致しない | 画面ごとにレイアウトを再計算する | 1 つの canonical iframe をページ分割、表示、ネイティブ印刷に共通して使う |
| 記述された URL が暗黙に取得される | レンダリングに制御不能なネットワーク経路が生まれる | 許可されるすべての HTML/CSS アセットがホストの `assetResolver` 境界を通る |
| 未対応レイアウトがそれらしく見える | 近似した誤った出力が問題なく見えてしまう | 制約付き・未対応のケースは一まとまりのまま保つか、コード付きの警告を返す |
| React が第 2 のレンダラーを所有する | コンポーネントとフレームワーク非依存の動作がずれる | React が同じ Core コントローラーと iframe を保持する |
| 書き出しにサーバーパイプラインが必要 | ブラウザーアプリが別のランタイムへコンテンツを渡す | 現在のソースの意味構造から、定められた上限内でリフロー型 EPUB `Blob` を書き出す |

---

## クイックスタート

React アダプターをインストールします。

```bash
pnpm add @imposia/react react react-dom
```

ページ文書をマウントし、確定した文書を印刷または EPUB 書き出しの対象にします。

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
        1ページ表示
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

命令型ハンドルは常に現在確定している Core の世代を対象にします。別の
コントローラー、iframe、レイアウト処理、アセット取得経路は作成しません。
`documentOptions` はコントローラーのマウント時に固定されます。`assetResolver`、
拡張機能、制限、ページ設定を変更するときは `documentOptionsRevision` を
増やし、新しい canonical iframe を持つコントローラーへ交換します。
`source` と `sourceRevision` の更新は既存の iframe を引き続き使います。

### React なしで Core を使う

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

## 仕組み

Imposia は 1 つの文書を基準にしながら、ソース処理と画面表示を分離します。

```text
 HTML / CSS ソース
        │
        ├── アセットを検出 ──► ホストの assetResolver ──► Core が管理する Blob URL
        │
        ▼
 サニタイズ + ページメディアの正規化
        │
        ▼
 準備用の iframe でページ分割
        │
        ▼
 完成した結果を canonical iframe に一度で反映
        │
        ├──► 不変のページメタデータ + 警告 + 所要時間
        ├──► 連続 / 単一ページ / 見開き表示
        └──► ブラウザーのネイティブ印刷

 意味構造を保った最新の確定済みソース ──► サイズ制限付きリフロー型 EPUB 3.3 Blob
```

| 段階 | 処理内容 |
| :--- | :--- |
| **解決** | Imposia が HTML と CSS リソースを検出し、許可されたバイト列をホストへ要求します。記述された URL は iframe のリクエストになりません。 |
| **サニタイズ** | マークアップ、CSS、`assetResolver` の結果、拡張機能の結果を Core の CSP、各種制限、警告ポリシーの範囲内で処理します。 |
| **ページ分割** | ページサイズ、対応する `@page` ルール、コンテンツ分割、参照、パブリッシング内容を準備用の iframe で計算します。 |
| **表示** | Viewer と React はページを複製したりレイアウトを再計算したりせず、canonical iframe をそのまま表示します。 |
| **発行** | ネイティブ印刷はこの iframe を使います。EPUB は最後に確定したソースの意味構造から、上限付きのリフロー型アーカイブを生成します。 |

新しい世代の準備中も、canonical iframe には直前に確定した文書が表示されます。
準備がすべて終わった結果だけを iframe に一度で反映し、staging iframe を
削除します。処理が失敗または中断された場合や、さらに新しい処理に
置き換えられた場合は、以前の文書をそのまま維持します。

---

## パッケージ

4 つのブラウザー ESM パッケージが、異なる統合レイヤーから同じ
パブリッシングシステムを公開します。

| パッケージ | 役割 | このような場合に選択 |
| :--- | :--- | :--- |
| [`@imposia/react`](https://www.npmjs.com/package/@imposia/react) | 主要 React アダプター | React 18+ アプリでコンポーネント、フック、命令型ページハンドルが必要な場合 |
| [`@imposia/client`](https://www.npmjs.com/package/@imposia/client) | 統合されたフレームワーク非依存エントリーポイント | 1 つのブラウザー専用パッケージから Core と Viewer API を使う場合 |
| [`@imposia/core`](https://www.npmjs.com/package/@imposia/core) | canonical ページ文書ランタイム | React なしでライフサイクル、ページ分割、アセット解決、拡張機能、印刷、EPUB を直接制御する場合 |
| [`@imposia/viewer`](https://www.npmjs.com/package/@imposia/viewer) | ページと PDF の表示 | Core iframe を表示するか、独立した PDF.js キャンバスビューアをマウントする場合 |

パッケージは統合方法によって分かれていますが、文書の基準は常に Core が
管理します。

---

## 順序付き Publication と Reader ナビゲーション

意味構造を持つ複数のソースで 1 つの読書順、グローバルなページ列、アウトライン
（`outline`）、EPUB spine を共有するときは `ImposiaPublicationViewer` を使います。

```tsx
import {
  ImposiaPublicationViewer,
  type ImposiaPublicationViewerHandle,
  type PublicationSnapshot,
} from "@imposia/react";
import { useRef } from "react";

const snapshot: PublicationSnapshot = {
  metadata: { title: "Field Notes", language: "ja" },
  entries: [
    { id: "cover", title: "表紙", html: "<h1>Field Notes</h1>" },
    { id: "chapter", title: "本文", html: "<h1>第1章</h1>" },
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

組み込み Reader は確定済みの `outline` を目次として表示し、セマンティック検索と
サイズを制限したページサムネイルを提供します。React ハンドルも `navigate()`、
`search()`、`selectSearchResult()`、`getThumbnails()`、`selectThumbnail()` から
現在のコントローラーをそのまま使います。Inspector、Contents、Search、Page
thumbnails は canonical iframe の外にあり、一度に 1 つだけ開き、キーボードで操作できます。

検索結果とサムネイルは、特定のコントローラーと確定済みの世代に属します。
文書を置き換えた後は、移動先を再解決するか、検索し直してください。以前の世代で
保持した値は使えません。Reader UI は入力ソースを再解析したり、ページを画像に
変換したりせず、iframe や別のページ分割処理も追加しません。

---

## Canonical ページ文書

`PageDocument` は画面に表示されたプレビューだけでなく、1 世代分の
確定済みパブリッシング状態全体を表します。

- 正規化された用紙とコンテンツの形状
- 不変のページメタデータ、左右ページ、名前付きコンテキスト、空白ページ情報
- 順序付き本文テキスト、装飾、警告、タイミング
- 表示と印刷に使う隔離された canonical iframe
- 制限付きリフロー型 EPUB 書き出しメソッド

### ページメディアとパブリッシング CSS

安定した対応範囲には、A4、Letter、独自の絶対寸法、縦・横向き、ホスト余白、
対応する `@page` セレクター、6つのマージンボックスが含まれます。

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

未対応の宣言は、同等のブラウザ出力として暗黙に表示されず、診断を生成します。

### Resolver 専用アセット

外部リソースを取得できる経路は、ホストの `assetResolver` だけです。Core は承認済み
バイト列を自身が管理する Blob URL に変換し、文書の置き換え、処理の失敗、
コントローラーの破棄時に解放します。
入力マークアップから、隔離 iframe が記述済み URL を直接取得することは
できません。

### 実行順序が保証された拡張機能

拡張機能は文字列入力の変換、`assetResolver` リクエストのフィルタリング、ページ
装飾の追加を行えます。DOM やネットワークにアクセスせず宣言順に実行され、
`assetResolver` の置き換え、CSP・制限の緩和、ライフサイクルのロールバック回避は
できません。

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

Publication の拡張機能は、入力された各 `entry` を個別に変換し、Core が
保護する合成マーカー（composition marker）を追加する前に実行されます。

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

どちらの拡張機能も凍結された値だけを受け取ります。出力には制限と
サニタイズが再適用され、失敗した場合は現在確定している世代を維持します。
処理の中止、新しい処理への置き換え、コントローラーの破棄が起きると
`context.signal` を中断し、`context.onCleanup()` に登録したクリーンアップを実行します。

---

## パブリッシング契約

Imposia は対応範囲を明確に示します。すべてのブラウザーと印刷結果が同じだと
約束するのではなく、小さくても検証できる範囲を提供します。

| 状態 | 含まれる動作 |
| :--- | :--- |
| **Stable** | ブラウザー ESM API、canonical iframe のライフサイクル、`assetResolver` によるリソースの隔離、ページサイズ、対応する `@page` セレクターとマージンボックス、改ページ、ネイティブ印刷、リフロー型 EPUB 書き出し |
| **Constrained** | 行境界テーブル、column/no-wrap flex、1列 non-spanning grid、制限付き multi-column レイアウト、ローカル target reference、named string |
| **Experimental** | 明示的な defer・fallback 警告を伴うオプトインのページローカル脚注と上下 page float |
| **Unsupported** | Node・CLI レンダリング、サーバー書き出し、固定レイアウト EPUB、PDF バイト、任意の CSS フラグメンテーション、完全なクロスブラウザページ数一致 |

Chromium が構造的ページ分割の基準です。Firefox と WebKit では公開 API、
リソースの隔離、`assetResolver` の境界、ライフサイクル、クリーンアップ、ネイティブ印刷呼び出し、
EPUB アーカイブ動作を検証します。計測値と改行位置は異なる場合があります。

制約付きまたは実験的な機能を利用する前に、公式の
[互換性マトリクス](./docs/compatibility.md)を確認してください。

---

## リフロー型 EPUB

`PageDocument.exportEpub()` は、最後に確定したソースの意味構造から
`application/epub+zip` のブラウザー `Blob` を返します。

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

書き出しでは保持中の `assetResolver` アセットのみを許可し、メタデータ、エントリー数、
バイト数、中断、ライフサイクル制限を適用します。ページのラッパー、余白の装飾、
生成されたページカウンター、Blob URL、ページ専用の実験的な生成物は
含めません。

これはページプレビューの固定レイアウトスナップショットではなく、意味構造を
保ったリフロー型 EPUB 3.3 です。PDF が必要な場合は `print()` を呼び出し、
ブラウザーの「PDF として保存」を利用してください。

---

## Viewer テーマ

Viewer テーマは利用側が管理する CSS モジュールです。パッケージのスタイルシートを
先に読み込み、個別の `.imposia-viewer` インスタンスで公開変数を上書きします。

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

ユーザーが切り替えるテーマは、同じトークンをインスタンスごとに渡せます。

```ts
const viewer = mountPageViewer(host, pageDocument, {
  theme: {
    "--imposia-viewer-color-ink": "#171522",
    "--imposia-viewer-color-accent": "#8b6cff",
  },
});

viewer.setTheme({ "--imposia-viewer-color-accent": "#ef6a3b" });
```

テーマは React や Core のライフサイクルを追加せず、表示だけを変更します。
公開トークンの全体は [`@imposia/viewer` のテーマ契約](./packages/viewer/README.md#theme-modules)
を参照してください。

---

## 独立 PDF Viewer

`@imposia/viewer` には連続表示と単一ページ表示に対応した PDF.js キャンバスビューアも
含まれます。これは独立した表示 API であり、Core の PDF 書き出し経路ではありません。

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

Core のページ文書を表示する場合は `mountPageViewer()` を使います。その文書の
コントローラーが作成した正確な iframe を保持します。

---

## インタラクティブデモ

[`examples/demo`](./examples/demo) の React パブリッシングラボでは、ライブ
ソース更新、正規化されたページメディア、マージンボックス、順序付きの拡張機能、
制約付きパブリッシングケース、Viewer コントロール、ネイティブ印刷、EPUB
書き出しを確認できます。

```bash
corepack pnpm install --frozen-lockfile
pnpm build
node scripts/serve-viewer.mjs
```

`http://127.0.0.1:4178/examples/demo/` を開きます。

---

## 開発と検証

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm check
```

`pnpm check` は事前検証、型チェック、lint、ユニットテスト、パッケージ
ビルド、ブラウザー E2E スイート、本番依存関係の脆弱性監査、依存関係の
ライセンス監査を実行します。すべての検証項目と保存済みアーティファクトの一覧は
[`docs/verification.md`](./docs/verification.md)にあります。

製品契約とアーキテクチャ上の決定は [`docs/routing.md`](./docs/routing.md)から
確認できます。例と実装の詳細が異なる場合、互換性マトリクスが唯一の情報源です。

## コントリビューションとリリース

変更を提案する前に [CONTRIBUTING.md](./CONTRIBUTING.md) を読み、clean-room と
実ブラウザー観測の要件を確認してください。メンテナー向けのリリース手順と
レジストリの前提条件は [RELEASING.md](./RELEASING.md)、バージョンごとの公開変更は
[CHANGELOG.md](./CHANGELOG.md) にあります。脆弱性は [SECURITY.md](./SECURITY.md) の
非公開経路から報告し、コミュニティでは [Code of Conduct](./CODE_OF_CONDUCT.md) に
従ってください。

---

<p align="center">
  <em>Web のために書き、紙に届くまで 1 つの文書を保つ。</em>
  <br/><br/>
  <strong>Imposia</strong>
  <br/><br/>
  <a href="./LICENSE"><code>Apache-2.0</code></a>
</p>
