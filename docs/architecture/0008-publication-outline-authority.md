# ADR 0008: Publication outline authority

Status: accepted

The Publication outline is the single navigation authority for Viewer TOC and
publication exports. Each Publication entry supplies a stable identifier and
title; Core adds nested outline items from sanitized authored `h1`–`h6`
headings, assigning deterministic destinations when an authored heading lacks
an identifier and rejecting ambiguous entry identifiers before staging begins.
Viewer panels, EPUB navigation, deep links, and later PDF bookmarks consume this
model instead of independently re-parsing rendered DOM. Explicit entry metadata
keeps the top-level reading order stable, while heading extraction avoids forcing
authors to duplicate their document structure in configuration.
