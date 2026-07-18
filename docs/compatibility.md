# Compatibility

The browser Core and Viewer surfaces are exercised in Chromium, Firefox, and WebKit. Chromium is the pagination reference; Firefox and WebKit must preserve API, isolation, lifecycle, and Viewer behavior, while browser-specific pagination metrics may differ.

React is validated through the same browser DOM contract as the framework-neutral client entrypoint. The package set does not expose a document-export API.

Core extensions share the controller's Chromium-reference pagination contract. Their transform, resolver-policy, decoration, warning, abort, and cleanup behavior does not introduce a second DOM or network boundary.
