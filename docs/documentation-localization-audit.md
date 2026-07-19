# Documentation and localization release audit

This audit identifies the documentation a consumer can rely on for the 0.1.0
browser release. It checks current public identifiers and lifecycle claims
against the package source, then records which surfaces are localized.

## Language evidence matrix

| Language | Localized consumer files | Discrepancies corrected |
| --- | --- | --- |
| English | `README.md`; `site/components/marketing-copy.ts` (`en`); `site/content/docs/*.en.mdx` | Added the ordered Publication and Reader entry path; aligned Reader, search, thumbnail, Inspector, spread, revision, and staged-generation boundaries; removed stale scenario counts. |
| Korean | `README.ko.md`; `site/components/marketing-copy.ts` (`ko`); `site/content/docs/*.ko.mdx` | Matched the English heading and example structure; corrected `documentOptionsRevision`, persistent canonical iframe, staging, runtime theme, extension cleanup, and release guidance; rewrote the Publication/Reader section as natural Korean developer prose. |
| Japanese | `README.ja.md`; `site/components/marketing-copy.ts` (`ja`); `site/content/docs/*.ja.mdx` | Matched the English heading and example structure; corrected controller replacement, staging, runtime theme, extension cleanup, and release guidance; rewrote the Publication/Reader section as natural Japanese developer prose. |
| Simplified Chinese | `README.zh-CN.md`; `site/components/marketing-copy.ts` (`zh-CN`); `site/content/docs/*.zh-CN.mdx` | Matched the English heading and example structure; corrected `documentOptionsRevision`, persistent canonical iframe, staging, runtime theme, extension cleanup, and release guidance; rewrote the Publication/Reader section as natural Simplified Chinese developer prose. |

All four root READMEs now contain the same 17 level-two/level-three sections and
16 fenced examples in the same order. Localized prose may adapt sentence order,
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
- `pnpm test:site` passed 5/5 Chromium scenarios covering the root redirect,
  four localized landing pages, localized documentation, Fumadocs navigation
  and language controls, browser errors, and 320px horizontal overflow;
- the focused constrained-layout invocation names the current seven suites and
  contains exactly 22 Chromium scenarios;
- the Inspector matrix contains 12/12 scenarios across Chromium, Firefox, and
  WebKit, its React handle/toggle is 3/3 across the same engines, and unit tests
  are 18/18 including 4/4 packed consumers;
- the authoritative serial browser matrix
  (`PORT=4180 pnpm exec playwright test --workers=1`) exited `0` with 353 passed,
  112 intentional skips, no failures, and 465 total scenarios.
- an independent exact-current English/Korean/Japanese/Simplified Chinese
  naturalness and fact-consistency review returned terminal `PASS` after checking
  the generated site bundle, localized README routes, lifecycle language,
  verification counts, compatibility limits, and missing-locale disclosure.
