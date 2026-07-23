import { RootProvider } from "fumadocs-ui/provider/react-router";
import type { ComponentProps } from "react";
import type { LinksFunction, MetaFunction } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Link as RouterLink,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { isSupportedLocale } from "../components/marketing-copy";
import { i18nUI, type Locale } from "../lib/i18n";
import stylesHref from "../styles.css?url";

export const links: LinksFunction = () => [{ href: stylesHref, rel: "stylesheet" }];

export const meta: MetaFunction = () => [
  { title: "Imposia — HTML in. Pages out." },
  {
    content: "Browser-native HTML and CSS publishing for React, native print, and reflowable EPUB.",
    name: "description",
  },
];

const DEMO_PATH = "/examples/demo/index.html";

function SiteLink({
  href = "#",
  prefetch,
  ...props
}: ComponentProps<"a"> & { prefetch?: boolean }) {
  return (
    <RouterLink
      {...props}
      prefetch={prefetch ? "intent" : "none"}
      reloadDocument={href === DEMO_PATH}
      to={href}
    />
  );
}

function localeFromPathname(pathname: string): Locale {
  const firstSegment = pathname.split("/").find(Boolean) ?? "";
  return isSupportedLocale(firstSegment) ? firstSegment : "en";
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const lang = localeFromPathname(pathname);

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body className="imposia-root">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return (
    <main className="hydrate-fallback" aria-label="Loading Imposia">
      <span>Imposia</span>
    </main>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const lang = localeFromPathname(pathname);

  return (
    <RootProvider
      components={{ Link: SiteLink }}
      i18n={i18nUI.provider(lang)}
      search={{ enabled: false }}
      theme={{ enabled: false }}
    >
      <Outlet />
    </RootProvider>
  );
}
