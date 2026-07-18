# Product contract

Imposia is a browser-only publishing library. `@imposia/react` is the primary integration surface; `@imposia/client` is the framework-neutral browser entrypoint; `@imposia/core` owns sanitized canonical page-DOM pagination; and `@imposia/viewer` presents that DOM or a PDF.js document.

React adapters mount and dispose the same Core controller and canonical iframe. They do not clone pages, run a second layout pass, fetch authored resources, or own Core lifecycle outside React effects.

Core exposes an ordered extension contract for string transforms, asset admission policy, warnings, and page decorations. Extensions remain inside the same sanitizer, resolver, abort, rollback, and cleanup boundaries and cannot access the canonical DOM or fetch resources.

The public browser contract is structural: page count, dimensions, ordered text, page-side metadata, decorations, blank-page positions, resolver boundaries, warnings, CSP isolation, and resource revocation. These browser packages are the complete published product surface.
