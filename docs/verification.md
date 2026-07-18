# Verification ledger

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
