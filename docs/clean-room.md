# Clean-room policy and provenance

Imposia is independently authored. Product behavior is derived from repository
requirements and public Web, CSS, and EPUB contracts. Competitor public
documentation may inform only a high-level capability inventory (for example,
whether a category such as running content or EPUB export is worth evaluating);
it is not an implementation, API, architecture, test, fixture, naming, or
behavioral reference. Implementation code, fixtures, and independently authored
tests must be written from the requirements and the standards below.

Contributors must not inspect, copy, translate, port, or adapt third-party
paged-layout implementation source, tests, fixtures, bundles, comments, names,
or architecture. A public capability label is not evidence of how Imposia should
implement that capability.

## Public contracts used

The following primary references were consulted on 2026-07-19. Links are kept
here so a reviewer can audit the public contract behind a decision without
relying on private reasoning or undocumented material.

### CSS pagination and generated content

- [CSS Fragmentation Module Level 3](https://www.w3.org/TR/css-break-3/) for
  fragmentainers, nested fragmentation, breaks, page-break aliases, widows, and
  orphans.
- [CSS Fragmentation Module Level 4](https://www.w3.org/TR/css-break-4/) for the
  current fragmentation terminology and break model under active revision.
- [CSS Paged Media Module Level 3](https://www.w3.org/TR/css-page-3/) for page
  boxes, page selectors, page size, margins, and paged-media terminology.
- [CSS Generated Content Module Level 3](https://www.w3.org/TR/css-content-3/)
  for generated content and counter vocabulary.
- [CSS Generated Content for Paged Media Module](https://www.w3.org/TR/css-gcpm-3/)
  for named strings, running content, and page-margin content concepts.
- [CSS Page Floats](https://www.w3.org/TR/css-page-floats-3/) for the opt-in
  page-float boundary and fallback rationale.
- [CSS Table Module Level 3](https://www.w3.org/TR/css-tables-3/) for table
  wrappers, row groups, row boundaries, and repeated header semantics.
- [CSS Multi-column Layout Module Level 1](https://www.w3.org/TR/css-multicol-1/)
  for column fragmentation and the constrained multi-column subset.
- [CSS Flexible Box Layout Module Level 1](https://www.w3.org/TR/css-flexbox-1/)
  for the safe flex direction/wrapping subset and unsupported contexts.
- [CSS Grid Layout Module Level 2](https://www.w3.org/TR/css-grid-2/) for
  explicit-track, spanning, and grid-fragmentation boundaries.

### Platform and EPUB contracts

- [HTML Standard: scrolling to a fragment](https://html.spec.whatwg.org/multipage/browsing-the-web.html#scroll-to-fragid)
  for same-document fragment references.
- [DOM Standard: the `id` concept](https://dom.spec.whatwg.org/#concept-id) for
  source-order identity and duplicate-ID diagnostics.
- [EPUB 3.3](https://www.w3.org/TR/epub-33/) for reflowable content documents,
  metadata, navigation, package structure, and the [OCF ZIP container](https://www.w3.org/TR/epub-33/#sec-ocf)
  requirements.
- [MDN: `HTMLIFrameElement.sandbox`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/sandbox)
  for the iframe capability boundary.
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
  for restrictive frame policy.
- [MDN: `Node.cloneNode()`](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode)
  for the source-cloning boundary.
- [MDN: `Window.print()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)
  for native printing of the canonical browser frame.
- [Playwright Test documentation](https://playwright.dev/docs/test-intro) for the
  repository's independently authored browser harness and observable test
  lifecycle.

These references define public syntax and platform behavior. They do not grant a
claim of complete browser conformance: the [compatibility matrix](compatibility.md)
records the deliberately supported subsets and typed fallbacks.

## Auditable decision rationale

Each publishing decision records four observable facts: the user-facing
capability, its status and limits, the public contract that bounds it, and the
repository test/evidence artifact that exercises it. This is an audit trail, not
a private chain-of-thought record. The browser publishing decision is captured in
[`ADR 0006`](architecture/0006-browser-publishing-contract.md); its status labels
and exclusions are summarized in [`docs/compatibility.md`](compatibility.md).

The clean-room boundary also explains why the product keeps one Core-owned iframe,
uses a resolver-only asset path, retains semantic source separately from page
furniture, and treats native print and reflowable EPUB as different artifacts.
Those are independently authored lifecycle and security decisions, checked by
the repository's browser tests and package audits.

## Licensing and provenance controls

The repository and first-party packages use Apache-2.0. `pnpm run licenses`
audits the installed dependency graph against an explicit reviewed permissive
allowlist plus exact package, version, license, and repository exceptions for
compatible tooling components, and writes `artifacts/evidence/licenses.json`.
New third-party code or assets must have a compatible license and be recorded in
`THIRD_PARTY_NOTICES.md` and the dependency audit.

This policy and automated audit reduce provenance and redistribution risk, but they
are not legal advice. Commercial deployment should receive independent counsel
review.

## Contributor clean-room checklist

Every contribution must satisfy all items before review:

- [ ] I used only the cited W3C, WHATWG, EPUB, MDN, and Playwright public
      contracts and independently written requirements.
- [ ] I used any competitor public documentation only as a high-level capability
      inventory, never as an implementation, API, architecture, test, fixture,
      naming, or behavior reference.
- [ ] I did not inspect, copy, translate, port, or adapt implementation source,
      tests, fixtures, bundles, comments, naming, or architecture from a
      third-party paged-layout implementation.
- [ ] I can identify the independently written requirement or cited public
      contract behind each compatibility change.
- [ ] New warnings, security boundaries, and print/EPUB behavior have
      independently authored regression tests.
- [ ] New third-party code or assets have a compatible license and are recorded
      in `THIRD_PARTY_NOTICES.md` and the dependency audit when applicable.
- [ ] I did not add secrets, customer material, private documents, or
      license-restricted fixtures.
- [ ] I understand this checklist is provenance hygiene, not a legal opinion.
