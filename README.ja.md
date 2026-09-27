<p align="right">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <strong>日本語</strong> |
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<img src="./docs/images/imposia-readme-banner.png" alt="Imposia: ブラウザーページのライブプレビューと高速読み込み" width="100%">

[![npm version](https://img.shields.io/npm/v/@imposia/react?color=4f46e5&label=npm)](https://www.npmjs.com/package/@imposia/react)
[![Verify](https://github.com/EungyuCho/imposia/actions/workflows/verify.yml/badge.svg)](https://github.com/EungyuCho/imposia/actions/workflows/verify.yml)
[![Website](https://img.shields.io/badge/website-imposia.pages.dev-4f46e5)](https://imposia.pages.dev/ja)
[![License](https://img.shields.io/badge/license-Apache--2.0-6d28d9)](./LICENSE)

## 概要

Imposia は HTML と CSS をブラウザーでページ分割します。内容が変わると、
完成済みのプレビューを表示したまま次のページを準備します。同じページを
ブラウザーの印刷ダイアログから印刷し、PDF として保存できます。

## はじめに

React パッケージをインストールします（React 18 以降）。

```bash
pnpm add @imposia/react react react-dom
```

最初のページの表示方法は[入門ガイド](https://imposia.pages.dev/ja/docs/getting-started)を
参照してください。Imposia はブラウザーで動作し、PDF の保存には標準の
印刷ダイアログを使います。PDF バイト列は返しません。

## 主な機能

- 既存の HTML と CSS を別の文書レンダラーなしでページ分割します。
- 内容の変更後、完成済みのページを保ちながら次のページを準備します。
- 確定したページをプレビューし、ブラウザーから印刷または PDF 保存します。
- React Viewer またはフレームワークに依存しない Core API を使えます。

## コントリビュート

変更を提案する前に [CONTRIBUTING.md](./CONTRIBUTING.md)をお読みください。

## ドキュメント

ガイドと API の詳細は[ドキュメントサイト](https://imposia.pages.dev/ja/docs)を、
動作例は[ライブデモ](https://imposia.pages.dev/examples/demo/index.html)を
ご覧ください。対応レイアウトと測定方法は[互換性マトリクス](./docs/compatibility.md)と
[ベンチマーク](./docs/benchmarks.md)に記載しています。

## ライセンス

Imposia は [Apache 2.0](./LICENSE) でライセンスされています。
