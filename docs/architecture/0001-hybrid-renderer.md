# ADR 0001: browser-native PDF plus PDF.js Viewer

Status: accepted for v1.

Use pinned Chromium print layout for PDF generation and PDF.js for cross-browser viewing. This shares the actual output artifact between export and preview, avoids reimplementing line breaking and font shaping, and keeps browser-specific behavior behind an adapter. A custom layout engine remains out of scope until measured compatibility failures justify it.

