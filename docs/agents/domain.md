# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`docs/routing.md`** — use it as the entry point and read the smallest relevant document under `docs/domain/` or `docs/architecture/`.
- **`CONTEXT.md`** at the repo root, when it exists.
- **`docs/architecture/`** — read ADRs that touch the area you're about to work in.

If `CONTEXT.md` does not exist, **proceed silently**. Don't flag its absence or suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily when terms or decisions actually get resolved.

## File structure

This repo uses a single-context layout:

```
/
├── CONTEXT.md                        ← created lazily when needed
└── docs/
    ├── routing.md                    ← documentation entry point
    ├── domain/                       ← product and domain contracts
    └── architecture/                 ← ADRs and architecture decisions
```

Do not create a parallel `docs/adr/` hierarchy; this repo's existing ADR location is `docs/architecture/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, or a test name), use the term as defined in `CONTEXT.md` and the relevant `docs/domain/` document. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't documented yet, reconsider whether you're inventing language the project doesn't use; otherwise note the genuine gap for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing architecture decision, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 — but worth reopening because…_
