<p align="right">
  <strong>English</strong> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<img src="./docs/images/imposia-readme-banner.png" alt="Imposia: live preview and fast loading for browser pages" width="100%">

[![npm version](https://img.shields.io/npm/v/@imposia/react?color=4f46e5&label=npm)](https://www.npmjs.com/package/@imposia/react)
[![Verify](https://github.com/EungyuCho/imposia/actions/workflows/verify.yml/badge.svg)](https://github.com/EungyuCho/imposia/actions/workflows/verify.yml)
[![Website](https://img.shields.io/badge/website-imposia.pages.dev-4f46e5)](https://imposia.pages.dev/en)
[![License](https://img.shields.io/badge/license-Apache--2.0-6d28d9)](./LICENSE)

## Introduction

Imposia turns HTML and CSS into paginated pages in the browser. When content
changes, it prepares the next pages while keeping the last complete preview
visible. The same pages can then be printed or saved as PDF through the browser.

## Getting Started

Install the React package (React 18 or newer):

```bash
pnpm add @imposia/react react react-dom
```

Follow the [getting started guide](https://imposia.pages.dev/en/docs/getting-started)
to render your first page. Imposia runs in the browser and uses the native print
dialog for PDF saving; it does not return PDF bytes.

## Features

- Paginate existing HTML and CSS without a separate document renderer.
- Repaginate after changes while the previous complete pages stay visible.
- Preview, print, and save the committed pages as PDF through the browser.
- Use the React Viewer or the framework-neutral Core API.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing a change.

## Documentation

Visit the [documentation site](https://imposia.pages.dev/en/docs) for guides and
API details, or try the [live demo](https://imposia.pages.dev/examples/demo/index.html).
See the [compatibility matrix](./docs/compatibility.md) and
[benchmarks](./docs/benchmarks.md) for supported layouts and measurement details.

## License

Imposia is licensed under [Apache 2.0](./LICENSE).
