# ADR 0011: make HTML/CSR pagination integrity the primary product contract

Status: accepted

## Context

Imposia already paginates browser HTML and CSS, retains one canonical iframe,
stages source updates, exposes typed recovery warnings, presents the committed
pages through Viewer and React, invokes native print, and projects the retained
semantic source into reflowable EPUB.

Listing those surfaces as peers obscures the reason an application adopts the
runtime. A client-rendered editor, report builder, or publishing tool first
needs to turn its current HTML and CSS into pages without exposing a partial
layout, losing source order, or letting preview, navigation, and print describe
different documents. EPUB export is useful, but it does not establish that
browser pagination contract.

The phrase "CSR input" also needs a precise boundary. The host application may
use client-side rendering to produce and update HTML or light-DOM source.
Imposia receives the resulting source value. Core does not execute authored
scripts, take ownership of application state, or capture an arbitrary running
application DOM.

## Decision

HTML/CSS pagination integrity is Imposia's primary product contract.

For behavior declared Stable or within a documented Constrained subset, a
committed generation must satisfy these invariants:

1. **Content integrity:** visible authored content represented by the public
   conformance fixture appears exactly once and remains in source order across
   the committed page sequence.
2. **Page-sequence integrity:** page metadata, page membership, destinations,
   located warnings, Viewer state, and native print address the same immutable
   global page sequence.
3. **Generation integrity:** presentation and print observe only the latest
   successful committed generation. A staged generation cannot become a second
   presentation authority.
4. **Update integrity:** failure, cancellation, or supersession preserves the
   previous committed generation when one exists. A successful candidate
   replaces it through one atomic commit.
5. **Failure visibility:** input outside the declared support boundary remains
   atomic, uses the documented recovery, or emits a typed warning. Imposia does
   not describe an approximate result as complete CSS support.

Core remains the layout authority. `@imposia/react` adapts host state to Core
source updates and retains the same controller and iframe. `@imposia/viewer`
presents the committed pages without cloning or repaginating them.

A global page number is stable only within its committed generation. Content
edits may change page count and page membership. Stable Publication destination
identifiers can resolve against a newer generation, while retained
controller-and-generation-scoped objects must reject stale use. Imposia does
not promise that edited content keeps the same physical page number.

Chromium remains the structural pagination reference. Firefox and WebKit must
preserve the documented API, isolation, lifecycle, rollback, cleanup,
navigation, print-invocation, and export contracts. Exact cross-browser page
count or pixel parity is not part of this decision.

Reflowable EPUB remains a supported semantic projection of the committed
source. It is not the primary product promise, a fixed-layout copy of the
browser pages, or a second pagination authority.

## Public proof requirements

Public claims must be no stronger than reproducible evidence. The release proof
for this decision must exercise distributed browser packages through public
interfaces and record:

- source markers or source ranges appearing exactly once in committed pages;
- monotonic source order and page membership across every page boundary;
- page count, page metadata, warning locations, and the canonical iframe for
  the same generation;
- rapid source updates in which only the winning generation becomes visible;
- failed, cancelled, and superseded updates retaining the previous commit;
- unsupported or overflowing input producing the documented warning and
  recovery instead of an unqualified success result;
- Viewer navigation and native print targeting the committed canonical iframe;
- the browser, fixture revision, page geometry, timings, and compatibility
  status needed to reproduce the observation.

Marker coverage is evidence for the marked fixture, not proof for arbitrary
HTML and CSS. Adding a new Stable or Constrained layout subset requires a
minimal fixture that demonstrates its legal page boundaries and its fallback
outside those boundaries.

## Consequences

- Product introductions lead with committed browser pages and pagination
  integrity. React integration, diagnostics, native print, and EPUB explain how
  that contract is consumed.
- Performance and atomic lifecycle measurements remain necessary, but neither
  substitutes for content and page-boundary evidence.
- Documentation must distinguish supported pagination from diagnosed fallback.
  It must not claim that arbitrary HTML/CSS can never overflow or that all
  browsers produce identical pages.
- CSR examples pass complete source values or immutable Publication snapshots.
  They do not imply that Core executes application JavaScript or snapshots an
  uncontrolled live DOM.
- Viewer, print, search, thumbnails, diagnostics, and export may not introduce a
  second committed layout authority.

## Rejected alternatives

### Lead with EPUB export

EPUB broadens the publishing workflow, but a semantic reflowable archive does
not prove browser page boundaries or client-update behavior. Leading with EPUB
would make the secondary projection obscure the runtime's differentiating
contract.

### Lead with atomic updates alone

Atomic commit prevents partial generations from becoming visible, but it does
not by itself prove that a successful generation preserved content and legal
page boundaries. Atomic lifecycle is one required mechanism of pagination
integrity, not the complete product promise.

### Promise lossless pagination for arbitrary HTML/CSS

CSS fragmentation has layout-specific boundaries, and Imposia deliberately
documents Constrained, Experimental, and Unsupported behavior. An absolute
claim would contradict the compatibility matrix and make typed fallback
indistinguishable from a defect.

### Preserve physical page numbers across edits

Changing content or page geometry can legally move later content. Preserving a
number would either misidentify the new page or require a second identity
model. Stable semantic destinations and generation-scoped page identity provide
the required navigation contract without making an invalid geometry promise.

## Verification notes

- **Verified:** the public conformance corpus asserts one canonical iframe,
  marker uniqueness, source order, monotonic page membership, documented
  warnings, and cleanup through `mountPageDocument()`.
- **Verified:** Core paginates in a temporary staging iframe, commits into one
  persistent canonical iframe, removes staging state, and retains the previous
  commit after failure, cancellation, or supersession.
- **Verified:** Viewer navigation, diagnostics, thumbnails, search, React, and
  native print consume the committed controller, iframe, page metadata, or
  global page sequence without rerunning pagination.
- **Verified:** [`docs/compatibility.md`](../compatibility.md) limits structural
  pagination to a Chromium reference and identifies constrained overflow and
  unsupported layout behavior.
- **Required follow-up:** extend the public proof from fixture marker membership
  to explicit source-range continuity at page boundaries and publish a rapid
  CSR update walkthrough before using stronger "no missing content" language in
  launch material.
