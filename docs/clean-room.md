# Clean-room policy and provenance

Implementation inputs are limited to independently written requirements and the W3C, MDN, and Playwright public contracts listed here. Contributors must not inspect, copy, translate, port, or adapt third-party paged-layout implementation source, tests, fixtures, bundles, comments, names, or architecture.

Primary references consulted on 2026-07-18:

- [CSS Fragmentation Module Level 3](https://www.w3.org/TR/css-break-3/) for modern breaks, legacy page-break aliases, and page-side values.
- [CSS Paged Media Module Level 3](https://www.w3.org/TR/css-page-3/) for page boxes and paged-media terminology.
- [MDN: `HTMLIFrameElement.sandbox`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/sandbox) for the iframe capability boundary.
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP) for restrictive frame policy.
- [MDN: `Node.cloneNode()`](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode) for the source-cloning boundary.
- [MDN: `Window.print()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/print) for printing the canonical browser frame.

No third-party paged-layout source, tests, distribution bundles, or internal documentation were used. Imposia's module boundaries and APIs were derived from the requirements in this repository and the public platform contracts above.

The repository and first-party packages use Apache-2.0. `pnpm run licenses` audits the installed dependency graph against an explicit reviewed permissive allowlist and writes `artifacts/evidence/licenses.json`.

This policy and automated audit reduce provenance and redistribution risk, but they are not legal advice. Commercial deployment should receive independent counsel review.

## Independently derived decisions

- HTML parsing, CSS declaration normalization, and warnings were designed from the repository requirements and W3C syntax/behavior contracts.
- The page-DOM contract is derived from public DOM, iframe, print, CSS Fragmentation, and CSS Paged Media behavior.
- Viewer behavior and the target page DOM are independently designed from the repository requirements and the listed public contracts.
- Page decorations are independently defined ordinary page-DOM header and footer content after structural sanitization.

## Contributor clean-room checklist

Every contribution must satisfy all items before review:

- [ ] I used only the cited W3C, MDN, and Playwright public contracts and independently written requirements.
- [ ] I did not inspect, copy, translate, port, or adapt implementation source, tests, fixtures, bundles, comments, naming, or architecture from any third-party paged-layout implementation.
- [ ] I can identify the independently written requirement or cited public contract behind each compatibility change.
- [ ] New third-party code or assets have a compatible license and are recorded in `THIRD_PARTY_NOTICES.md` and the dependency audit when applicable.
- [ ] New warnings, security boundaries, and PDF/Viewer behavior have independently authored regression tests.
- [ ] I did not add secrets, customer material, private documents, or license-restricted fixtures.
- [ ] I understand this checklist is provenance hygiene, not a legal opinion.
