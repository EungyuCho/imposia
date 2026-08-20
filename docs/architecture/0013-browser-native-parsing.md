# ADR 0013: browser-native string-domain parsing

Status: accepted

## Context

`prepareDocument`, `prepareDecoration`, and `prepareExtensionInput` normalize
and sanitize authored HTML in the string domain before any staging iframe
exists. That pass was implemented with parse5 (`parse`, `parseFragment`,
`serialize`, all with `sourceCodeLocationInfo: true`).

parse5 plus its transitive `entities` dependency accounted for roughly 46% of
the minified Core browser bundle: the Core · PageDocument consumer route
measured 105.9 KiB gzip with parse5 and 58.6 KiB gzip without it. By
comparison, removing the entire EPUB implementation saves only 5.2 KiB gzip.

An audit established the actual load-bearing surface of parse5:

- The only consumer of `sourceCodeLocation` was `nodeOrder()` in
  `html-policy.ts`, whose value feeds (1) the warning sort key ("authored
  source order"), (2) embedded decoration ordering, and (3) the numeric
  `sourceIndex` of the single `PAGE_RULE_UNSUPPORTED` warning code. Every
  other `sourceIndex` in the pipeline is a plain counter.
- The live-DOM inspector path (`pageWarningTargetBounds`, viewer inspector)
  keys off `sourceIdentity` from `data-imposia-publishing-source` markers and
  never reads string-domain offsets; `sourceIndex` is dropped when a
  `DocumentWarning` is promoted to a `PageWarning`.

## Decision

Core parses the string domain with the browser's native parser:

- Documents: `new DOMParser().parseFromString(html, "text/html")`.
- Fragments (decoration templates): `template.innerHTML` on a `<template>`
  created in a parser-created inert document. parse5's context-free
  `parseFragment` also used a `<template>` context internally, so table
  fragments such as `<tr>`/`<td>` parse identically.
- Serialization: `documentElement.outerHTML` / `template.innerHTML`, with the
  `<!DOCTYPE html>` prefix attached explicitly (exotic authored doctypes are
  normalized to the standard doctype; parse5 used to preserve them verbatim).

`nodeOrder()` becomes a document-order slot assigned in one traversal after
parsing (template contents included), spaced by a stride larger than the
maximum input size so intra-element character offsets (CSS declaration
offsets, decoration token offsets) still interleave into the same ordering
scheme. parse5 and the `entities` package leave the Core dependency graph and
`THIRD_PARTY_NOTICES.md`.

## Consequences

### Ordering contract weakens from source offsets to document order

Warnings were ordered by source character offset; they are now ordered by
post-recovery document order. The two orders agree except where HTML error
recovery moves content (for example foster-parented table content), where the
recovered document order wins. Warning `sourceIndex` values that were plain
counters are unchanged; the numeric value of `PAGE_RULE_UNSUPPORTED.sourceIndex`
changes because it derives from the ordering key.

### The prepare stage becomes browser-only

`prepareDocument`, `prepareDecoration`, and `prepareExtensionInput` now
require a DOM (`DOMParser`, `<template>`). These were the only Core APIs that
happened to run under Node; the public contract has always been "browser ESM
is the runtime boundary", and the roadmap reaffirms it. Unit tests for the
prepare stage run under a DOM test environment (`happy-dom`); everything
downstream already required a browser.

### Security posture is unchanged

The string-domain pass is defense in depth, not the load-bearing barrier. The
pipeline already trusts the native parser in two later stages
(`page-document-sanitize-resolver-input.ts`, `page-document-sanitize.ts`), and
every prepared document is re-sanitized in the staging iframe before commit.
`DOMParser` documents and template contents have no browsing context: scripts
never execute and subresources are never fetched while markup is being
sanitized. No existing ADR (0005, 0006, clean-room policy) requires a
non-DOM parser; ADR 0004's browser-first target makes the native parser the
canonical authority for HTML error recovery, and parser error-recovery parity
across Chromium, Firefox, and WebKit is pinned by a dedicated cross-engine
test (`tests/e2e/browser-core-parsing-parity.spec.ts`).

### Bundle effect

Core · PageDocument drops from 105.9 KiB to ≤ 60 KiB gzip (measured 58.5 KiB
at the time of this decision). Budget re-baselining is tracked separately in
`docs/bundle-size.md`.
