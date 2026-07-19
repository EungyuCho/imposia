# ADR 0007: Publication source boundary

Status: accepted

A Publication extends the browser publishing contract without admitting a new
network or rendering authority. Its first public API accepts an ordered set of
in-memory HTML or light-DOM Publication entries and commits them as one page
sequence in the existing canonical iframe. Entry assets continue to cross the
host `assetResolver`; Core never fetches authored entry, manifest, or EPUB URLs
directly. W3C Publication Manifest, remote document, and EPUB import may be
provided later by adapters that produce these in-memory entries. This keeps the
atomic generation, CSP, cleanup, and auditable resolver boundary intact while
leaving room for broader import workflows outside Core.

Publication mutation uses whole-snapshot replacement. `update()` receives the
next metadata and complete reading order, stages one candidate, and commits the
entries, outline, page ranges, and semantic export state together. Entry-level
editing remains an application concern that produces the next Publication
snapshot; Core does not expose a competing partial-update scheduler.
