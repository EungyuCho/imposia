# `0.x` API change policy

Imposia is pre-`1.0`. This document says what that means concretely, so
consumers can judge upgrade risk without reading commit history and
maintainers have one rule to apply. It is deliberately short. The stability
guarantees that replace it are a [`1.0`](roadmap.md) deliverable.

## What is public

The public interface of each package is **what its entry point exports** —
`@imposia/core`, `@imposia/viewer`, `@imposia/client`, `@imposia/react` — plus
the documented behavior of those exports.

Everything else is internal, including:

- deep module paths inside a published `dist` (`@imposia/core/dist/...`),
  whether reached through a bundler, a CDN URL, or a direct file read;
- test seams such as `internal*TestApi`, which exist for the repository's own
  oracle specs and are covered by the convention in
  [`architecture/overview.md`](architecture/overview.md) §13.5;
- DOM structure inside the canonical iframe that is not described by a
  documented API.

Reaching into any of those is unsupported and may break in a patch.

## What a version number promises

| Change | Version |
| --- | --- |
| Behavior change or removal in a public export | Minor (`0.x.0`) |
| New public export or option | Minor (`0.x.0`) |
| Fix that restores documented behavior | Patch (`0.x.y`) |
| Change to an internal surface | Any release, unannounced |

In `0.x`, **a minor release may break you**; a patch release may not. This is
the standard pre-`1.0` reading of semantic versioning and it will not change
before `1.0`.

All four packages are versioned and released together. Mixing versions across
packages is not a supported combination.

## What a breaking change owes you

Every breaking change in a minor release ships with all four of:

1. a `Breaking` entry in [`CHANGELOG.md`](../CHANGELOG.md) naming the issue;
2. a migration note under [`docs/migrations/`](migrations/) covering what can
   change for a consumer and what cannot — see
   [`0.5.0`](migrations/0.5.0.md) for the shape;
3. an ADR under [`docs/architecture/`](architecture/) when the change moves a
   product or ownership boundary;
4. a typed warning or an atomic failure rather than a silent approximation,
   wherever the change makes previously accepted input unsupported.

There is no deprecation period in `0.x`. A public export can be removed in the
minor that announces it. Published deprecation windows begin at `1.0` and are
a Contract-milestone deliverable.

## `experimental.*` is a shorter clock

Options under `experimental` are opt-in and carry no stability expectation at
all. Two kinds live there:

- **Feature previews** (`footnotes`, `pageFloats`) fall back with a typed
  warning outside their supported limits. They are promoted on evidence or
  removed; `1.0` ships no permanently experimental behavior.
- **Escape hatches** (`forceSequentialPlacement`, `forceLegacyLineEnds`,
  `forceFullConstraintCapture`) restore an implementation a fast path
  replaced. They exist for **one release** so the fast path can be disabled in
  the field while it earns confidence, and they are removed in the next minor
  — that removal is not a breaking change under this policy, it is the
  announced schedule. Reaching for one is a bug report, not a configuration.

If an escape hatch is load-bearing for your application, say so on the issue
that owns its removal before that release ships.

## Security fixes

Security patches are delivered on the current line. Whether a fix is also
backported to an older line is decided per advisory on measured severity and
recorded in [`SECURITY.md`](../SECURITY.md); assume no backport unless one is
announced. Because Core bundles its dependencies into the browser artifact, a
consumer cannot patch a bundled dependency through their own lockfile —
upgrading Imposia is the delivery mechanism.
