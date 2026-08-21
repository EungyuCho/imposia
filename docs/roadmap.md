# Product roadmap

This roadmap defines how Imposia should progress from the current `0.5.0`
release commit to a stable public contract. It is for maintainers and
contributors deciding what to build next and what evidence must exist before a
milestone is complete.

The roadmap is ordered by product risk, not by feature count or target date.
Each milestone ends when its exit criteria are satisfied. Calendar estimates
require maintainer capacity and are intentionally outside this document.
Work items reference their Linear issues by `ASA-` identifier; the issue is
the authoritative scope statement, and this document is the authoritative
ordering.

## Milestones are named by outcome, not by version

Earlier revisions of this roadmap labeled milestones with version numbers:
`0.5` meant "a prospective adopter can reproduce Imposia's CSR publishing
advantage". The package version `0.5.0` has now shipped as a security patch, a
breaking parser replacement, and a pagination performance batch — none of
which is that milestone. The two numbering schemes collided, and one of them
had to lose.

The version numbers lose. From this revision on:

- **Milestones are named by outcome** — Publish, Proof, Adoption, Contract —
  and end only when their exit criteria are met.
- **Package versions are release events**, assigned by semantic versioning
  over the public package interfaces and recorded in the CHANGELOG. A
  milestone may span several releases, and a release may carry work from
  several milestones. Neither schedule constrains the other.
- The single exception is `1.0`, which keeps its number because that
  milestone's outcome *is* a version act: declaring the stability contract.

The alternative — renumbering the milestones to chase the released versions —
was rejected because it would repeat this collision every time a release
ships work out of milestone order, exactly as `0.5.0` just did.

## Current position

Imposia `0.5.0` is **public**. All four packages were published to npm on
2026-08-21 from the `v0.5.0` tag, and `main` matches `origin/main`. The
release contains a security patch (bundled `postcss`/`nanoid`, ASA-423), a
breaking replacement of `parse5` with the browser-native parser (ASA-404,
ADR 0013), four fragmenter optimizations (ASA-424, ASA-425, ASA-426,
ASA-427), publishing-pass indexing (ASA-406), a rebuilt cross-engine visual
gate (ASA-432), and the generation-stamp fix for a transient the Viewer had
been classifying as corruption (ASA-438).

**2026-08-21 is the date every exposure clock starts from.** The escape
hatches below are removed one release after exposure, not one release after
commit, so ASA-444 belongs to the first minor that ships after this date.
Consumers on `0.4.1` now have a delivered upgrade path
([`migrations/0.5.0.md`](migrations/0.5.0.md)) and a recorded answer on the
backport question — no `0.4.2` ships, because both advisories were measured
unreachable in the published `0.4.1` browser artifact.

Three of the optimizations ship both the fast path and the implementation it
replaced, selectable through `experimental.forceSequentialPlacement`,
`experimental.forceLegacyLineEnds`, and
`experimental.forceFullConstraintCapture`. The bundle budgets were raised to
absorb the duplication, on the recorded condition that the hatches are removed
one release after they land and the budgets are tightened again
([`bundle-size.md`](bundle-size.md)). That removal is now owned by ASA-444.

The repository has a documented compatibility boundary and an executable
release gate, but its evidence story has known holes: the cited verification
artifacts do not exist in the repo (ASA-429), the performance baseline was
produced by the deleted Node renderer (ASA-428), and no comparison protocol or
representative fixture set exists yet (ASA-433). Imposia should therefore
still be treated as a feature-complete early `0.x` release, not as a mature
replacement for every CSS typesetting or PDF generation workflow.

The primary product position is unchanged:

> Imposia is an embedded browser publishing runtime for React and CSR
> applications that need one completed page document to remain authoritative
> across preview, Reader navigation, native print, and semantic EPUB export.

Vivliostyle Core and Viewer are the primary architecture and publishing
comparison. Paged.js is the primary browser pagination comparison.
`@react-pdf/renderer`, headless-browser PDF generation, and server renderers
are substitutes when PDF bytes or a separate output tree are more important
than a committed browser page document.

## Product constraints

Every milestone must preserve these constraints:

- Core remains the only pagination and committed-document authority.
- React, Viewer, Reader, print, and export do not create a second layout path.
- Browser ESM remains the runtime boundary. A Node renderer, CLI, server
  export, and PDF-byte API remain unsupported unless a later ADR explicitly
  changes the product contract.
- Compatibility claims remain fixture-scoped. Unsupported input warns or
  remains atomic instead of being silently approximated.
- New CSS support, presets, and extension capabilities require a documented
  compatibility boundary and public verification evidence.
- External adoption evidence takes priority over adding another isolated
  feature to an already broad `0.x` surface.

## Milestone map

| Milestone | Product outcome | Exit signal |
| --- | --- | --- |
| Publish | The `0.5.0` release actually reaches consumers, and its recorded debts are settled | Packages public on npm with a migration path; escape hatches removed and budgets re-tightened in the following minor; known failure-visibility gaps warn instead of staying silent |
| Proof | A prospective adopter can reproduce Imposia's CSR publishing advantage | Public proof lab from packed artifacts, representative fixtures, comparison protocol, and reproducible evidence lanes pass independently of this repository's history |
| Adoption | Real adoption blockers drive compatibility and performance work | Accepted external fixtures produce explicit support decisions and regression coverage |
| Contract | The public contract becomes predictable to integrate and extend | Migration policy, deprecation rules, extension guidance, and operational diagnostics are proven |
| `1.0` | Stable API and compatibility boundaries are justified by use | External production evidence, stable upgrade history, and the full release gate support a stability declaration |

## Publish: ship what was built, then settle its debts

Publish is first because every later milestone assumes a public package. The
comparison protocol compares a version people can install; the escape-hatch
clock starts at exposure, not at commit; and an unpublished security patch
protects nobody. Publication happened on 2026-08-21, so the first of those
three is satisfied and the second has started counting. The milestone stays
open until its remaining debts — the hatches, the RTL warning, and the gate's
darwin coverage — are settled.

### Outcome

`0.5.0` is public, consumers on `0.4.1` have a documented path through the
breaking parser change, the security fix has a delivery decision for every
supported line, and the temporary weight the performance batch added to the
bundles is removed on the schedule the repository itself recorded.

### Deliverables

1. **Publication** (ASA-443). Re-run the release gate on the exact public
   commit, write the ASA-404 migration note and the short `0.x` API change
   policy that the previous baseline milestone promised and never delivered,
   decide the 0.4.2 security-backport question on measured advisory severity,
   fix the `SECURITY.md` supported-versions table, push, and publish through
   the OIDC workflow.
2. **Escape-hatch retirement** (ASA-444, in the first minor release after
   publication). Remove `forceSequentialPlacement`, `forceLegacyLineEnds`,
   and `forceFullConstraintCapture` once each hatch's retirement evidence is
   met — equivalence oracles green at the removal commit, no field report
   that needed the hatch during the exposure window, and an ASA-438 outcome
   that does not implicate the fast paths. Re-measure the four Core-bearing
   routes and tighten the budgets back to roughly 5% headroom.
3. **Failure visibility inside the shipped surface.** RTL documents currently
   paginate with the wrong page progression and *no warning* (ASA-434,
   stage 1) — that contradicts the constraint that unsupported input warns
   rather than being silently approximated, so the warning ships ahead of any
   proof claims. The load-dependent Viewer observation of a mid-swap
   generation (ASA-438) is a potential breach of generation integrity inside
   a declared Stable boundary and ranks first under the prioritization rule;
   it must be root-caused or demonstrated pre-existing, not retried away.
4. **Release-state documentation sweep** (ASA-445). The drift Appendix B of
   the architecture overview recorded — the `SECURITY.md` supported-version
   table, `open-source-readiness.md` frozen at `0.4.0`, overview sections
   still describing bundled `parse5`, stale ADR status lines, and the
   superseded manual publish path — is swept and each item marked resolved in
   place, so it stops being rediscovered. What remains open in that appendix
   is genuinely open work, not drift: the missing evidence artifacts (ASA-429)
   and the committed demo-bundle churn (ASA-448).
5. **Published-surface hygiene** (ASA-447). The test-only
   `internalTextSplitTestApi` reaches the public tarball through the
   per-module `dist` files that `files: ["dist"]` publishes, and the
   single-entry `exports` map does not cover CDN or direct-file consumers.
   `0.4.1` already ships that shape, so this does not block publication — but
   the decision is cheapest before exposure grows, and the package-boundary
   gate must assert the test-seam convention before ASA-444 mistakes the seam
   for legacy code it may delete. The sequential line-ends path stays as the
   authoritative fallback even after the hatch is gone.
6. **Release-gate coverage** (ASA-449). The gate runs on `ubuntu-latest`
   only, so a darwin-only breakage stays invisible until the maintainer runs
   the local release gate — which is exactly the ASA-432 failure mode,
   already observed once. A scheduled and dispatchable darwin lane lands
   before the first publication so it covers every release after it. Output
   divergence found on that lane is evidence handed to ASA-435, not a gate
   defect.

### Exit criteria

- All four packages at `0.5.0` are on npm with matching tarball integrity,
  an immutable tag, and a GitHub Release; a cold `npm install` smoke passes.
- A consumer on `0.4.1` can find the migration note and the security-fix
  path for their line without reading commit history.
- The first minor release after publication contains no
  `experimental.force*` hatch, and the four raised budgets are tightened to
  the newly measured sizes.
- An RTL document produces a typed warning naming the recovery taken.
- ASA-438 has a recorded root cause or a recorded pre-existence proof, and
  the diagnostic message carries expected/actual counts and the generation.
- The published core tarball's non-contract deep-module surface has a
  recorded decision, and the package-boundary gate asserts the test-seam
  convention under a mutation check.
- A darwin gate lane exists with a recorded trigger, a first green run with
  pass/skip counts and duration, and no change to the ubuntu lane.

## Proof: prove the React and CSR position

Proof is an evidence and adoption milestone, not a general CSS feature
release. Its deliverables are unchanged from the previous roadmap revision;
what has changed is that most of them now have owners.

### Outcome

A developer can install packed or published packages, run a documented
client-side update scenario, and verify that Imposia keeps the previous
committed generation visible until one complete winning generation replaces
it. The same scenario proves that Viewer navigation and native print target
the winning global page sequence — and every number the project cites in
support is reproducible from a fresh clone.

### Deliverables

1. **Comparison protocol and first representative fixture** (ASA-433).
   Reproducible inputs and observation steps across Imposia, Vivliostyle, and
   Paged.js at exact pinned versions; a report/invoice-class fixture with a
   content-continuity ledger; an intake path for externally supplied
   fixtures. Observed results stay distinct from documented product
   contracts, and absence from another project's documentation is never
   presented as proof of impossibility.
2. **Proof lab completion** (ASA-446). The lab runs from packed package
   artifacts rather than workspace aliases; the public demo gains a
   deterministic failed and superseded-generation procedure that leaves the
   prior commit visible; the manual and long-form publication fixture
   classes join the representative set. The externally supplied fixture can
   only arrive through the intake — until it does, that exit item is
   recorded as unmet rather than papered over. Settle the committed-demo-
   artifact question (ASA-448) first: the checked-in minified bundles turn
   every unrelated Core change into a few hundred lines of diff and couple
   the release gate to that churn, in the same `examples/` tree ASA-446 is
   about to edit. Keeping the commit practice is a valid close, provided the
   no-build browsing benefit is evidenced rather than assumed.
3. **Reproducible evidence lanes.** The twelve cited-but-missing verification
   artifacts are replaced with re-runnable commands and a regeneration script
   (ASA-429); the performance baseline is re-captured by a browser-core
   benchmark harness that lives in the repository (ASA-428).
4. **Measured claims where the docs currently only disclaim.** The
   cross-browser page-structure divergence report turns "parity is not
   promised" into a versioned measurement (ASA-431), and the
   measurement-environment axis — DPR, zoom, headless — is measured against
   the 0.5 px overflow tolerance (ASA-435).
5. **Boundary honesty.** The vertical-writing position is decided and stated
   rather than buried in a Constrained row (ASA-437); fragmentation feedback
   into browser layout (`::first-line`, `text-wrap`, margin collapse) is
   reproduced and classified (ASA-436, stage 1); the untested limit ceilings
   and error paths that implement "warns or remains atomic" gain coverage,
   and warning codes with no emission site are removed (ASA-430).

### Exit criteria

- The proof lab runs from packed package artifacts rather than
  workspace-only aliases.
- Its successful, failed, and superseded revisions retain one canonical
  iframe and never expose a partial generation as current.
- Each representative fixture passes its declared content-continuity ledger
  and records every recovery warning.
- Comparison claims link to a reproducible input, command or browser
  procedure, exact dependency version, and observed result.
- A cold-start adopter can complete one supported integration path without an
  undocumented repository-only step.
- Every performance and parity number the documentation cites is
  reproducible from a fresh clone by a named command.

## Adoption: expand from observed adoption blockers

### Outcome

Compatibility and performance work responds to accepted real-document
evidence instead of pursuing CSS specification breadth without a user
boundary.

### Candidate work

- Promote constrained behavior only when an accepted fixture and
  cross-browser contract justify the change.
- Add opt-in host presets only for repeated, documented recovery policies.
- Take up incremental prefix reuse (ASA-408) only on top of the resident
  benchmark harness (ASA-428) and after the escape hatches are gone
  (ASA-444) — it is explicitly sequenced last among fragmenter changes and
  requires its own ADR.
- Extend RTL from warning to supported page progression (ASA-434, stage 2)
  and mitigate reproduced fragmentation-feedback cases (ASA-436, stage 2)
  when accepted fixtures demonstrate demand.
- Profile long documents for main-thread slice duration, total completion
  time, retained memory, abort latency, and cleanup.
- Improve warning recovery text and Inspector navigation when external
  reports show that the current diagnostic does not support a decision.
- Extend tables, flex, grid, multi-column flow, CJK typography, references,
  or publishing content in the order demonstrated by accepted blockers.

### Exit criteria

- Every compatibility addition has a public fixture, status classification,
  and failure or recovery assertion.
- Performance changes preserve uninterrupted structural parity and atomic
  supersession.
- No promoted capability relies on silent approximation.
- Bundle growth remains within the policy in
  [`bundle-size.md`](bundle-size.md), or the responsible change records an
  approved budget decision.

## Contract: harden the integration contract

### Outcome

Applications can upgrade, extend, observe, and operate Imposia without
relying on private lifecycle details.

### Candidate work

- Publish deprecation periods and package-by-package migration guides,
  extending the `0.x` policy written for the `0.5.0` publication.
- Validate extension examples against sanitizer, resolver, abort, cleanup,
  and immutable metadata boundaries.
- Add operational guidance for progress, timings, warning collection, and
  destroyed-controller failures without introducing a logging authority
  inside Core.
- Expand accessibility evidence for Reader panels, responsive spread
  behavior, keyboard movement, focus restoration, and print exclusion.
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

- A stable public API with an exercised deprecation and migration history —
  including the completed removal of the temporary `experimental.force*`
  surface.
- Multiple independently supplied production-shaped fixtures across the
  primary document classes.
- A compatibility matrix whose Stable claims are backed by public fixtures
  and whose browser split remains explicit. Constrained rows do not need to
  become full CSS parity — they need their declared subsets to be
  evidence-backed, stable across releases, and honest about the fallback
  outside them. Experimental rows (footnotes, page floats) are either
  promoted on evidence or removed; `1.0` ships no permanently experimental
  behavior.
- Reproducible security, package, bundle, browser, print, and EPUB release
  gates.
- No unresolved ownership ambiguity between Core, React, Viewer, Reader,
  print, and export.
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

Vertical writing (縦書き) pagination is pending the ASA-437 product decision;
until that decision records otherwise, it should be treated as outside the
roadmap and stated as such wherever Japanese-language support is described.

Reconsidering any item requires a product decision and an ADR that explains
why the browser-only committed-document contract is no longer sufficient.

## Prioritization rule

When two tasks compete, choose the first task that satisfies the highest item
in this list:

1. fixes loss, duplication, reordering, stale-generation exposure, or
   ownership drift inside a declared compatibility boundary;
2. enables an external adopter to reproduce, integrate, or diagnose the
   current product;
3. resolves an accepted real-document compatibility or performance blocker;
4. reduces maintenance cost without changing the product contract;
5. adds a new capability with no demonstrated adoption blocker.

Under this rule, ASA-438 outranked every open feature and evidence task and
is now closed: the transient was root-caused, shown to predate `0.5.0`, and
fixed without loosening the invariant. The publication work (ASA-443) that
outranked new capability outright is likewise done. What the rule now
promotes is the Publish milestone's remaining debts — ASA-444 and ASA-434
stage 1 under item 1, ASA-449's gate coverage under item 4 — ahead of any
Proof-milestone evidence task, and ASA-450 ahead of ASA-444 because the
rollback contract needs its regression pin before that refactor edits the
same region.

## Verification notes

- **Verified from this repository and from npm (2026-08-21):** the `0.5.0`
  release commit `364e491`, all four packages resolving to `0.5.0` on the
  registry, the `v0.5.0` tag, `main` matching `origin/main`, the escape-hatch
  and budget state recorded in [`bundle-size.md`](bundle-size.md), the
  product contract, the compatibility matrix, and the release-gate
  structure.
- **Roadmap decision:** milestones are named by outcome and decoupled from
  package versions; `1.0` alone keeps its number. Publish precedes Proof
  because exposure, not commit, starts every downstream clock.
- **Ticket sweep (2026-08-21):** every `ASA-` identifier this document cites
  exists in Linear. The three open Imposia tickets filed after the roadmap
  reset are now placed: ASA-447 and ASA-449 under Publish, ASA-448 ahead of
  ASA-446 under Proof. None of the three blocks the ASA-443 publication
  itself.
- **Not yet verified:** external production adoption, independent comparison
  results, the representative fixture set, and the post-removal bundle
  sizes. They are milestone deliverables, not current claims.
- **Revisit condition:** update this roadmap when a milestone exit criterion
  changes, a product-boundary ADR is accepted, or external evidence
  invalidates the current priority order.
