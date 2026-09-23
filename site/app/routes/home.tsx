import type { LinksFunction, MetaFunction } from "react-router";
import { Navigate, useParams } from "react-router";
import landingHref from "../../landing.css?url";
import { isSupportedLocale } from "../../lib/i18n";
import { LANDING_COPY } from "../landing/copy";
import { Landing } from "../landing/landing";

/**
 * `/:lang` is the product landing page (design/landing.pen). It is prerendered
 * per locale; documentation lives under `/:lang/docs`.
 */
export const links: LinksFunction = () => [
  { href: landingHref, rel: "stylesheet" },
  { href: "https://fonts.googleapis.com", rel: "preconnect" },
  { crossOrigin: "anonymous", href: "https://fonts.gstatic.com", rel: "preconnect" },
  {
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600&family=Newsreader:opsz,wght@6..72,500&display=swap",
    rel: "stylesheet",
  },
];

export const meta: MetaFunction = ({ params }) => {
  const lang = params.lang;
  if (!lang || !isSupportedLocale(lang)) return [];
  const copy = LANDING_COPY[lang];
  return [{ title: copy.metaTitle }, { content: copy.metaDescription, name: "description" }];
};

export default function LandingRoute() {
  const lang = useParams<"lang">().lang;
  if (!lang || !isSupportedLocale(lang)) return <Navigate replace to="/en" />;
  return <Landing lang={lang} />;
}
