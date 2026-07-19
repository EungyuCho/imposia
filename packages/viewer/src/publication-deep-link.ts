import type { PublicationController, PublicationDestination } from "@imposia/core";

const DEEP_LINK_PREFIX = "v1.";

export function serializePublicationDeepLink(destination: PublicationDestination): string {
  return `${DEEP_LINK_PREFIX}${encodeURIComponent(destination.id)}`;
}

export function restorePublicationDeepLink(
  value: string,
  controller: PublicationController,
): PublicationDestination | undefined {
  if (!value.startsWith(DEEP_LINK_PREFIX)) return undefined;
  const encodedId = value.slice(DEEP_LINK_PREFIX.length);
  if (encodedId === "") return undefined;
  try {
    const id = decodeURIComponent(encodedId);
    if (id === "" || encodeURIComponent(id) !== encodedId) return undefined;
    return controller.resolveDestination(id);
  } catch {
    return undefined;
  }
}
