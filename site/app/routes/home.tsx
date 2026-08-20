import { Navigate, useParams } from "react-router";
import { isSupportedLocale } from "../../lib/i18n";

/**
 * `/:lang` is documentation, not a marketing page. The route stays so the
 * locale prefix keeps working on its own, and forwards to that locale's docs
 * root; the standalone demo remains reachable from the top navigation.
 */
export default function LocaleIndexRoute() {
  const { lang } = useParams<"lang">();

  return <Navigate replace to={lang && isSupportedLocale(lang) ? `/${lang}/docs` : "/en/docs"} />;
}
