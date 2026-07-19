# ADR 0004: browser-first page DOM

Core owns one sanitized, paginated browser DOM inside an isolated iframe. Viewer and the React adapter retain that exact iframe; they do not clone pages or rerun layout. `@imposia/client` exposes the framework-neutral contract and `@imposia/react` is the primary integration surface.

The public result is structural: ordered page flow, dimensions, page sides, blank markers, warnings, decorations, resolver-mediated assets, CSP isolation, and deterministic cleanup.

Updates use a temporary, noncanonical staging iframe. Core keeps the committed
generation visible in the persistent canonical iframe while it resolves resources
and paginates, then replaces the canonical head and body only after the new
generation succeeds. Failed, aborted, and superseded generations are discarded
with their staging iframe. This is the project's double-buffering contract: one
committed generation, at most one temporary staged generation, and never a second
presentation or print authority.
