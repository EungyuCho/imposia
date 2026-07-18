# Compatibility

The browser Core and Viewer surfaces are exercised in Chromium, Firefox, and WebKit. Chromium is the pagination reference; Firefox and WebKit must preserve API, isolation, lifecycle, and Viewer behavior, while browser-specific pagination metrics may differ.

React is validated through the same browser DOM contract as the framework-neutral client entrypoint. PDF export is outside this client-only package set.
