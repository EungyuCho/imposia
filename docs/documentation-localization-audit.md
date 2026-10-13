# Documentation and localization release audit

This audit began with the documentation a consumer could rely on for the 0.1.0
browser release. It checks current public identifiers and lifecycle claims
against the package source, then records which surfaces are localized. The
verification section retains historical gates; the current review is the
0.8.1 addendum below.

## Historical language evidence matrix (0.1.x)

| Language | Localized consumer files | Discrepancies corrected |
| --- | --- | --- |
| English | `README.md`; `site/components/marketing-copy.ts` (`en`); `site/content/docs/*.en.mdx` | Added the ordered Publication and Reader entry path; aligned Reader, search, thumbnail, Inspector, spread, revision, and staged-generation boundaries; removed stale scenario counts. |
| Korean | `README.ko.md`; `site/components/marketing-copy.ts` (`ko`); `site/content/docs/*.ko.mdx` | Matched the English heading and example structure; corrected `documentOptionsRevision`, persistent canonical iframe, staging, runtime theme, extension cleanup, and release guidance; rewrote the Publication/Reader section as natural Korean developer prose. |
| Japanese | `README.ja.md`; `site/components/marketing-copy.ts` (`ja`); `site/content/docs/*.ja.mdx` | Matched the English heading and example structure; corrected controller replacement, staging, runtime theme, extension cleanup, and release guidance; rewrote the Publication/Reader section as natural Japanese developer prose. |
| Simplified Chinese | `README.zh-CN.md`; `site/components/marketing-copy.ts` (`zh-CN`); `site/content/docs/*.zh-CN.mdx` | Matched the English heading and example structure; corrected `documentOptionsRevision`, persistent canonical iframe, staging, runtime theme, extension cleanup, and release guidance; rewrote the Publication/Reader section as natural Simplified Chinese developer prose. |

The initial audit recorded 17 sections and 16 examples in each root README.
The current compact guides use six sections and one installation example in
each locale; detailed contracts live in the site and package guides. Localized prose may adapt sentence order,
but package names, public type names, method names, option names, warning terms,
and code behavior remain aligned. The supported localized term is
`canonical iframe`; successful source updates replace its contents, not the
persistent iframe itself.

## Shared English reference surfaces

The following release references are intentionally English-only and were
audited as shared technical sources:

- package guides: `packages/core/README.md`, `packages/client/README.md`,
  `packages/viewer/README.md`, and `packages/react/README.md`;
- product and support contracts: `docs/domain/product.md`,
  `docs/compatibility.md`, `docs/verification.md`,
  `docs/open-source-readiness.md`, and the ADRs routed from `docs/routing.md`;
- contribution and release records: `CONTRIBUTING.md`, `RELEASING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, and `CHANGELOG.md`;
- runnable examples under `examples/demo`, `examples/react`, `examples/viewer`,
  and `examples/book.html`.

The package guides document the full Core, Client, Viewer, and React API. The
localized root guides provide the supported onboarding path and link to those
English references for detailed contracts. The examples keep English UI and
sample prose; code identifiers are language-neutral and checked by the example
TypeScript projects.

## Cross-surface corrections

- The homepage and localized guides now describe one persistent canonical
  iframe whose contents update only after pagination succeeds in a temporary,
  noncanonical staging iframe.
- Root examples use the current `ImposiaPageViewer`,
  `ImposiaPublicationViewer`, `documentOptionsRevision`, Reader, search,
  thumbnails, Inspector, spread, print, and reflowable EPUB contracts.
- Browser support remains explicit: Chromium is the structural pagination
  reference; Firefox and WebKit cover the declared public API and lifecycle
  boundary. Exact page-count or pixel parity is not promised.
- `CHANGELOG.md` now includes Publication, Reader, search, thumbnails, spread,
  source-aware diagnostics, constrained complex fragmentation, and CJK
  typography.
- `examples/book.html` no longer describes browser print as deterministic PDF
  output. Each localized site Documentation link now resolves to the matching
  Fumadocs MDX route while the runnable demo remains shared.

## Missing locale coverage

There are no Korean, Japanese, or Simplified Chinese editions of the package
READMEs, detailed contracts/ADRs, contributor and release policies, changelog,
or runnable example UI. This audit does not present those English-only files as
localized. Adding a locale means translating the complete current contract and
repeating this identifier, link, and naturalness review; partial translations
should not be labeled as release documentation.

## Verification

### 0.1.3 release-gate addendum

The release audit uses source-only checks so it does not mutate package
distribution directories:

```bash
pnpm exec tsc --noEmit --pretty false -p tests/typecheck/tsconfig.json
pnpm exec tsc --noEmit --pretty false -p examples/demo/tsconfig.json
pnpm site:typecheck
pnpm exec biome check README.md README.ko.md README.ja.md README.zh-CN.md site packages docs examples
pnpm build:demo
pnpm site:build
pnpm test:site
```

Local Markdown paths and heading anchors, homepage paths and fragment targets,
locale object shape, root README section/example parity, and exact-current
multilingual naturalness are checked separately during the release audit.

Recorded on 2026-07-19:

- public-surface, demo, and site no-emit type checks exited `0`;
- Biome reported no applicable source-format findings, and scoped
  `git diff --check` passed;
- all local targets in 38 Markdown files resolved, as did the homepage file
  paths and fragment targets;
- the four root guides aligned at 17 headings, 16 fenced examples, the same
  fence-language order, and 29 inline public identifiers;
- every homepage locale exposes the same six product boundaries, localized
  Fumadocs documentation, and the shared runnable demo;
- `pnpm site:build` generated a client-only React Router SPA at
  `site/build/client/index.html`; runtime routes do not depend on Next.js or a
  server-side MDX loader;
- `pnpm test:site` passed 8/8 Chromium scenarios covering the root redirect,
  four localized landing pages, localized documentation, Fumadocs navigation
  and language controls, browser errors, and 320px horizontal overflow;
- the focused constrained-layout invocation names the current seven suites and
  contains exactly 22 Chromium scenarios;
- the Inspector matrix contains 12/12 scenarios across Chromium, Firefox, and
  WebKit, its React handle/toggle is 3/3 across the same engines, and unit tests
  are 18/18 including 4/4 packed consumers;
- the authoritative serial browser matrix
  (`CI=true pnpm check`) exited `0` with 354 passed, 120 intentional skips, no
  failures, and 474 total scenarios.
- an independent exact-current English/Korean/Japanese/Simplified Chinese
  naturalness and fact-consistency review returned terminal `PASS` after checking
  the generated site bundle, localized README routes, lifecycle language,
  verification counts, compatibility limits, and missing-locale disclosure.

## 0.7.0 contract addendum — 2026-10-13

The English npm package guides and all four localized Core, React, Viewer,
asset-guide, and changelog surfaces now document strict blocked-resource
policy, ordered element resolution, HTML snapshot export, unicode-range font
filtering, iframe naming, Viewer policies, and deferred single-document
preparation. The React references include the terminal `aborted` status and
the distinction between retained `document` and ready-only `source`.

The new sections carry matching code identifiers and localized examples.
HTML export is distinguished from reflowable EPUB and PDF bytes; font filtering
is explicitly conservative for generated text and locale-dependent transforms.
The shared contract/ADR and package references remain English-only. Earlier
section counts and verification totals above describe their recorded release,
not the current corpus. Fresh release verification is recorded separately.

## 0.8.1 documentation review — 2026-10-14

Scope: published `v0.6.0..v0.8.1`, with `v0.8.1` at
`cd540913e4176dfd30de5528b4518132ae429e99`. This is a documentation/site update;
package versions remain 0.8.1. The existing main/site layout is authoritative,
with shared Markdown contracts and localized MDX. `CONTEXT.md` and
`docs/routing.md` remain the domain entry points.

| Contract | Source/test evidence | Refreshed surfaces |
| --- | --- | --- |
| Single-document preparation and five terminal/loading states | `use-imposia-document.ts`, preparation unit tests, preview browser specs | Getting started and React prop table in all four locales; product/architecture context |
| Warn/strict resources and ordered element preparation | Core types, assets-policy and preview browser specs | Asset guide, Core option table, compatibility and product contracts |
| Rowspan cuts, logical columns, widths and breakable wrappers | Table grid/generation and rowspan split browser suite | New table guide in all locales, Core/Client/React READMEs, compatibility and ADR 0014 |
| Wide body and cell decoration recovery | Body-width browser suite, including actual prefixed WebKit clone mode | Table guide, Core reference, package guides and ADR addendum |
| Committed HTML, anchors, all-page rendering and receiving pixel ratio | HTML export implementation, anchor/ratio suites | New HTML guide in all locales, output tables, Core reference and architecture output surface |
| Current bundle measurements | `benchmarks/bundle-size.json` version 0.8.1 | Localized docs overview uses current sizes/budgets; timing baseline retains its own date |
| Site operation | Existing Pages project with no Git provider | Contribution guide records direct upload and independent package/site deployment |

Shared package READMEs, contracts, ADRs, and verification records remain
English-only. All new consumer guides have English, Korean, Japanese, and
Simplified Chinese versions with the same example API identifiers. Guide
metadata, prerender routes, and sitemap include both new topics. The root
READMEs remain compact and link directly to the matching localized guides.
Historical verification numbers above retain their original scope; current
published verification is recorded in `docs/verification.md`.

Verification of this documentation refresh:

- `PASS`: `pnpm build` / final `pnpm site:build`, `pnpm site:typecheck`, scoped
  Biome, and `git diff --check`.
- `PASS`: 12 complete table/export/manual-preparation examples typecheck with
  strict TypeScript against the built package declarations. The new guides'
  code blocks match across all four locales.
- `PASS`: 52 prerendered documentation routes, 62 canonical sitemap URLs,
  44 authored localized link targets, and rendered heading anchors.
- `PASS`: all 15 existing Chromium site scenarios.
- `PASS`: new guides rendered in all four languages at 320px without page-wide
  horizontal overflow; Korean desktop (1440px) and narrow screenshots reviewed.
  Keyboard Enter navigation, preserved-topic language switch, and mobile
  sidebar navigation/close state were exercised.

Historical local `.omo` evidence paths are retained as provenance labels rather
than broken download links. Current package evidence links to immutable CI.
This refresh checks documentation rendering in Chromium; it does not claim
new cross-engine pagination or PDF-server validation.
