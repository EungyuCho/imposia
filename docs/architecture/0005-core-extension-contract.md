# ADR 0005: Core extension contract

Status: proposed; no runtime extension API is exported in the current Chromium-reference Core.

## Decision

Imposia can support a clean-room, Tiptap-inspired *extension composition model* without adopting any third-party implementation, names, or internal architecture. An extension is an ordered, browser-only policy object that contributes only at explicit Core phases. It cannot take ownership of the canonical iframe, mutate page DOM, fetch resources, weaken limits or CSP, suppress Core warnings, or change lifecycle atomicity.

The current implementation must not expose `extensions` yet. The required seams are absent, so adding an option now would either be inert or let extension output bypass a tested sanitization, asset-resolution, warning, and cleanup path. The first implementation should land as one vertical slice with the contract and tests below; it must not be a compatibility alias for another editor or paginator.

## Audit evidence

| Current behavior | Evidence | Consequence for extensions |
| --- | --- | --- |
| Options are snapshotted once when the controller mounts; `update()` accepts only a source and abort signal. | `packages/core/src/page-document.ts` calls `snapshotSettings()` before the first generation; `packages/core/src/page-document-types.ts` defines `update(source, { signal? })`. | The extension list must be immutable for the controller lifetime, rather than silently changing between generations. |
| Sanitization, decoration extraction, asset resolution, final frame sanitization, fragmentation, and warning assembly are one `buildGeneration()` operation. | `packages/core/src/page-document-generation.ts` performs those steps in that order and only then returns a committed generation. | Every extension phase needs a named position inside this operation and must remain inside its abort/error/rollback boundary. |
| The asset resolver is the only admitted resource boundary; authored URLs never reach the frame and Core-created blobs are revoked on replacement, failure, and destruction. | `packages/core/src/page-document-assets.ts`, `packages/core/src/page-document-sanitize.ts`, and `packages/core/src/page-document.ts`; browser asset tests assert no authored network requests or frame URLs. | An asset extension may only allow or block a discovered request before the host resolver. It may not fetch, return bytes, rewrite to an arbitrary frame URL, or retain Core blobs. |
| Page decorations are copied while each page is created, and page-number tokens resolve only after the final page count is known. | `createPage()` and `resolveDecorationTokens()` in `packages/core/src/page-document-generation.ts`. | Decoration output must be supplied while a page is allocated, then be sanitized and token-resolved by Core. A post-pagination DOM hook would invalidate page metadata and layout. |
| Page warnings are a frozen, fixed union assembled from Core and resource results. | `packages/core/src/page-document-types.ts` and `pageWarnings()` in `packages/core/src/page-document-sanitize.ts`. | Extension warnings need an explicit namespaced type and deterministic merge rule; arbitrary mutation of `PageDocument.warnings` is not safe. |
| `decorateBlankPages` is public in the target type but explicitly rejects in the present vertical slice. | `snapshotSettings()` in `packages/core/src/page-document-generation.ts`. | Blank-page decoration behavior must be completed and regression-tested before page decorators are enabled. |

## Proposed public API

This is the proposed first public shape, deliberately smaller than a general-purpose plugin system. It uses independently authored names and TypeScript only as an illustrative API; no code is exported yet.

```ts
type PageExtensionWarningCode = `EXTENSION_${string}`;

interface PageExtensionWarning {
  readonly code: PageExtensionWarningCode;
  readonly message: string;
}

interface PageExtensionTransformInput {
  readonly html: string;
  readonly css: readonly string[];
  readonly baseUrl: string | undefined;
}

interface PageExtensionTransformOutput {
  readonly html?: string;
  readonly css?: readonly string[];
}

interface PageExtensionAssetRequest {
  readonly url: string;
  readonly kind: "font" | "image" | "media" | "stylesheet";
  readonly baseUrl: string | undefined;
  readonly depth: number;
  readonly sourceIdentity: string;
}

interface PageExtensionPage {
  readonly number: number;
  readonly side: "left" | "right";
  readonly blank: boolean;
}

interface PageExtensionDecoration {
  readonly headerHtml?: string;
  readonly footerHtml?: string;
}

interface PageExtensionContext {
  readonly signal: AbortSignal;
  warn(warning: PageExtensionWarning): void;
}

interface PageExtension {
  /** Unique, stable lowercase package-style identifier, for example "acme/running-head". */
  readonly name: string;
  transform?(
    input: PageExtensionTransformInput,
    context: PageExtensionContext,
  ): PageExtensionTransformOutput | void | Promise<PageExtensionTransformOutput | void>;
  allowAsset?(request: PageExtensionAssetRequest, context: PageExtensionContext): boolean;
  decoratePage?(
    page: PageExtensionPage,
    context: PageExtensionContext,
  ): PageExtensionDecoration | void;
}

interface PageDocumentOptions {
  // Existing options ...
  extensions?: readonly PageExtension[];
}
```

`PageWarningCode` would gain `PageExtensionWarningCode`, and the frozen result warning would include `extension: string` for these extension-originated warnings. Core-originated warning shapes and codes remain unchanged. A warning emitted by an extension is document-level (`sourceIdentity: undefined`); extensions do not receive mutable source nodes or invent Core source identities. The warning code must start with `EXTENSION_`, be nonempty after that prefix, and be unique per extension generation after the `(extension name, code)` pair is deduplicated. Extension order, then call order, determines their position after Core's deterministic warnings.

## Required execution order

For a generation, Core copies and validates the source first, snapshots and validates the extension list, and runs each `transform` serially in declared option order. Transform input and output are strings only; Core re-applies its input-byte limit after every output and treats all resulting markup and CSS as untrusted.

Core then performs its existing document preparation and decoration extraction. During asset discovery, every `allowAsset` policy runs serially in declaration order. All policies must return `true` before the existing host `assetResolver` is invoked. A `false` result has the existing blocked-resource outcome: no resolver call, no authored URL in the frame, and the generic `RESOURCE_BLOCKED` warning. Policy reasons are intentionally not exposed, so a host policy cannot leak credentials or sensitive URL information through the result.

During page allocation, Core invokes `decoratePage` in declared order before it measures and fragments that page. Core appends returned header/footer snippets in extension order after the base Core decoration. It runs the same structural and URL sanitizer used for normal decorations; it resolves the existing page-number tokens only after the total page count is final. Decorators run for blank pages only when the completed `decorateBlankPages` behavior says decorations are enabled. No decorator runs after `PageDocument` metadata has been measured.

Before and after every asynchronous transform, Core checks the generation abort signal. An extension throw, invalid output, duplicate name, or invalid warning rejects that generation exactly like another generation error; it never partially commits a frame. Any assets created by the generation still use the present rollback and URL-revocation path.

## Deliberate exclusions

- No `iframe`, `Document`, `Element`, `PageDocument`, or mutable warning array is handed to an extension.
- No `resolveAsset`, network, file, worker, timer ownership, custom CSP, direct stylesheet injection, or blob-URL API is exposed.
- An extension cannot replace the host `assetResolver`, increase limits, modify warning severity, intercept `print()`, or affect controller update/destroy semantics.
- There are no arbitrary `before`/`after` hooks, priority sorting, command registry, editor state, or extension storage in v1. Option order is the sole composition rule.
- Page decorators do not receive `totalPages`; use Core's `{{totalPages}}` token instead. This prevents a speculative first pagination pass or a post-layout mutation that changes layout.

## Implementation and verification gate

Before exporting this API, implement these seams internally and add browser-Core tests proving all of the following:

1. Transform order is stable, outputs are re-sanitized and re-limited, aborting a transform leaves the previous canonical generation intact, and no extension configuration changes across `update()`.
2. Asset policies run before the resolver, a denial makes no resolver or browser request, policies cannot introduce authored URLs, and generated blobs are revoked after failed and superseded generations.
3. Header/footer snippets affect layout only through normal page allocation; page-number and total-page tokens resolve on ordinary and blank pages according to `decorateBlankPages`; a decorator cannot mutate a committed page.
4. Extension warnings are frozen, namespaced, deduplicated, deterministic across identical runs, and cannot reorder or suppress Core warnings.
5. Duplicate names, invalid output, invalid warning codes, and thrown extension callbacks reject atomically with no console errors, retained blobs, or partially committed pages.

This contract is clean-room: it is an independently derived ordered policy interface over Imposia's documented Core pipeline. No third-party paged-layout or editor implementation, source, tests, assets, or internal API are a reference for it.
