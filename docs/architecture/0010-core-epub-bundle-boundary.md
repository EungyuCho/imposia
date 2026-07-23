# ADR 0010: keep EPUB export in Core behind bundle budgets

Status: accepted for the 0.1.x browser contract.

## Context

`PageDocument.exportEpub()` and Publication export project the latest committed
semantic source into a reflowable EPUB archive. The exporter reads private Core
state: the retained semantic snapshot, resolver-owned asset bytes, Publication
entries, and the authoritative Publication outline.

The exporter occupies 855 lines in `epub-export.ts` and 180 lines in
`epub-zip.ts`. File length alone does not show its consumer cost, so the decision
uses a minified browser bundle measurement.

On 2026-07-23, the committed `pnpm bundle:size` diagnostic replaced the two EPUB
export functions with throwing stubs while preserving their names and async
contract in the surrounding Core entry path:

| Measurement | Full Core | EPUB stubs | Difference |
| --- | ---: | ---: | ---: |
| Minified | 371.1 KiB | 354.0 KiB | 17.1 KiB |
| Gzip | 108.3 KiB | 103.0 KiB | 5.4 KiB |
| Brotli | 91.7 KiB | 87.3 KiB | 4.5 KiB |

The committed bundle command prints both the named consumer-route budgets and
this diagnostic. See
[`docs/bundle-size.md`](../bundle-size.md).

## Decision

Keep EPUB export inside `@imposia/core` and preserve the existing
`PageDocument.exportEpub()`, Publication export, Client re-export, and React
imperative-handle contracts.

Do not expose the semantic snapshot, retained asset bytes, private Publication
markers, or Core resource lifecycle through a general plugin interface. The
existing ordered `PageExtension` contract remains a generation policy seam; it
does not become an export ownership seam.

Run `pnpm bundle:size` in the repository check so size growth is visible before
release. Revisit optional packaging or a lazy export boundary when at least one
of these conditions is true:

1. the EPUB implementation exceeds 10 KiB gzip in the same diagnostic;
2. the `Core · PageDocument` route exceeds its budget and EPUB is the largest
   removable source contribution;
3. a second independently shipped exporter needs the same trusted semantic
   projection interface.

## Rejected alternatives

### Optional `@imposia/epub` package now

This would remove about 5.4 KiB gzip from the current Core route, but it needs a
new privileged interface across Core's semantic, asset, abort, cleanup, and
Publication navigation boundaries. It would also require a compatibility plan
for existing Core and React methods. The interface cost and public churn exceed
the measured saving.

### General exporter plugin

A general exporter hook would grant more authority than the current extension
contract and would be speculative with only one exporter. It risks turning
private semantic and resource state into a permanent public interface.

### Remove EPUB export

EPUB is part of the accepted browser publishing contract in ADR 0006. Removing
it would break an implemented and tested public capability rather than improve
its packaging.

## Consequences

- Applications that use Core pagination continue to include about 5.4 KiB gzip
  of EPUB implementation.
- Existing Core, Client, Publication, and React APIs remain compatible.
- Core keeps one semantic and resource authority; no plugin can retain private
  assets or bypass export limits.
- Bundle budgets make future growth explicit. Crossing a revisit condition
  starts a new architecture decision; it does not automatically authorize a
  breaking package split.

## Verification notes

- **Verified:** the byte table is reproduced by `pnpm bundle:size` using
  repository-pinned `esbuild` 0.28.1; gzip uses level 9.
- **Verified:** `epub-export.ts` imports the retained semantic snapshot and
  resolver-asset helpers, while `page-document.ts`, `publication.ts`, and the
  React Viewer handles expose EPUB through their existing lifecycle.
- **Inferred:** an optional package needs a new trusted interface or a breaking
  move of the current methods. No prototype of that interface was implemented.
