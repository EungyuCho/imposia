# ADR 0015: let hosts raise the document size and time limits

Status: accepted

## Context

`PageLimits` bounds the work one generation may do. Until now every limit was
a ceiling: a host could lower a value, and any value above
`DEFAULT_PAGE_LIMITS` was rejected. The defaults therefore capped the largest
document Imposia could paginate at all.

The long-document benchmark hit that cap first. Its article is about 2.8 KB of
HTML per page, so the 5 MiB `maxInputBytes` default stops it at about 1,850
pages. A four-column statement table reaches the 100,000-element `maxNodes`
default at about 20,000 rows. Year-end statements, audit logs, and exported reports
are longer than that.

The ceilings were set when pagination time per page grew with document
length. Two changes removed that growth: the unplaced source is no longer
laid out on every placement, and placed pages are kept in buckets so a forced
layout does not walk every placed page. Measured in Chromium on an Apple M4:

| Pages | Input | Frame elements | Mount | Heap retained | Longest task |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 997 | 2.7 MiB | 26,920 | 0.86 s | 8.4 MiB | under 50 ms |
| 4,985 | 13.5 MiB | 134,580 | 5.0 s | 33 MiB | 165 ms |
| 9,969 | 26.9 MiB | 269,150 | 12.6 s | 58 MiB | about 350 ms |

The one long task left at these sizes is the atomic commit: the canonical
frame receives every page in one task, and the browser then styles the whole
document. The commit contract (ADR 0011) requires that task to stay whole.

## Decision

Limits keep their defaults. Four of them, the ones that bound document size
and time, can be raised by the host up to a fixed maximum:

| Limit | Default | Maximum |
| --- | ---: | ---: |
| `maxInputBytes` | 5 MiB | 32 MiB |
| `maxNodes` | 100,000 | 1,000,000 |
| `maxPages` | 10,000 | 50,000 |
| `resourceDeadlineMs` | 30,000 | 300,000 |

Every other limit (asset bytes, depth, and references; layout passes;
generated fragments and records) stays a ceiling at its default. Values above
the maximum, zero, negative, fractional, and non-finite values are rejected
as before, and the error names the maximum.

The maximums are sized from the measurements above: 32 MiB of text-dense
HTML is about 12,000 pages, which paginates in about 15 seconds, well under
the raised deadline, and 1,000,000 elements admits a 32 MiB four-column
table.

## Consequences

- A host that renders its own long documents opts in per controller, for
  example `limits: { maxInputBytes: 16 * 1024 * 1024, maxNodes: 500_000 }`.
  A host that renders untrusted input keeps the defaults and changes nothing.
- The defaults, and therefore the protection a host gets without asking, are
  unchanged.
- At the maximums a mount holds tens of megabytes of heap and a few hundred
  milliseconds of commit. The documentation states both, so a host can
  decide whether to raise a limit or split the document into a Publication.
- `docs/architecture/overview.md` stated that limits may only be lowered.
  That sentence now names the four raisable limits.

## Alternatives considered

- **Raise the defaults.** Every host, including those rendering untrusted
  input, would silently accept eight times more work. The opt-in keeps that
  decision with the host.
- **No maximum.** A typo such as an extra zero would then admit arbitrarily
  large work. A fixed maximum keeps the bound explicit and testable.
- **Stream a long document through several generations.** That would split
  the committed page sequence, which ADR 0011 makes a single authority.
