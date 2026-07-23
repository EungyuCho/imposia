# Documentation routing

- Product and public contracts: [domain/product.md](domain/product.md). It defines HTML/CSR pagination integrity as the primary product contract, the React-first browser package, framework-neutral Core/Client/Viewer contracts, canonical iframe lifecycle, and semantic EPUB export.
- Open-source launch work: [open-source-readiness.md](open-source-readiness.md). It separates the completed client release gate, post-release engineering follow-ups, and maintainer-controlled launch gates.
- Compatibility matrix: [compatibility.md](compatibility.md). It is authoritative for Stable, Experimental, Constrained, and Unsupported page-media, fragmentation, publishing, export, and browser behavior.
- Browser bundle report and gzip budgets: [bundle-size.md](bundle-size.md). It defines the measured consumer routes, reproducible command, budget policy, and current EPUB size decision.
- Clean-room policy: [clean-room.md](clean-room.md)
- Architecture decisions: [project name](architecture/0003-imposia-name.md), [browser-first page DOM target and implementation status](architecture/0004-browser-first-page-dom.md), [browser publishing contract](architecture/0006-browser-publishing-contract.md), [Publication source boundary](architecture/0007-publication-source-boundary.md), [Publication outline authority](architecture/0008-publication-outline-authority.md), and [Publication page identity](architecture/0009-publication-page-identity.md)
- EPUB package and bundle boundary: [ADR 0010](architecture/0010-core-epub-bundle-boundary.md)
- Primary HTML/CSR pagination-integrity contract and public proof requirements: [ADR 0011](architecture/0011-html-csr-pagination-integrity.md)
- Ordered Core extension runtime and its security boundaries: [ADR 0005](architecture/0005-core-extension-contract.md)
- Verification evidence: [verification.md](verification.md)
- Documentation and localization release audit: [documentation-localization-audit.md](documentation-localization-audit.md)
- Public website: `site/` is a Vite-powered React Router SPA (`ssr: false`) using Fumadocs layouts and localized MDX at `/en`, `/ko`, `/zh-CN`, and `/ja`.
