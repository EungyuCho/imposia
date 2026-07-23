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
CI=true pnpm bundle:size
CI=true pnpm build
CI=true pnpm test:site
CI=true pnpm test:e2e
CI=true pnpm run audit:prod
CI=true pnpm run licenses
```

`pnpm check` runs the same checks as one command. `pnpm setup:browsers` provisions
Chromium, Firefox, and WebKit. Structural pagination suites are Chromium-reference;
the cross-browser suites assert API shape, iframe/CSP isolation, resolver-only
assets, lifecycle, cleanup, print invocation, and EPUB archive behavior.

The final authoritative serial browser matrix for this release used
`PORT=4180 pnpm exec playwright test --workers=1`: 353 scenarios passed, 112
intentional platform or structural-reference scenarios were skipped, no scenario
failed, and the command exited `0` (465 total scenarios, 3.6 minutes).

## Focused publishing checks

| Scenario | Exact invocation | Binary observable | Captured artifact |
| --- | --- | --- | --- |
| Minified browser consumer routes and gzip budgets | `CI=true pnpm bundle:size` | Exit `0`; six source-level ESM routes report minified and gzip bytes, and every gzip result remains within its named budget | [bundle-size.md](bundle-size.md) and repository terminal output |
| Normalized page media, `@page` selectors, margin boxes, unsupported diagnostics, and print CSS | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-page-media.spec.ts tests/e2e/browser-core-print.spec.ts tests/e2e/browser-core-breaks.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; 8 scenarios passed; native print probe targets the canonical iframe | [page-media-green.md](../.omo/evidence/browser-publishing-coverage/page-media-green.md), [browser-core-canonical-print.pdf](../.omo/evidence/browser-core-canonical-print.pdf) |
| Recursive breaks, widows/orphans, table headers, constrained flex/grid/multicol | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-layout-quality.spec.ts tests/e2e/browser-core-fragmentation.spec.ts tests/e2e/browser-core-breaks.spec.ts tests/e2e/browser-core-complex-table-fragmentation.spec.ts tests/e2e/browser-core-flex-fragmentation.spec.ts tests/e2e/browser-core-grid-fragmentation.spec.ts tests/e2e/browser-core-multicol-fragmentation.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; 22 scenarios passed; unsupported layouts warn rather than silently approximate | [fragmentation-green.md](../.omo/evidence/browser-publishing-coverage/fragmentation-green.md) |
| Horizontal CJK rendered-line fragmentation, language-aware hyphenation fallback, long-token recovery, and vertical overflow fallback | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-cjk-typography.spec.ts` | Exit `0`; Chromium, Firefox, and WebKit preserve Korean/Japanese/Chinese source text and deterministic page membership, retain tagged auto hyphenation, diagnose untagged fallback, recover or surface horizontal inline overflow, and keep overflowing vertical text atomic with typed diagnostics | Repository terminal output |
| Publication warning entry/page locations, unknown-location shape, payload isolation, and generation replacement | `CI=true ./node_modules/.bin/playwright test tests/e2e/publication-diagnostics.spec.ts` | Exit `0`; Chromium, Firefox, and WebKit expose frozen current-generation locations, map fallback warnings to their committed entry and global page, retain explicit `undefined` for unknown fields, and omit raw DOM, script, base-URL, and resolver secrets from serialized warnings | Repository terminal output |
| Local target references, named strings, experimental footnotes/page floats, convergence and rollback | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-publishing-content.spec.ts tests/e2e/browser-core-lifecycle.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; publishing-content and lifecycle scenarios pass; typed fallback warnings are deterministic | [publishing-content-green.md](../.omo/evidence/browser-publishing-coverage/publishing-content-green.md) |
| Core extension order, immutable document/Publication/page metadata, sanitizer, resolver policy, warning provenance, abort and cleanup | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-extensions.spec.ts tests/e2e/manual-core-extension-qa.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; PageDocument transforms, Publication entry transforms, asset policy, decorators, entry/page diagnostics, atomic failure, abort, registered cleanup, and Blob revocation are observed | [asset-core-remediation-manual-qa.md](../.omo/evidence/asset-core-remediation/asset-core-remediation-manual-qa.md), [chromium-extension-qa.txt](../.omo/evidence/asset-core-remediation/chromium-extension-qa.txt) |
| Double-buffered staged updates and per-instance Viewer themes | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-lifecycle.spec.ts tests/e2e/page-viewer.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; the committed generation and its CSS remain visible during pending work, one canonical iframe is retained, the temporary staging iframe is cleaned after commit or abort, theme tokens remain instance-scoped, invalid themes are atomic, and destroy restores host styles | Repository terminal output |
| EPUB metadata, semantic projection, resolver-only assets, archive limits, abort, and latest-generation publishing | `CI=true ./node_modules/.bin/playwright test tests/e2e/browser-core-epub.spec.ts tests/e2e/browser-core-epub-latest.spec.ts tests/e2e/browser-core-lifecycle.spec.ts --project=chromium --workers=1 --reporter=line` | Exit `0`; EPUB archives are `application/epub+zip` with required OCF entries and no page wrappers/Blob URLs. Delayed and superseding updates prove print and export wait for the latest successful commit; destroy aborts and waits for in-flight export. | [epub-export-green.md](../.omo/evidence/browser-publishing-coverage/epub-export-green.md), [epub-export-proof.epub](../.omo/evidence/browser-publishing-coverage/epub-export-proof.epub), [epub-export-archive-report.json](../.omo/evidence/browser-publishing-coverage/epub-export-archive-report.json) |
| Deterministic store-mode ZIP writer and archive characterizations | `CI=true pnpm exec vitest run tests/core/epub-export.test.ts --reporter=verbose` | Exit `0`; 3 unit scenarios pass for entry order, MIME/CRC, and limit/path checks | [epub-export-green.md](../.omo/evidence/browser-publishing-coverage/epub-export-green.md) |
| Caller CSS serialization and production dependency security | `CI=true pnpm exec vitest run tests/core/postcss-security.test.ts && pnpm run audit:prod` | Exit `0`; style terminators are escaped, ordinary CSS is preserved, and no moderate-or-higher production advisory is present | Repository terminal output and registry audit response |
| React canonical iframe, source updates, retained failed generation, imperative handle, print and EPUB action | `CI=1 pnpm exec playwright test tests/e2e/react-adapter.spec.ts --project=chromium` | Exit `0`; one iframe survives source updates, document-option revision replaces the controller deliberately, handles target the current document, unmount clears it, and disposed actions reject | [docs-react-handle-rerun.md](../.omo/evidence/browser-publishing-coverage/docs-react-handle-rerun.md), [react-imperative-handle-green.md](../.omo/evidence/react-imperative-handle-green.md) |
| Publication Reader hierarchy, keyboard/focus behavior, deep-link generations, atomic ownership, responsive panel, and React readiness | `CI=true ./node_modules/.bin/playwright test tests/e2e/publication-reader.spec.ts tests/e2e/publication-adapters.spec.ts` | Exit `0`; Chromium, Firefox, and WebKit consume one canonical frame and the shared outline; stale destinations reject, stable links restore current destinations, callback failure preserves close/focus, and React ready callbacks use the initialized Reader path | Repository terminal output |
| Publication semantic search, result navigation, hidden-content filtering, stale replacement, responsive panel, and React handle | `CI=true ./node_modules/.bin/playwright test tests/e2e/publication-search.spec.ts` | Exit `0`; Chromium, Firefox, and WebKit return immutable committed entry/page/plain-text excerpts, preserve inline text adjacency, include placed footnote text with entry provenance, exclude hidden and scriptable content, navigate through the public destination path in one canonical frame, clear state on destroy, remove stale generation results, and verify the React handle and controller replacement. Chromium additionally verifies 320 px panel geometry. | Repository terminal output |
| Publication page thumbnails, exact navigation, bounded preview, generation replacement, and cleanup | `CI=true ./node_modules/.bin/playwright test tests/e2e/publication-thumbnails.spec.ts` | Exit `0`; Chromium, Firefox, and WebKit project every page of a 48-page committed Publication with at most six abstract line marks per thumbnail, navigate exact global pages, retain one canonical iframe and unchanged page count, reject older-generation models, release controls, listeners, and preview subtrees on destroy, and verify the React handle. Chromium additionally verifies responsive panel geometry. | Repository terminal output |
| Opt-in Viewer diagnostics Inspector, warning navigation, highlight lifecycle, print/EPUB exclusion, disabled parity, React delegation, and packed runtime | `PORT=4180 ./node_modules/.bin/playwright test tests/e2e/viewer-inspector.spec.ts --workers=1 --reporter=line`; `PORT=4180 ./node_modules/.bin/playwright test tests/e2e/react-adapter.spec.ts --grep "React Inspector handles and option toggles" --workers=1 --reporter=line`; `pnpm test:unit` | Exit `0`; Inspector 12/12 and the React handle/toggle 3/3 across Chromium, Firefox, and WebKit, plus unit/packed consumers 18/18, including packed consumers 4/4. A real authored Core warning exposes recovery and trusted fragment bounds; entry-only, global-only, and continuous navigation, named group/panel focus, auxiliary-panel Page keys, presentation-sync cleanup, controlled first-ResizeObserver delivery, three-second expiry, stale bounds, retained-controller destroy errors, and Reader panel exclusion are exercised. Print media and EPUB exclude Inspector UI. Omitted and explicit-false paths match page state, geometry, canonical print target, and EPUB bytes. Packed ESM mounts/selects/destroys Inspector outside workspace aliases. | Repository terminal output |
| Spread cover pairing, responsive fallback, page identity, and visual geometry | `CI=true ./node_modules/.bin/playwright test tests/e2e/spread-cover-mode.spec.ts` | Exit `0`; Chromium, Firefox, and WebKit preserve one canonical iframe, generation, and global page sequence across mode and keyboard navigation. The checked-in Darwin Chromium baselines compare wide-cover and 375 px single-page fallback pixels; Linux CI skips only that platform-specific pixel comparison while retaining all structural spread assertions. | `tests/e2e/spread-cover-mode.spec.ts-snapshots/` and repository terminal output |
| Packed Publication and Reader exports | `CI=true ./node_modules/.bin/vitest run tests/core/packed-publication-adapters.test.ts` | Exit `0`; the fixture builds package dist, packs Core/Viewer/Client/React, executes browser-targeted ESM and CommonJS-authored bundles, and typechecks Reader options/state/controllers, deep-link helpers, and React props/handles from tarball declarations | Repository terminal output |
| Published package docs, exports, legal files, and Core package boundary | `CI=true pnpm build && CI=true pnpm run licenses` | Exit `0`; browser bundles build, package exports are scanned, tarballs contain READMEs/legal files, and all dependencies are allowlisted or match an exact reviewed package exception | [browser-core-pack-final-green.log](../.omo/evidence/browser-core-pack-final-green.log), [browser-core-licenses-final-green.log](../.omo/evidence/browser-core-licenses-final-green.log), [docs-publishing-contract-audit.md](../.omo/evidence/browser-publishing-coverage/docs-publishing-contract-audit.md) |

The evidence paths above are records from the corresponding implementation wave;
rerun the exact command at the final commit when a production lane changes. Do not
replace a missing artifact with an inferred or skipped result.

## Public-surface examples

The package READMEs and root README contain compile-shaped examples for:

- direct Core mount, normalized page options, resolver boundaries, extensions,
  native print, and `PageDocument.exportEpub()`;
- Client's unified Core/Viewer entrypoint, ordered Publication mounting, Reader
  navigation, search, thumbnails, Inspector, and exported EPUB metadata types;
- React's `ImposiaPageViewer` and `ImposiaPublicationViewer` imperative handles,
  revision lifecycles, and document/Publication hooks;
- Viewer spread/cover presentation, current-generation diagnostics, Reader panel
  lifecycle, and independent PDF.js presentation.

These examples intentionally avoid claiming complete CSS parity, fixed-layout
EPUB, or PDF-byte export. The [compatibility matrix](compatibility.md) is the
source of truth when an example needs a status or boundary.
