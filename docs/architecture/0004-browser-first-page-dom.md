# ADR 0004: browser-first page DOM

Core owns one sanitized, paginated browser DOM inside an isolated iframe. Viewer and the React adapter retain that exact iframe; they do not clone pages or rerun layout. `@imposia/client` exposes the framework-neutral contract and `@imposia/react` is the primary integration surface.

The public result is structural: ordered page flow, dimensions, page sides, blank markers, warnings, decorations, resolver-mediated assets, CSP isolation, and deterministic cleanup. Node, filesystem, server, and CLI adapters are outside the product boundary.
