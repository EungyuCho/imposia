import type { ViewerSource } from "./viewer-types.js";

export function loadingSource(source: ViewerSource): string | { data: Uint8Array } {
  if (typeof source === "string") return source;
  if (source instanceof Uint8Array) return { data: source.slice() };
  if (source instanceof ArrayBuffer) return { data: new Uint8Array(source.slice(0)) };
  return { data: source.pdf.slice() };
}
