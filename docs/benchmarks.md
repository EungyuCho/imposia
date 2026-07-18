# Benchmarks

The benchmark measures the legacy `@imposia/node` PDF renderer with pinned Chromium and verifies exact 10, 50, and 200-page A4 output for a deterministic local workload containing embedded font data, SVG images, tables, headings, and body text. It performs three cold renderer runs and seven warm renders after an unmeasured warm-up for each size. It does not benchmark the current browser-Core canonical paginator.

The schema records OS release, architecture, CPU, logical CPU count, memory, Node, Playwright, and Chromium versions. Comparison stops when the stable-host identity differs. To reject real regressions without treating small host jitter as one, totals use paired percentage and absolute limits: warm total regresses only when it is both more than 25% and more than 150 ms slower; cold total regresses only when it is both more than 35% and more than 500 ms slower. A phase whose baseline is at least 100 ms regresses only when it is both more than 40% and more than 100 ms slower; smaller phases remain diagnostic rather than gating.

Pinned Apple M1 Max baseline:

| Pages | Cold total (ms) | Warm total (ms) | Resources (ms) | Print preparation (ms) | PDF generation (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 270.52 | 105.50 | 22.76 | 3.75 | 15.20 |
| 50 | 331.56 | 145.88 | 30.49 | 5.94 | 43.34 |
| 200 | 472.09 | 331.77 | 62.16 | 14.80 | 159.21 |

`resourceWaitMs` includes document loading, print-resource discovery through forced layout, request settlement, and font readiness. `printPreparationMs` measures the final preflight layout after the resources-ready hook. `pdfGenerationMs` includes page-side marker discovery when needed, Chromium print pagination, and PDF serialization; Chromium does not expose a trustworthy timing boundary between those operations.

`pnpm benchmark:update` explicitly writes a new schema-validated baseline. Every benchmark invocation removes any earlier comparison receipt before work begins, so a failed or interrupted run cannot leave a stale pass behind. A subsequent independent `pnpm benchmark` never changes that baseline and writes `artifacts/evidence/benchmark-comparison.json` only on success, with the threshold-policy identifier, current performance-source hash, baseline SHA-256, current report SHA-256, environment, timestamp, command, and pass result. The source hash covers the legacy `@imposia/node` PDF renderer, its Core dependencies, the benchmark implementation and policy, manifests, lockfile, and shared TypeScript configuration. The requirement audit recomputes all three hashes against the final tree. Benchmark comparison rejects `IMPOSIA_CHROMIUM_EXECUTABLE` so its pinned-runtime identity cannot describe a different executable.
