/**
 * Every phrase a blocked-resource diagnostic may carry, authored in this module and
 * nowhere else.
 *
 * Blocked-resource reasons flow into `RESOURCE_BLOCKED` warnings, and those warnings are
 * part of the published document, so they are safe only if every character in them
 * originates inside Core: not a resolver's `reason`, not an extension policy's text, and
 * not an authored URL (docs/architecture/0005-core-extension-contract.md records the
 * contract). The `BlockedReason` brand makes that structural rather than a convention:
 * `AssetOutcome`, `BlockedResource`, and the warning builder accept only a
 * `BlockedReason`, and only this module produces one, so a string handed to Core at
 * runtime cannot reach `document.warnings` without failing the build.
 */

declare const CORE_AUTHORED: unique symbol;

/** A refusal phrase written by Core. See the module comment for why the brand exists. */
export type BlockedReason = string & { readonly [CORE_AUTHORED]: "core-authored" };

const authored = (text: string): BlockedReason => text as BlockedReason;

export const BLOCKED_REASON = Object.freeze({
  superseded: authored("generation was superseded"),
  emptyUrl: authored("URL is empty"),
  unsafeScheme: authored("URL uses a scheme that can execute script"),
  extensionVeto: authored("a page extension refused this resource"),
  /**
   * The only phrase a resolver `blocked` result may produce. The resolver's own `reason`
   * field is deliberately never read into diagnostics -- it is host-private text
   * (a proxy's error, a credentialed URL) that the resolver author did not write for
   * publication.
   */
  resolverRefused: authored("the resolver refused this resource"),
  unparsableStylesheet: authored("stylesheet could not be parsed as CSS"),
  loadingPolicy: authored("blocked by the loading policy"),
});

/**
 * MIME strings are quoted into reasons, and two of them (`canonicalMime`) are already
 * vetted against Core's allowlists by the time they are quoted. The declared type in the
 * unsupported-MIME reason is not: it is resolver text, so it is quoted only when it looks
 * like a MIME token, and replaced with a placeholder otherwise.
 */
const MIME_TOKEN = /^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+-]{1,64}$/;

function quotableMime(declared: string): string {
  if (declared === "") return "(empty)";
  return MIME_TOKEN.test(declared) ? declared : "(unprintable)";
}

export function unsupportedMimeReason(
  declaredMime: string,
  kind: "font" | "image" | "media" | "stylesheet",
): BlockedReason {
  return authored(`declared type ${quotableMime(declaredMime)} is not a supported ${kind} type`);
}

export function containerMismatchReason(canonicalMime: string): BlockedReason {
  return authored(
    `bytes are not a ${quotableMime(canonicalMime)} container -- the declared type does not match the data`,
  );
}

export function undecodableReason(canonicalMime: string): BlockedReason {
  return authored(
    `bytes decoded as ${quotableMime(canonicalMime)} could not be loaded by the browser`,
  );
}
