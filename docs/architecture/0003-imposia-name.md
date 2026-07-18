# ADR 0003: Imposia project name

Status: accepted for v1.

Use **Imposia** as the project name and `@imposia/*` as the intended package scope. The name echoes print imposition without borrowing another paged-layout library's product or package name, and it works for the Core, Viewer, and CLI surfaces without implying that v1 implements the entire CSS Paged Media specification.

Point-in-time collision checks performed on 2026-07-17:

- [`GET registry.npmjs.org/imposia`](https://registry.npmjs.org/imposia) returned HTTP 404 with `{"error":"Not found"}`.
- [GitHub's repository search API for `imposia in:name`](https://api.github.com/search/repositories?q=imposia%20in:name) returned `total_count: 0`.
- Pagewright was rejected because [npm reports version 0.0.1](https://registry.npmjs.org/pagewright) and an [exact GitHub repository](https://github.com/rvben/pagewright) already exists.
- Folioframe was rejected because its [GitHub search](https://api.github.com/search/repositories?q=folioframe) returned exact or near-exact repositories. Leafpress was rejected because its [GitHub search](https://api.github.com/search/repositories?q=leafpress) returned multiple similarly named projects.
- Paperlane was unpublished on npm and had no exact established GitHub repository in this check, but was rejected as generic and brand-ambiguous.

These are technical registry/repository checks, not a reservation of the npm `@imposia` scope and not trademark, company-name, domain, or legal clearance. Availability can change after the recorded date. Establish ownership of the npm scope, repeat the checks immediately before publishing packages, and obtain independent trademark advice before commercial launch.
