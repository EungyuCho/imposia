# Verification ledger

## Legacy PDF-first ledger

Executed on 2026-07-17 in `/Users/eungyucho/Documents/viewer`.

| Requirement | Command / observable evidence | Result |
| --- | --- | --- |
| Reproducible prerequisites | `pnpm setup:browsers`, `pnpm preflight` | Frozen project dependencies plus pinned Chromium/Firefox/WebKit; release license/notices present; no Poppler requirement. |
| Core break/decorations/security | `pnpm vitest run tests/core/contracts.test.ts tests/core/security.test.ts --reporter=verbose` | 12/12 for exact warnings/tokens/source order, shared decoration sanitizer, and canonical file-root boundaries. |
| Chromium PDF lifecycle | `pnpm vitest run tests/integration/renderer.test.ts --reporter=verbose` | 17/17 for PDF, browser reuse, cumulative `break-before`, `break-after` parity, canonical subresources, deterministic process shutdown, close races, concurrency, and launch rejection. |
| CLI aliases and exits | `pnpm vitest run tests/integration/cli.test.ts --reporter=verbose` | 7 tests passing; exits 0/2/3/4/5 covered. |
| Actual CLI artifact | `pnpm cli -- render examples/book.html --output output/pdf/imposia-example.pdf --json` | Exit 0; 3 A4 pages; no warnings. |
| PDF metadata | `pdfinfo output/pdf/imposia-example.pdf` | `Imposia Field Notes`, Skia/PDF m143, tagged, JavaScript absent, 3 A4 pages. |
| Semantic regression | `pnpm test:pdf` | 3 pages and title baseline passing. |
| Visual regression | `pnpm test:visual` | 3 pinned Playwright/PDF.js canvas screenshots passing at 0.100%; no host rasterizer. |
| Viewer cross-browser | `pnpm exec playwright test tests/e2e/viewer.spec.ts --reporter=list` | 12/12 across Chromium, Firefox, WebKit, including bounded large-document rendering. |
| Performance | `pnpm benchmark:update`, format baseline, then independent `pnpm benchmark` | Representative 10/50/200-page workload; environment-identified comparison receipt includes final baseline SHA-256. |
| Dependency/release licenses | `pnpm run licenses` | Full Apache-2.0 sections/appendix, third-party notices, clean-room checklist, shipped direct dependencies, and 155-package permissive SPDX inventory verified. |

Intentional RED artifacts are retained in `artifacts/evidence/*-red.log`; matching GREEN and refresh evidence live beside them. The final `pnpm check` receipt is recorded only after the full surface passes in one command.

## Browser-Core, canonical-Viewer, and package-split ledger

Executed on 2026-07-18. This evidence covers the current one-page `@imposia/core` vertical slice, its resolver-mediated asset boundary, the canonical-iframe Viewer surface, and the ownership move of the legacy PDF renderer to `@imposia/node`; it does not claim completion of full fragmentation or a shared Node paginator.

| Requirement | Command / observable evidence | Result |
| --- | --- | --- |
| Clean browser-Core builds and package boundary | Two clean builds plus the Core artifact audit | Both clean builds passed; 48 publishable Core artifacts were boundary-clean. |
| Static checks | TypeScript typecheck and Biome lint | Both passed; Biome checked 77 files. |
| Automated tests | Vitest | 66/66 tests passed. |
| Browser-Core matrix | Browser-Core matrix across Chromium, Firefox, and WebKit | 28 tests passed; 2 Firefox/WebKit print cases were expected skips. |
| Resolver-mediated Core assets | Browser-Core asset and lifecycle E2E coverage | HTML and CSS assets resolve only through the host resolver; frame markup contains only Core-created blob URLs, authored URLs do not fetch, blocked resources warn deterministically, and URLs are revoked on replacement, failure, and destruction. |
| Canonical iframe Viewer | Chromium page-Viewer E2E coverage | `mountPageViewer()` retains the exact Core iframe and page DOM, creates no canvas reconstruction, prints the frame rather than the parent, accepts only newer generations from the same iframe, and restores the host on idempotent destruction. |
| CSS-driven browser print | Chromium print CSS probe on the canonical page document | Passed; canonical page-document CSS with `preferCSSPageSize` produced one A4 sheet with an approximately 594.96 × 841.92 pt viewport. Separate lifecycle tests prove `print()` targets the exact canonical iframe; this row does not claim a live-frame physical capture. |
| Node PDF path | Real `@imposia/node` CLI render | Passed; emitted a three-page PDF. |
| Release/license boundary | License audit and four dry-run package tarballs | 64 permissive packages audited; all four tarballs contained `LICENSE` and notices. |
