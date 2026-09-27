export const SITE_ORIGIN = "https://imposia.pages.dev";

/** Cloudflare Pages redirects prerendered directory routes to a trailing slash. */
export function siteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.replace(/\/+$/, "")}/`;
}
