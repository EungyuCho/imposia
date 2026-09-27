<p align="right">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.ja.md">日本語</a> |
  <strong>简体中文</strong>
</p>

<img src="./docs/images/imposia-readme-banner.png" alt="Imposia：浏览器页面的实时预览与快速加载" width="100%">

[![npm version](https://img.shields.io/npm/v/@imposia/react?color=4f46e5&label=npm)](https://www.npmjs.com/package/@imposia/react)
[![Verify](https://github.com/EungyuCho/imposia/actions/workflows/verify.yml/badge.svg)](https://github.com/EungyuCho/imposia/actions/workflows/verify.yml)
[![Website](https://img.shields.io/badge/website-imposia.pages.dev-4f46e5)](https://imposia.pages.dev/zh-CN)
[![License](https://img.shields.io/badge/license-Apache--2.0-6d28d9)](./LICENSE)

## 简介

Imposia 在浏览器中将 HTML 和 CSS 分页。内容变化时，它会保留上一次完整的
预览，同时准备下一组页面。相同页面可通过浏览器打印对话框打印或保存为 PDF。

## 快速开始

安装 React 包（需要 React 18 或更高版本）：

```bash
pnpm add @imposia/react react react-dom
```

参阅[入门指南](https://imposia.pages.dev/zh-CN/docs/getting-started)，了解如何
显示第一页。Imposia 在浏览器中运行，并通过原生打印对话框保存 PDF；
它不直接返回 PDF 字节。

## 主要功能

- 无需单独的文档渲染器，即可将现有 HTML 和 CSS 分页。
- 内容变化后，在保留已完成页面的同时准备新页面。
- 预览已确定的页面，并通过浏览器打印或保存为 PDF。
- 使用 React Viewer 或不依赖框架的 Core API。

## 参与贡献

提出更改前，请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 文档

[文档网站](https://imposia.pages.dev/zh-CN/docs)提供指南和 API 说明，
[在线演示](https://imposia.pages.dev/examples/demo/index.html)可直接体验。
支持的布局和测量方法请参阅[兼容性矩阵](./docs/compatibility.md)与
[基准测试](./docs/benchmarks.md)。

## 许可证

Imposia 采用 [Apache 2.0](./LICENSE) 许可证。
