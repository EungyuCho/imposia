# Product roadmap

This roadmap defines how Imposia should progress from the current `0.4.0`
browser publishing release to a stable public contract. It is for maintainers
and contributors deciding what to build next and what evidence must exist before
a milestone is complete.

The roadmap is ordered by product risk, not by feature count or target date.
Each milestone ends when its exit criteria are satisfied. Calendar estimates
require maintainer capacity and are intentionally outside this document.

## Current position

Imposia `0.4.0` is a React-first, browser-only HTML/CSS pagination and
publishing library. Core prepares one candidate generation in a temporary
noncanonical staging iframe and atomically commits a successful result into one
persistent canonical iframe. Viewer presentation, Reader navigation,
diagnostics, native print, and semantic EPUB export address that committed
generation.

The repository has a documented compatibility boundary and an artifact-backed
browser release matrix. This proves the behavior of the declared fixtures; it
does not prove broad compatibility with arbitrary production documents or
long-term external adoption. Imposia should therefore be treated as a
feature-complete early `0.x` release, not as a mature replacement for every CSS
typesetting or PDF generation workflow.

The primary product position is:

> Imposia is an embedded browser publishing runtime for React and CSR
> applications that need one completed page document to remain authoritative
> across preview, Reader navigation, native print, and semantic EPUB export.

Vivliostyle Core and Viewer are the primary architecture and publishing
comparison. Paged.js is the primary browser pagination comparison.
`@react-pdf/renderer`, headless-browser PDF generation, and server renderers are
substitutes when PDF bytes or a separate output tree are more important than a
committed browser page document.

## Product constraints

Every milestone must preserve these constraints:

- Core remains the only pagination and committed-document authority.
- React, Viewer, Reader, print, and export do not create a second layout path.
- Browser ESM remains the runtime boundary. A Node renderer, CLI, server export,
  and PDF-byte API remain unsupported unless a later ADR explicitly changes the
  product contract.
- Compatibility claims remain fixture-scoped. Unsupported input warns or
  remains atomic instead of being silently approximated.
- New CSS support, presets, and extension capabilities require a documented
  compatibility boundary and public verification evidence.
- External adoption evidence takes priority over adding another isolated
  feature to an already broad `0.x` surface.

## Milestone map

| Milestone | Product outcome | Exit signal |
| --- | --- | --- |
| `0.4.x` | The released baseline and public documentation agree | Release state, package versions, localized facts, and verification commands are consistent |
| `0.5` | A prospective adopter can reproduce Imposia's CSR publishing advantage | Public proof lab, representative fixtures, comparison protocol, and integration paths pass from packed packages |
| `0.6` | Real adoption blockers drive compatibility and performance work | Accepted external fixtures produce explicit support decisions and regression coverage |
| `0.7–0.8` | The public contract becomes predictable to integrate and extend | Migration policy, deprecation rules, extension guidance, and operational diagnostics are proven |
| `1.0` | Stable API and compatibility boundaries are justified by use | External production evidence, stable upgrade history, and the full release gate support a stability declaration |

## `0.4.x`: align the released baseline

### Outcome

Public documentation describes the released `0.4.0` packages rather than a
pre-release state, and automated checks prevent the same facts from drifting
across languages and package entry points.

### Deliverables

1. Record `0.4.0` as released in the open-source readiness document and preserve
   the completed launch checks as release evidence.
2. Automate the existing README and site audit for package identifiers, links,
   supported lifecycle claims, and version-independent public facts.
3. Define a short `0.x` API change and migration policy. A breaking change must
   identify the affected package, replacement path, and release note.
4. Extract scheduler bookkeeping only if the change removes duplication without
   adding another rendering authority or weakening abort and cleanup behavior.

### Exit criteria

- The root and package manifests expose one released version.
- English, Korean, Japanese, and Simplified Chinese public entry points pass the
  same structural documentation audit.
- The exact public commit passes the complete release gate in
  [`verification.md`](verification.md).
- No documentation describes an already published release as pending.

## `0.5`: prove the React and CSR position

`0.5` is the next product milestone. It is an evidence and adoption release,
not a general CSS feature release.

### Outcome

A developer can install packed or published packages, run a documented
client-side update scenario, and verify that Imposia keeps the previous
committed generation visible until one complete winning generation replaces it.
The same scenario proves that Viewer navigation and native print target the
winning global page sequence.

### Deliverables

1. **Public CSR proof lab**
   - Run at least three rapid source revisions through the React adapter.
   - Expose the committed generation, provisional progress, canonical iframe
     identity, page count, and flattened source-continuity ledger.
   - Provide a deterministic failure or supersession case that leaves the prior
     commit visible.
2. **Comparison protocol**
   - Publish inputs and observation steps that can be run independently with
     Imposia, Vivliostyle, and Paged.js.
   - Record the exact compared versions and distinguish observed results from
     documented product contracts.
   - Do not present absence from another project's documentation as proof that a
     behavior is impossible.
3. **Representative document fixtures**
   - Cover at least three document classes, such as an invoice or report, a
     manual, and a multi-entry long-form publication.
   - Include at least one fixture supplied or materially adapted from outside
     the maintainer-authored showcase.
   - Record expected content continuity, known constrained behavior, warnings,
     and print observations for every fixture.
4. **Adoption paths**
   - Provide a React/Vite path and a client-only React framework path.
   - Explain browser-only boundaries, asset resolution, source revisions,
     failure handling, native print, and EPUB export.
   - Add an issue intake template that captures a minimal source, browser,
     expected page behavior, actual page behavior, and emitted warnings.

### Work in progress

As of 2026-07-25, the public React demo's pressure run records requested,
committed, and superseded revisions; exact content continuity; blank-page
checks; provisional progress; and canonical iframe identity. The Chromium
showcase test verifies those observations against the workspace build.

This is the first `0.5` proof-lab slice, not the milestone exit. The next slice
must add a deterministic failed or superseded-generation procedure that proves
the prior commit remains visible. The complete lab must then run from packed
package artifacts before it can satisfy the `0.5` exit criteria.

### Exit criteria

- The proof lab runs from packed package artifacts rather than workspace-only
  aliases.
- Its successful, failed, and superseded revisions retain one canonical iframe
  and never expose a partial generation as current.
- Each representative fixture passes its declared content-continuity ledger and
  records every recovery warning.
- Comparison claims link to a reproducible input, command or browser procedure,
  exact dependency version, and observed result.
- A cold-start adopter can complete one supported integration path without an
  undocumented repository-only step.

## `0.6`: expand from observed adoption blockers

### Outcome

Compatibility and performance work responds to accepted real-document evidence
instead of pursuing CSS specification breadth without a user boundary.

### Candidate work

- Promote constrained behavior only when an accepted fixture and cross-browser
  contract justify the change.
- Add opt-in host presets only for repeated, documented recovery policies.
- Profile long documents for main-thread slice duration, total completion time,
  retained memory, abort latency, and cleanup.
- Improve warning recovery text and Inspector navigation when external reports
  show that the current diagnostic does not support a decision.
- Extend tables, flex, grid, multi-column flow, CJK typography, references, or
  publishing content in the order demonstrated by accepted blockers.

### Exit criteria

- Every compatibility addition has a public fixture, status classification, and
  failure or recovery assertion.
- Performance changes preserve uninterrupted structural parity and atomic
  supersession.
- No promoted capability relies on silent approximation.
- Bundle growth remains within the policy in
  [`bundle-size.md`](bundle-size.md), or the responsible change records an
  approved budget decision.

## `0.7–0.8`: harden the integration contract

### Outcome

Applications can upgrade, extend, observe, and operate Imposia without relying
on private lifecycle details.

### Candidate work

- Publish deprecation periods and package-by-package migration guides.
- Validate extension examples against sanitizer, resolver, abort, cleanup, and
  immutable metadata boundaries.
- Add operational guidance for progress, timings, warning collection, and
  destroyed-controller failures without introducing a logging authority inside
  Core.
- Expand accessibility evidence for Reader panels, responsive spread behavior,
  keyboard movement, focus restoration, and print exclusion.
- Add ecosystem adapters only when they retain the same Core controller and
  canonical iframe.

### Exit criteria

- At least one minor-version upgrade is documented and verified from packed
  packages.
- Public extensions and adapters cannot bypass Core ownership.
- Accessibility and lifecycle regressions are covered through real browser
  surfaces.
- Consumers can diagnose supported, constrained, and unsupported outcomes
  without inspecting private DOM.

## `1.0`: declare stability from evidence

### Required evidence

- A stable public API with an exercised deprecation and migration history.
- Multiple independently supplied production-shaped fixtures across the primary
  document classes.
- A compatibility matrix whose Stable claims are backed by public fixtures and
  whose browser split remains explicit.
- Reproducible security, package, bundle, browser, print, and EPUB release gates.
- No unresolved ownership ambiguity between Core, React, Viewer, Reader, print,
  and export.
- A maintained path for reporting private vulnerabilities and public
  compatibility failures.

`1.0` must not be declared from internal scenario count or feature breadth
alone.

## Outside the current roadmap

The following work remains outside the accepted product direction:

- Node or command-line rendering;
- server-side publishing;
- direct PDF-byte generation;
- fixed-layout EPUB;
- an authored-content editor;
- an EPUB reading engine;
- complete CSS fragmentation parity;
- a second preview, print, export, or framework-owned pagination authority.

Reconsidering any item requires a product decision and an ADR that explains why
the browser-only committed-document contract is no longer sufficient.

## Prioritization rule

When two tasks compete, choose the first task that satisfies the highest item in
this list:

1. fixes loss, duplication, reordering, stale-generation exposure, or ownership
   drift inside a declared compatibility boundary;
2. enables an external adopter to reproduce, integrate, or diagnose the current
   product;
3. resolves an accepted real-document compatibility or performance blocker;
4. reduces maintenance cost without changing the product contract;
5. adds a new capability with no demonstrated adoption blocker.

## Verification notes

- **Verified from this repository:** the `0.4.0` package versions, product
  contract, compatibility matrix, release gate, canonical iframe lifecycle,
  Reader surface, native print boundary, and semantic EPUB boundary.
- **Roadmap decision:** `0.5` prioritizes public proof and adoption paths over
  general CSS expansion.
- **Not yet verified:** external production adoption, independent comparison
  results, and the proposed representative fixture set. They are milestone
  deliverables, not current claims.
- **Revisit condition:** update this roadmap when a milestone exit criterion
  changes, a product-boundary ADR is accepted, or external evidence invalidates
  the current priority order.
