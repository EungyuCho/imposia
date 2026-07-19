# Imposia Publishing

Imposia turns browser HTML and CSS into a committed page document that can be
presented and published without introducing another rendering authority.

## Language

**Committed generation**:
The latest successfully paginated page document that presentation, print, and
export are allowed to observe.
_Avoid_: Current render, live draft

**Staged generation**:
An update being prepared in Core's temporary, noncanonical staging iframe while
the committed generation remains visible; it replaces the commit only after
complete success.
_Avoid_: Second canonical iframe, background renderer

**Canonical iframe**:
The single persistent Core-owned browser frame containing the committed
generation and used by presentation and native print.
_Avoid_: Preview iframe, renderer iframe

**Viewer theme**:
A set of `--imposia-viewer-*` presentation tokens scoped to one Viewer shell; it
does not style or alter the authored page document.
_Avoid_: Document theme, page stylesheet

**Publication**:
An ordered collection of semantic sources that share publication metadata,
reading order, outline, and one committed page sequence.
_Avoid_: Book project, document bundle

**Publication entry**:
One semantic source in a Publication's reading order, such as a cover, front
matter section, or chapter.
_Avoid_: Chapter document, subdocument

**Publication outline**:
The stable navigation tree shared by Viewer navigation and publication exports,
rooted in entry metadata and extended by authored headings.
_Avoid_: Viewer menu, bookmark list

**Table of contents**:
A rendered projection of the Publication outline for a reader or exported
artifact.
_Avoid_: Outline model, navigation source

**Entry page range**:
The inclusive span of global committed page numbers occupied by one Publication
entry.
_Avoid_: Chapter numbering, local pages

**Publication snapshot**:
The complete immutable value of a Publication's metadata and ordered entries
submitted for one staged generation.
_Avoid_: Partial update, live publication
