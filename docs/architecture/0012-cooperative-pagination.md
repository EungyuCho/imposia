# ADR 0012: cooperative time-sliced asynchronous pagination

Status: accepted

## Context

Core already isolates candidate work in a noncanonical staging iframe and
commits only a complete generation. The fragmentation engine, however, used to
perform constraint capture and recursive page allocation in one uninterrupted
main-thread task. Large documents could therefore delay input, animation, and
paint even though the atomic commit contract remained correct.

Moving the existing algorithm into a worker is not a compatible solution:
pagination depends on live browser layout measurements. A second renderer would
also violate the canonical layout authority defined by ADR 0011.

Cooperative yielding introduces three correctness risks:

1. yielding can change page membership or source order;
2. an aborted generation can continue mutating a detached staging document;
3. fonts or images can become measurable after an early pagination pass.

The public contract must address those risks before claiming responsiveness.

## Decision

Core keeps browser layout on the main thread and makes the existing paginator
cooperative. `PageDocumentOptions` and, through it, `PublicationOptions` accept:

```ts
interface PageComposeOptions {
  yieldBudgetMs?: number;
  scheduler?: () => Promise<void>;
}
```

`yieldBudgetMs` defaults to `8`. A non-negative finite value requests a
scheduler handoff after the current slice reaches the budget. `Infinity`
disables scheduler handoffs for deterministic comparison and specialized
hosts. The default scheduler uses `scheduler.yield()` when present, then
`MessageChannel`, then `setTimeout(0)`.

Checkpoints exist in the allocation choke points that can grow with input:
constraint capture, typography preparation, source traversal, recursive
element, grid, line, table, grapheme, and rendered-line fragmentation. A yield
does not create another layout authority or expose a partial generation.

The scheduler Promise is raced with the generation's `AbortSignal`. A newer
generation aborts its predecessor, waits for the predecessor's cleanup, and only
then attaches its own staging iframe. At most one staging generation is
attached or composing at a time. Failure, caller abort, supersession, callback
failure, and destroy preserve the previous committed generation.

The resource deadline is wall-clock time. Time spent waiting for the cooperative
scheduler, fonts, or images counts toward `resourceDeadlineMs`. This prevents a
host scheduler that never resolves from leaving a controller pending forever.

Before measuring a pass, Core attaches that pass's sanitized source and styles
to the staging document, waits for `document.fonts.ready`, and awaits image
`decode()` where available. A failed image decode is considered settled and
continues through the existing overflow and warning behavior. Abort interrupts
the wait.

`onProgress` moves to page allocation and receives:

```ts
interface PageComposeProgress {
  readonly completedPages: number;
  readonly pass: number;
  readonly provisional: true;
}
```

`pass` is one-based. A convergent publishing layout can reset
`completedPages` to `1` in a later pass. Progress always describes staging work,
never a committed document. A callback can synchronously abort or supersede the
generation; Core checks the signal immediately afterward. A thrown callback
rejects the generation and preserves the previous commit.

Committed page roots use `contain: layout`. Core does not add style containment:
counter and quote scoping changes would make it a semantic pagination change,
not a performance-only optimization.

## Compatibility

Cooperative and uninterrupted modes must produce the same accepted page
structure for the same browser, source, geometry, assets, and options. This
decision does not add cross-browser pixel or page-count parity.

`Infinity` disables scheduler handoffs, but it is not described as a zero-cost
synchronous path: the public generation contract remains asynchronous and
internal fragmentation functions retain their Promise boundaries.

## Verification

The release proof covers:

- committed source order with layout containment;
- structural equality between `Infinity` and forced-yield pagination;
- repeated yields inside one deeply fragmenting text node;
- abort of a scheduler wait before a superseding generation starts;
- one attached staging iframe and retention of the previous commit;
- font and image settlement, decode failure, and abort;
- provisional progress at the instant each page is allocated;
- the existing atomic lifecycle, print, and export regressions.

## Consequences

- Large browser documents can return control to the host without replacing the
  measured browser-layout algorithm.
- Hosts can inject a scheduler for integration or deterministic tests.
- Progress consumers must treat counts as pass-local provisional observations.
- Hosts that choose long scheduler delays consume the same wall-clock resource
  deadline as layout and asset settlement.
- Recursive fragmentation is now internally asynchronous; new input-sized loops
  must use the shared checkpoint rather than adding uninterrupted traversal.

## Rejected alternatives

### Worker pagination

Workers cannot query the live layout geometry used by the current paginator. A
worker-side approximation would be a second rendering authority.

### Yield only between top-level nodes

A single paragraph, table, or nested subtree can dominate the task. Top-level
yielding does not bound those cases or make abort responsive inside them.

### Run superseding generations concurrently

Concurrent staging documents spend work on a known loser and allow a detached
generation to continue layout. Serialized cleanup keeps lifecycle ownership
explicit.

### Add `contain: layout style`

Style containment can change authored counters and quotes. Layout containment
provides the intended page-root isolation without claiming that semantic change
is risk-free.
