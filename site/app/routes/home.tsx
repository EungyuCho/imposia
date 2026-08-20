import { redirect } from "react-router";
import { isSupportedLocale } from "../../lib/i18n";
import type { Route } from "./+types/home";

/**
 * `/:lang` is documentation, not a marketing page. The route stays so the
 * locale prefix works on its own and forwards to that locale's docs root;
 * the standalone demo remains reachable from the navigation.
 *
 * The redirect belongs in a loader rather than a rendered `<Navigate>`:
 * during prerendering the router is static, where `<Navigate>` is a no-op and
 * warns. Production serves these hops from `_redirects` at the edge.
 */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  const lang = params.lang;
  return redirect(lang && isSupportedLocale(lang) ? `/${lang}/docs` : "/en/docs");
}

export default function LocaleIndexRoute() {
  return null;
}
