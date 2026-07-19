import { HomeLayout } from "fumadocs-ui/layouts/home";
import { Blocks, BookOpenText, Columns3, Frame, Printer, ShieldCheck } from "lucide-react";
import { useId } from "react";
import type { MetaFunction } from "react-router";
import { Link, Navigate, useParams } from "react-router";
import { CopyCommand } from "../../components/copy-command";
import { HERO_CODE, isSupportedLocale, marketingCopy } from "../../components/marketing-copy";
import { baseOptions } from "../../lib/layout.shared";

const FEATURE_ICONS = [Frame, Columns3, Blocks, Printer, BookOpenText, ShieldCheck] as const;

export const meta: MetaFunction = ({ params }) => {
  const lang = params.lang;
  const copy = lang && isSupportedLocale(lang) ? marketingCopy[lang] : null;

  return copy
    ? [{ title: copy.metadataTitle }, { content: copy.metadataDescription, name: "description" }]
    : [];
};

export default function HomeRoute() {
  const { lang } = useParams<"lang">();
  const mainContentId = useId();
  const heroTitleId = useId();
  const featureTitleId = useId();
  if (!lang || !isSupportedLocale(lang)) {
    return <Navigate replace to="/en" />;
  }

  const copy = marketingCopy[lang];
  const command = HERO_CODE.join("\n");

  return (
    <HomeLayout
      {...baseOptions(lang)}
      className="imposia-home-layout"
      themeSwitch={{ enabled: false }}
    >
      <a className="skip-link" href={`#${mainContentId}`}>
        {copy.skipLink}
      </a>
      <div className="landing-page" id={mainContentId} tabIndex={-1}>
        <section className="landing-hero" aria-labelledby={heroTitleId}>
          <p className="hero-eyebrow">{copy.eyebrow}</p>
          <h1 id={heroTitleId}>{copy.title}</h1>
          <p className="hero-description">{copy.description}</p>

          <figure className="hero-code">
            <figcaption className="hero-code-bar">
              <span>{copy.codeLabel}</span>
              <CopyCommand
                copiedLabel={copy.copiedLabel}
                copyFailedLabel={copy.copyFailedLabel}
                copyLabel={copy.copyLabel}
                value={command}
              />
            </figcaption>
            <pre>
              <code>
                {HERO_CODE.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </code>
            </pre>
          </figure>

          <div className="hero-actions">
            <a className="button button-primary" href="/examples/demo/">
              {copy.primaryCta}
              <span aria-hidden="true">→</span>
            </a>
            <Link className="button button-secondary" to={`/${lang}/docs`}>
              {copy.docsCta}
            </Link>
          </div>

          <p className="hero-evidence">
            <span>Browser ESM</span>
            <span aria-hidden="true">·</span>
            <span>React 18+</span>
            <span aria-hidden="true">·</span>
            <span>Native print</span>
            <span aria-hidden="true">·</span>
            <span>EPUB 3.3</span>
          </p>
        </section>

        <section className="feature-section" aria-labelledby={featureTitleId}>
          <div className="section-heading">
            <p className="section-eyebrow">{copy.featureEyebrow}</p>
            <h2 id={featureTitleId}>{copy.featureTitle}</h2>
            <p>{copy.featureDescription}</p>
          </div>

          <div className="feature-grid">
            {copy.features.map((feature, index) => {
              const FeatureIcon = FEATURE_ICONS[index] ?? Frame;

              return (
                <article className="feature-card" key={feature.title}>
                  <div className="feature-icon" aria-hidden="true">
                    <FeatureIcon strokeWidth={1.7} />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <span className="feature-proof">{feature.proof}</span>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="landing-footer">
          <Link className="footer-wordmark" to={`/${lang}`}>
            Imposia
          </Link>
          <p>{copy.footerDescription}</p>
          <div className="footer-links">
            <Link to={`/${lang}/docs`}>{copy.docsCta}</Link>
            <a href="/examples/demo/">{copy.primaryCta}</a>
            <Link to={`/${lang}/docs/publishing-contract`}>{copy.publishingContractLabel}</Link>
          </div>
        </footer>
      </div>
    </HomeLayout>
  );
}
