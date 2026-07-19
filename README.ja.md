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
  <sub>ページ化された HTML/CSS、React プレビュー、ネイティブ印刷、リフロー型 EPUB のためのブラウザネイティブなパブリッシングツールキット。</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-browser%20ESM-4338ca" alt="Browser ESM">
  <img src="https://img.shields.io/badge/React-%3E%3D18-149eca?logo=react&logoColor=white" alt="React 18 以上">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-6d28d9" alt="Apache-2.0 ライセンス"></a>
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> ·
  <a href="#なぜ-imposia-なのか">選ばれる理由</a> ·
  <a href="#仕組み">仕組み</a> ·
  <a href="#パッケージ">パッケージ</a> ·
  <a href="#パブリッシング契約">互換性</a> ·
  <a href="#インタラクティブデモ">デモ</a>
</p>

**2つ目のレンダリングランタイムを導入せずに、HTML と CSS をページ化された
検査可能なブラウザ文書へ変換します。**

Imposia は React ファースト、ブラウザ専用のパブリッシングツールキットです。
ソースをサニタイズし、許可されたアセットを解決して、表示の基準ではない
一時的な iframe でページを準備します。成功した結果だけを永続する
1つの canonical iframe へコミットし、プレビューとネイティブ印刷に使います。
最新のコミット済みセマンティックソースは、リフロー型 EPUB 3.3 `Blob` として
書き出せます。

Core は React なしでも利用できます。Node ランタイム、コマンドライン
レンダラー、サーバー書き出し、固定レイアウト EPUB、PDF バイト API、完全な
CSS フラグメンテーション互換性は提供しません。

<p align="center">
  <img src="./docs/images/imposia-readme-hero.png" width="100%" alt="ブラウザ文書が Imposia を通り、ページと開いた本へ変換される様子">
</p>

---

## なぜ Imposia なのか

ブラウザパブリッシングでは、各画面が別々の文書を所有すると出力がずれやすく
なります。エディターは1つのツリーを計測し、プレビューは別のツリーを複製し、
印刷は3つ目のツリーを再構築します。小さな差が、ページ数の不一致、壊れた参照、
再現しにくい出力につながります。

Imposia はワークフローの中心に1つのページ文書を置きます。

| パブリッシングの課題 | 一般的に起きること | Imposia の契約 |
| :--- | :--- | :--- |
| プレビューと印刷が一致しない | 各画面でレイアウトを再実行する | 1つの canonical iframe をページ分割、表示、ネイティブ印刷まで維持する |
| 記述された URL が暗黙に取得される | レンダリングに制御不能なネットワーク経路が生まれる | 許可されるすべての HTML/CSS アセットがホストの `assetResolver` 境界を通る |
| 未対応レイアウトがそれらしく見える | 暗黙の近似処理が誤った出力を隠す | 制約付き・未対応ケースはアトミックに保つか、型付き警告を返す |
| React が第2のレンダラーを所有する | コンポーネントとフレームワーク非依存の動作がずれる | React が同じ Core コントローラーと iframe を保持する |
| 書き出しにサーバーパイプラインが必要 | ブラウザアプリが別のランタイムへコンテンツを渡す | 現在のセマンティックソースから制限付きのリフロー型 EPUB `Blob` を書き出す |

---

## クイックスタート

React アダプターをインストールします。

```bash
pnpm add @imposia/react react react-dom
```

ページ文書をマウントし、コミット済み文書を印刷または EPUB の対象にします。

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

命令型ハンドルは常に現在のコミット済み Core 世代を対象にします。2つ目の
コントローラー、iframe、レイアウトパス、アセット取得経路は作成しません。
`documentOptions` はコントローラーのマウント時に固定されます。resolver、
extension、制限、ページ設定を変更するときは `documentOptionsRevision` を
増やし、新しい canonical iframe で構成したコントローラーへ交換します。
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

Imposia は1つの文書を唯一の情報源として維持しながら、ソース処理と表示を
分離します。

```text
 HTML / CSS source
        │
        ├── discover assets ──► host assetResolver ──► Core-owned Blob URLs
        │
        ▼
 sanitize + normalize page media
        │
        ▼
 表示の基準ではない一時的な iframe でページ分割
        │
        ▼
 成功した結果を永続する canonical iframe へアトミックにコミット
        │
        ├──► immutable page metadata + warnings + timings
        ├──► continuous / single-page / spread presentation
        └──► native browser print

 latest committed semantic source ──► bounded reflowable EPUB 3.3 Blob
```

| 段階 | 処理内容 |
| :--- | :--- |
| **解決** | Imposia が HTML と CSS リソースを検出し、許可されたバイト列をホストへ要求します。記述された URL は iframe のリクエストになりません。 |
| **サニタイズ** | マークアップ、CSS、resolver の結果、extension の結果を Core の CSP、制限、警告境界内に保ちます。 |
| **ページ分割** | ページ形状、対応する `@page` ルール、フラグメンテーション、参照、パブリッシング内容を表示の基準ではない一時的な iframe 内で解決します。 |
| **表示** | Viewer と React はページを複製したりレイアウトを再実行したりせず、永続する canonical iframe を保持します。 |
| **発行** | ネイティブ印刷はその iframe を対象とし、EPUB は最新のコミット済みセマンティックソースから制限付きのリフロー型アーカイブを生成します。 |

新しい世代の準備中も、以前のコミットは永続する canonical iframe に
表示され続けます。完全に成功した結果だけが iframe の内容をアトミックに
更新し、staging iframe を削除します。失敗、中断、より新しい作業による置き換えは、
以前のコミットに影響しません。

---

## パッケージ

4つのブラウザ ESM パッケージが、異なる統合レイヤーから同じ
パブリッシングシステムを公開します。

| パッケージ | 役割 | このような場合に選択 |
| :--- | :--- | :--- |
| [`@imposia/react`](./packages/react) | 主要 React アダプター | React 18+ アプリでコンポーネント、フック、命令型ページハンドルが必要な場合 |
| [`@imposia/client`](./packages/client) | 統合されたフレームワーク非依存エントリーポイント | 1つのブラウザ専用依存関係から Core と Viewer API を使う場合 |
| [`@imposia/core`](./packages/core) | canonical ページ文書ランタイム | React なしでライフサイクル、ページ分割、resolver、extension、印刷、EPUB を直接制御する場合 |
| [`@imposia/viewer`](./packages/viewer) | ページと PDF の表示 | Core iframe を表示するか、独立した PDF.js キャンバスビューアをマウントする場合 |

パッケージ分割が変えるのは統合方法だけです。文書所有権の唯一の情報源は
Core のままです。

---

## 順序付き Publication と Reader ナビゲーション

複数のセマンティックソースで1つの読書順、グローバルなページ列、outline、
EPUB spine を共有するときは `ImposiaPublicationViewer` を使います。

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

組み込み Reader はコミット済み outline を目次として表示し、セマンティック検索と
内容量を制限したページサムネイルを提供します。React ハンドルも `navigate()`、
`search()`、`selectSearchResult()`、`getThumbnails()`、`selectThumbnail()` から
同じ現在のコントローラー経路を使います。Inspector、Contents、Search、Page
thumbnails は canonical iframe の外にある、相互排他のキーボード操作可能なパネルです。

検索結果とサムネイルは、1つのコントローラーとコミット世代に
所属します。置き換え後は再解決または再検索してください。保持した古い（stale）値は
拒否されます。Reader UI は著者入力を再解析せず、ページをラスタライズせず、iframe や
ページ分割パスを追加しません。

---

## Canonical ページ文書

`PageDocument` はレンダリング済みプレビュー以上のものです。1世代分の
コミット済みパブリッシング状態を表します。

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

ホストの `assetResolver` が唯一許可されたリソース境界です。Core は承認済み
バイト列を所有 Blob URL に変換し、置き換え、失敗、破棄時に解放します。
入力マークアップから、隔離 iframe が記述済み URL を直接取得することは
できません。

### 順序が保証された Extension

Extension は文字列入力の変換、resolver リクエストのフィルタリング、ページ
装飾の追加を行えます。DOM やネットワークにアクセスせず宣言順に実行され、
resolver の置き換え、CSP・制限の緩和、ライフサイクルのロールバック回避は
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

Publication extension は著者が用意した各 entry を独立に変換し、Core が
保護する composition marker を追加する前に実行されます。

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

どちらの extension も凍結された値だけを受け取ります。出力には制限と
サニタイズが再適用され、失敗時はコミット済み generation を保持します。
abort、supersession、destroy は `context.signal` を中断し、`context.onCleanup()` に
登録したクリーンアップを実行します。

---

## パブリッシング契約

Imposia は境界を明示します。無条件にブラウザから印刷までの互換性を約束する
よりも、小さく検証可能なサブセットのほうが実用的です。

| 状態 | 含まれる動作 |
| :--- | :--- |
| **Stable** | ブラウザ ESM API、canonical iframe のライフサイクル、resolver 分離、ページ形状、対応 `@page` セレクターとマージンボックス、改ページ、ネイティブ印刷、リフロー型 EPUB 書き出し |
| **Constrained** | 行境界テーブル、column/no-wrap flex、1列 non-spanning grid、制限付き multi-column レイアウト、ローカル target reference、named string |
| **Experimental** | 明示的な defer・fallback 警告を伴うオプトインのページローカル脚注と上下 page float |
| **Unsupported** | Node・CLI レンダリング、サーバー書き出し、固定レイアウト EPUB、PDF バイト、任意の CSS フラグメンテーション、完全なクロスブラウザページ数一致 |

Chromium が構造的ページ分割の基準です。Firefox と WebKit では公開 API、
分離、resolver 境界、ライフサイクル、クリーンアップ、ネイティブ印刷呼び出し、
EPUB アーカイブ動作を検証します。計測値と改行位置は異なる場合があります。

制約付きまたは実験的な機能を利用する前に、公式の
[互換性マトリクス](./docs/compatibility.md)を確認してください。

---

## リフロー型 EPUB

`PageDocument.exportEpub()` は、最新のコミット済みセマンティックソースから
`application/epub+zip` のブラウザ `Blob` を返します。

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

書き出しでは保持中の resolver アセットのみを許可し、メタデータ、エントリー数、
バイト数、中断、ライフサイクル制限を適用します。ページ wrapper、margin
furniture、生成されたページ counter、Blob URL、ページ専用の実験的アーティファクトは
含めません。

これはページプレビューの固定レイアウトスナップショットではなく、セマンティックな
リフロー型 EPUB 3.3 です。PDF が必要な場合は `print()` を呼び出し、ブラウザの
「PDFとして保存」を利用してください。

---

## Viewer テーマ

Viewer テーマは利用側が所有する CSS モジュールです。パッケージのスタイルシートを
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

`@imposia/viewer` には連続・単一ページの PDF.js キャンバスビューアも含まれます。
これは独立した表示 API であり、Core の PDF 書き出し経路ではありません。

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
ソース更新、正規化されたページメディア、マージンボックス、順序付き extension、
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

`pnpm check` は preflight 検証、型チェック、lint、ユニットテスト、パッケージ
ビルド、ブラウザ E2E スイート、production 脆弱性監査、依存関係ライセンス監査を
実行します。完全な
ゲートと保存済みアーティファクト一覧は
[`docs/verification.md`](./docs/verification.md)にあります。

製品契約とアーキテクチャ上の決定は [`docs/routing.md`](./docs/routing.md)から
確認できます。例と実装の詳細が異なる場合、互換性マトリクスが唯一の情報源です。

## コントリビューションとリリース

変更を提案する前に [CONTRIBUTING.md](./CONTRIBUTING.md) を読み、clean-room と
実ブラウザー観測の要件を確認してください。メンテナー向けのリリース手順と
registry の前提条件は [RELEASING.md](./RELEASING.md)、バージョンごとの公開変更は
[CHANGELOG.md](./CHANGELOG.md) にあります。脆弱性は [SECURITY.md](./SECURITY.md) の
非公開経路から報告し、コミュニティでは [Code of Conduct](./CODE_OF_CONDUCT.md) に
従ってください。

---

<p align="center">
  <em>Web のために書き、紙に届くまで1つの文書を保つ。</em>
  <br/><br/>
  <strong>Imposia</strong>
  <br/><br/>
  <a href="./LICENSE"><code>Apache-2.0</code></a>
</p>
