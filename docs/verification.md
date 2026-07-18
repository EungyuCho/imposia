# Verification

The verification contract is browser-first and artifact-backed. A passing static
check alone is not sufficient: the canonical iframe, export Blob, lifecycle
rollback, and cross-browser boundary are exercised on their real surfaces.

## Release gates

Run the complete gate from the repository root:

```bash
CI=true pnpm preflight
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm build
CI=true pnpm test:e2e
CI=true pnpm run licenses
```

`pnpm check` runs the same checks as one command. `pnpm setup:browsers` provisions
Chromium, Firefox, and WebKit. Structural pagination suites are Chromium-reference;
the cross-browser suites assert API shape, iframe/CSP isolation, resolver-only
assets, lifecycle, cleanup, print invocation, and EPUB archive behavior.

## Focused publishing checks

| Scenario | Exact invocation | Binary observable | Captured artifact |
| --- | --- | --- | --- |
| Normalized page media, `@page` selectors, margin boxes, unsupported diagnostics, and print CSS | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-page-media.spec.ts tests/e2e/browser-core-print.spec.ts tests/e2e/browser-core-breaks.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; 8 scenarios passed; native print probe targets the canonical iframe | [page-media-green.md](../.omo/evidence/browser-publishing-coverage/page-media-green.md), [browser-core-canonical-print.pdf](../.omo/evidence/browser-core-canonical-print.pdf) |
| Recursive breaks, widows/orphans, table headers, constrained flex/grid/multicol | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-layout-quality.spec.ts tests/e2e/browser-core-fragmentation.spec.ts tests/e2e/browser-core-breaks.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; 16 scenarios passed; unsupported layouts warn rather than silently approximate | [fragmentation-green.md](../.omo/evidence/browser-publishing-coverage/fragmentation-green.md) |
| Local target references, named strings, experimental footnotes/page floats, convergence and rollback | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-publishing-content.spec.ts tests/e2e/browser-core-lifecycle.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; publishing-content and lifecycle scenarios pass; typed fallback warnings are deterministic | [publishing-content-green.md](../.omo/evidence/browser-publishing-coverage/publishing-content-green.md) |
| Core extension order, sanitizer, resolver policy, decoration, warning freeze, abort and cleanup | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-extensions.spec.ts tests/e2e/manual-core-extension-qa.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; transforms, asset policy, decorators, warning determinism, atomic failure, and Blob revocation are observed | [asset-core-remediation-manual-qa.md](../.omo/evidence/asset-core-remediation/asset-core-remediation-manual-qa.md), [chromium-extension-qa.txt](../.omo/evidence/asset-core-remediation/chromium-extension-qa.txt) |
| EPUB metadata, semantic projection, resolver-only assets, archive limits, abort, latest-generation lifecycle | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-epub.spec.ts tests/e2e/browser-core-lifecycle.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; 5 EPUB scenarios plus lifecycle regression pass; returned Blob is `application/epub+zip` with required OCF entries and no page wrappers/Blob URLs | [epub-export-green.md](../.omo/evidence/browser-publishing-coverage/epub-export-green.md), [epub-export-proof.epub](../.omo/evidence/browser-publishing-coverage/epub-export-proof.epub), [epub-export-archive-report.json](../.omo/evidence/browser-publishing-coverage/epub-export-archive-report.json) |
| Deterministic store-mode ZIP writer and archive characterizations | `CI=true pnpm exec vitest run tests/core/epub-export.test.ts --reporter=verbose` | Exit `0`; 3 unit scenarios pass for entry order, MIME/CRC, and limit/path checks | [epub-export-green.md](../.omo/evidence/browser-publishing-coverage/epub-export-green.md) |
| React canonical iframe, source updates, retained failed generation, imperative handle, print and EPUB action | `CI=1 pnpm exec playwright test tests/e2e/react-adapter.spec.ts --project=chromium` | Exit `0`; 2 scenarios passed; one iframe survives update, handle targets that iframe, unmount clears current document, and disposed actions reject | [docs-react-handle-rerun.md](../.omo/evidence/browser-publishing-coverage/docs-react-handle-rerun.md), [react-imperative-handle-green.md](../.omo/evidence/react-imperative-handle-green.md) |
| Published package docs, exports, legal files, and Core package boundary | `CI=true pnpm build && CI=true pnpm run licenses` | Exit `0`; browser bundles build, package exports are scanned, tarballs contain READMEs/legal files, and all dependencies are allowlisted | [browser-core-pack-final-green.log](../.omo/evidence/browser-core-pack-final-green.log), [browser-core-licenses-final-green.log](../.omo/evidence/browser-core-licenses-final-green.log), [docs-publishing-contract-audit.md](../.omo/evidence/browser-publishing-coverage/docs-publishing-contract-audit.md) |

The evidence paths above are records from the corresponding implementation wave;
rerun the exact command at the final commit when a production lane changes. Do not
replace a missing artifact with an inferred or skipped result.

## Public-surface examples

The package READMEs and root README contain compile-shaped examples for:

- direct Core mount, normalized page options, resolver boundaries, extensions,
  native print, and `PageDocument.exportEpub()`;
- Client's unified Core/Viewer entrypoint and exported EPUB metadata types;
- React's `ImposiaPageViewer` imperative handle and `useImposiaDocument()` hook.

These examples intentionally avoid claiming complete CSS parity, fixed-layout
EPUB, or PDF-byte export. The [compatibility matrix](compatibility.md) is the
source of truth when an example needs a status or boundary.
