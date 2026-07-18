# Product contract

Imposia is a browser-only publishing library. `@imposia/react` is the primary integration surface; `@imposia/client` is the framework-neutral browser entrypoint; `@imposia/core` owns sanitized canonical page-DOM pagination; and `@imposia/viewer` presents that DOM or a PDF.js document.

React adapters mount and dispose the same Core controller and canonical iframe. They do not clone pages, run a second layout pass, fetch authored resources, or own Core lifecycle outside React effects.

The public browser contract is structural: page count, dimensions, ordered text, page-side metadata, decorations, blank-page positions, resolver boundaries, warnings, CSP isolation, and resource revocation. Node, filesystem, server, and CLI adapters are intentionally not part of this repository.
