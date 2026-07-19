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

`pnpm build` regenerates the checked-in browser examples. Include their changes
when a source or public-example change affects generated output.

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
