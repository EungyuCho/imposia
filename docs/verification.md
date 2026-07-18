# Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`
- `pnpm run licenses`

Structural parity covers ordered flow, authored page breaks, decorations, blank pages, warnings, and page metadata. Browser E2E covers resolver boundaries, limits, lifecycle, security, canonical iframe Viewer behavior, and all installed engines. The license audit also checks each package tarball for its README, legal files, and every declared export target.
