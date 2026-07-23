# Open-source readiness

This list records the current launch boundary for Imposia. The browser library
is ready for a maintainer-reviewed `0.1.2` patch release. Repository rules, the
protected release environment, private vulnerability reporting, dependency
alerts, code scanning, secret scanning, and automatic pull-request review are
enabled. npm trusted publishing and the protected release workflow were proven
by the synchronized `0.1.1` package release.

## Implemented client release gate

- Browser-only package boundaries, legal files, clean-room policy, and package
  dry-run verification.
- Private vulnerability reporting policy, contributor conduct policy, production
  dependency audit gate, and CSS serialization regression coverage.
- One persistent canonical iframe plus a temporary noncanonical staging iframe,
  with atomic commit, failed-update rollback, and deterministic resource cleanup.
- Consumer-owned CSS theme modules and per-instance runtime theme tokens.
- Ordered Publication snapshots with one global page sequence, shared outline,
  stable destinations, entry page ranges, atomic updates, and reflowable EPUB
  navigation from the same semantic authority.
- A framework-neutral Reader and React adapter with table of contents, deep
  links, semantic search, bounded thumbnails, single/continuous/spread modes,
  cover pairing, and an opt-in diagnostics Inspector.
- Explicit supported subsets for flex, grid, complex tables, multi-column flow,
  and CJK typography. Unsupported cases retain typed, source-aware recovery
  warnings instead of silently approximating output.
- Capability-bounded extensions that cannot take ownership of the canonical DOM,
  resolver, or lifecycle.
- Public browser conformance and performance fixtures, packed ESM/CommonJS/React
  consumers, and a Chromium/Firefox/WebKit release matrix.
- English, Korean, Japanese, and Simplified Chinese onboarding guides and
  homepage copy audited for the same public identifiers and lifecycle facts.

## Post-release engineering follow-ups

These refinements are useful, but they do not block the `0.1.2` patch release:

1. Consolidate the duplicated PDF/Page Viewer toolbar construction behind one
   internal Viewer interface factory while retaining separate document adapters.
2. Isolate the latest-generation scheduler only when the extraction removes the
   current duplicated async bookkeeping; do not add a second rendering authority.
3. Automate the current localized README structure, identifier, link, and
   lifecycle-fact audit so future documentation changes cannot drift silently.

## Maintainer launch gates

- Run `CI=true pnpm check` on the exact public commit with all three Playwright
  browser projects and the production registry audit available.
- Verify the `SECURITY.md` private-reporting route from a non-maintainer account.
- Run the protected `Release` workflow from `main`, approve the environment only
  after its verification job passes, and confirm npm provenance for all four
  packages.
- Install the published tarballs in a clean consumer project and confirm the
  `v0.1.2` GitHub Release contains matching package assets and checksums.
