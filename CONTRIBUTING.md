# Contributing to Imposia

Thanks for helping improve Imposia. The project is a browser-only publishing
toolkit: one Core-owned iframe remains the source of truth from pagination to
presentation, native print, and semantic EPUB export.

## Before you begin

- Read the [product contract](./docs/domain/product.md) and the
  [compatibility matrix](./docs/compatibility.md). Do not broaden a constrained
  behavior into a claim of full CSS parity.
- Read the [clean-room policy](./docs/clean-room.md). Contributions must be
  independently authored from the cited public standards and project
  requirements; restricted third-party implementation or test material is out
  of scope.
- Follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Report suspected
  vulnerabilities through the private route in [SECURITY.md](./SECURITY.md),
  never through an issue containing exploit details.
- Keep a change within one public contract. If a decision changes that contract,
  update its documentation and add an observable regression test.

## Local development

```bash
corepack pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm check
```

Use the narrowest relevant command while iterating, then run `pnpm check`
before proposing a release-facing change. The verification map in
[`docs/verification.md`](./docs/verification.md) identifies the browser suites
that observe each public behavior.

`pnpm build` generates the browser example bundles (`examples/demo/app.js`,
`examples/react/app.js`, `examples/demo/viewer.css`). They are untracked
(ASA-448) — do not commit them; run `pnpm build` (or `pnpm build:demo`) to
produce them locally before serving the examples or running the browser
suites outside `pnpm check`.

`node --import tsx scripts/proof-lab-packed.ts` rebuilds those example bundles
from the packed `@imposia/*` tarballs (or, with `--published`, from the npm
registry) and runs the proof-lab browser specs against them, failing if any
workspace alias leaks into the bundle (ASA-446).

## Contribution checklist

- Add or update documentation for every public interface, warning, and support
  boundary that changes.
- Test behavior through the same public interface a user calls. For browser
  changes, exercise the canonical iframe in a real browser.
- Run formatting, type checking, focused tests, and the complete release gate
  appropriate to the change.
- Do not commit credentials, private material, generated local artifacts, or
  unsupported layout claims.

Distribution remains under [Apache-2.0](./LICENSE). See
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for shipped dependencies.

## Documentation and site deployment

Public guides live in `site/content/docs` with English, Korean, Japanese, and
Simplified Chinese editions. Keep option names, examples, support boundaries,
and error behavior aligned. A new guide also needs each locale's guide metadata
and an entry in `site/prerender-paths.ts`, which drives prerendering and sitemap
checks. Package READMEs and shared contracts remain English-only.

For a documentation change, build the current packages/demo with the site and
run the site checks:

```bash
pnpm build
pnpm test:site
```

Review affected pages on desktop and at a narrow width, then merge through the
normal required CI. `imposia.pages.dev` uses Cloudflare Pages direct upload, not
Git-provider autodeployment. Deploy a build of the merged main commit using the
existing authenticated Wrangler session:

```bash
npx wrangler pages deploy site/build/client --project-name imposia --branch main
```

`--branch main` selects the existing production branch; a separate branch name
creates a preview deployment. A package release does not deploy the site.
Confirm the deployment URL, published guide routes, language links, and sitemap
after upload. Site/documentation-only changes do not require a new npm version.
