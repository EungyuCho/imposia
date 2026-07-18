# Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`
- `pnpm run licenses`

Structural parity covers ordered flow, authored page breaks, decorations, blank pages, warnings, and page metadata. Browser E2E covers resolver boundaries, limits, lifecycle, security, canonical iframe Viewer behavior, and all installed engines. The license audit also checks each package tarball for its README, legal files, and every declared export target.

React E2E covers canonical-iframe-preserving source updates, retained output after a failed update, callbacks and state attributes, and unmount cleanup. Core extension E2E covers ordered transforms, asset policy, page decorators, warning determinism, atomic callback failure, and resource cleanup.
