# @imposia/react

`@imposia/react` is the React adapter for the browser page-document and viewer APIs. It requires React and React DOM 18 or newer.

## Install

```bash
pnpm add @imposia/react react react-dom
```

## Use

```tsx
import { ImposiaPageViewer } from "@imposia/react";
import "@imposia/react/styles.css";

export function BookPreview() {
  return <ImposiaPageViewer source={{ html: "<article><h1>Hello</h1></article>" }} />;
}
```

The package also re-exports the public `@imposia/client` APIs and types. `ImposiaDocument` and `ImposiaPageViewer` mount and clean up the same Core controller and canonical iframe through React effects.

See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package for distribution terms.
