# ADR 0009: Publication page identity

Status: accepted

A committed Publication has one continuous global page sequence. Each
Publication entry exposes an inclusive page range within that sequence rather
than restarting page identity. Viewer state, outline destinations, deep links,
print, progress, and diagnostics therefore address the same immutable page
numbers. Authored presentation may still display alternate folios through
publishing CSS in a later capability, but displayed folios never replace the
global page identity in the public API.
