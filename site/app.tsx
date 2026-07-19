import type { ChangeEvent, KeyboardEvent } from "react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CONTENT,
  isLocale,
  LOCALES,
  type Locale,
  type MarketingCopy,
  type MetaCopy,
  type SectionHeadingCopy,
} from "./content.js";

const LOCALE_STORAGE_KEY = "imposia.homepage.locale";

type CodeTab = "react" | "core";
type CopyStatus = "idle" | "copied" | "failed";

const PAGE_IDS = {
  top: "top",
  main: "main-content",
  heroTitle: "hero-title",
  why: "why-imposia",
  whyTitle: "why-title",
  how: "how-it-works",
  howTitle: "how-title",
  compatibility: "compatibility",
  compatibilityTitle: "compatibility-title",
  packages: "packages",
  packagesTitle: "packages-title",
  quickStart: "quick-start",
  quickStartTitle: "quick-start-title",
  closingTitle: "closing-title",
} as const;

const CODE_TAB_IDS: Readonly<Record<CodeTab, { tab: string; panel: string }>> = {
  react: { tab: "quick-start-react-tab", panel: "quick-start-react-panel" },
  core: { tab: "quick-start-core-tab", panel: "quick-start-core-panel" },
};

const INSTALL_COMMANDS: Readonly<Record<CodeTab, string>> = {
  react: "pnpm add @imposia/react react react-dom",
  core: "pnpm add @imposia/core",
};

function readStoredLocale(): Locale {
  try {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(storedLocale)) return storedLocale;
  } catch {}

  return "en";
}

function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {}
}

function setMetaContent(selector: string, value: string): void {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", value);
}

function applyDocumentCopy(locale: Locale, meta: MetaCopy, skipLinkText: string): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:title"]', meta.socialTitle);
  setMetaContent('meta[property="og:description"]', meta.socialDescription);
  setMetaContent('meta[property="og:locale"]', meta.openGraphLocale);
  setMetaContent('meta[name="twitter:title"]', meta.socialTitle);
  setMetaContent('meta[name="twitter:description"]', meta.socialDescription);

  const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link");
  if (skipLink !== null) skipLink.textContent = skipLinkText;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = value;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.inset = "0 auto auto -9999px";
    document.body.append(fallback);
    fallback.select();

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      fallback.remove();
    }
  }
}

function reactSample(sampleText: string): string {
  return `import { ImposiaPageViewer } from "@imposia/react";
import "@imposia/react/styles.css";

export function Preview() {
  return (
    <ImposiaPageViewer
      source={{
        html: "<article><h1>Imposia</h1><p>${sampleText}</p></article>",
      }}
      documentOptions={{ page: { size: "A4", margin: "18mm" } }}
      viewerOptions={{ mode: "spread", spread: { cover: true } }}
    />
  );
}`;
}

function coreSample(sampleText: string): string {
  return `import { mountPageDocument } from "@imposia/core";

const host = document.querySelector<HTMLElement>("#preview");

if (host) {
  const controller = mountPageDocument(host, {
    html: "<article><h1>Imposia</h1><p>${sampleText}</p></article>",
  });

  await controller.ready;
}`;
}

function RegistrationMarks() {
  return (
    <div className="registration-marks" aria-hidden="true">
      <span className="registration-mark">+</span>
      <span className="registration-mark">×</span>
    </div>
  );
}

function SectionHeader({
  copy: sectionCopy,
  headingId,
}: {
  copy: SectionHeadingCopy;
  headingId: string;
}) {
  return (
    <header className="section-header">
      <span className="section-index">{sectionCopy.index}</span>
      <h2 id={headingId}>{sectionCopy.title}</h2>
      <p>{sectionCopy.description}</p>
    </header>
  );
}

function Homepage({ initialLocale }: { initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [codeTab, setCodeTab] = useState<CodeTab>("react");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const marketingCopy: MarketingCopy = CONTENT[locale];
  const installCommand = INSTALL_COMMANDS[codeTab];
  const year = new Date().getFullYear();

  useEffect(() => {
    applyDocumentCopy(locale, marketingCopy.meta, marketingCopy.skipLink);
  }, [locale, marketingCopy]);

  function handleLocaleChange(event: ChangeEvent<HTMLSelectElement>): void {
    const nextLocale = event.currentTarget.value;
    if (!isLocale(nextLocale)) return;

    storeLocale(nextLocale);
    setCopyStatus("idle");
    setLocale(nextLocale);
  }

  function selectCodeTab(nextTab: CodeTab): void {
    setCodeTab(nextTab);
    setCopyStatus("idle");
  }

  function handleCodeTabKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    let nextTab: CodeTab | undefined;

    if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "Home") {
      nextTab = "react";
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "End") {
      nextTab = "core";
    }

    if (nextTab === undefined) return;
    event.preventDefault();
    selectCodeTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(CODE_TAB_IDS[nextTab].tab)?.focus();
    });
  }

  async function handleCopyInstall(): Promise<void> {
    const copied = await copyText(installCommand);
    setCopyStatus(copied ? "copied" : "failed");
  }

  const copyButtonText =
    copyStatus === "copied"
      ? marketingCopy.quickStart.copied
      : copyStatus === "failed"
        ? marketingCopy.quickStart.copyFailed
        : marketingCopy.quickStart.copyInstall;

  return (
    <div className="site-shell" id={PAGE_IDS.top}>
      <header className="masthead">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            Imposia
            <span className="brand-note">{marketingCopy.brandNote}</span>
          </span>
        </a>

        <nav className="nav" aria-label={marketingCopy.primaryNavigationLabel}>
          <a href="#why-imposia">{marketingCopy.nav.why}</a>
          <a href="#how-it-works">{marketingCopy.nav.how}</a>
          <a href="#compatibility">{marketingCopy.nav.compatibility}</a>
          <a href="#packages">{marketingCopy.nav.packages}</a>
          <a href="#quick-start">{marketingCopy.nav.quickStart}</a>
        </nav>

        <select
          className="language-select"
          aria-label={marketingCopy.languageLabel}
          value={locale}
          onChange={handleLocaleChange}
        >
          {LOCALES.map((availableLocale) => (
            <option key={availableLocale} value={availableLocale}>
              {marketingCopy.languageNames[availableLocale]}
            </option>
          ))}
        </select>
      </header>

      <main id={PAGE_IDS.main} tabIndex={-1}>
        <section className="hero" aria-labelledby={PAGE_IDS.heroTitle}>
          <div className="hero-copy">
            <p className="eyebrow">{marketingCopy.hero.eyebrow}</p>
            <h1 id={PAGE_IDS.heroTitle}>
              {marketingCopy.hero.titleStart}
              <em>{marketingCopy.hero.titleEmphasis}</em>
            </h1>
            <p className="hero-lede">{marketingCopy.hero.lede}</p>
            <div className="hero-actions">
              <a className="button button-primary" href="/examples/demo/">
                {marketingCopy.hero.demoCta}
              </a>
              <a className="button button-secondary" href="#compatibility">
                {marketingCopy.hero.contractCta}
              </a>
            </div>
          </div>

          <figure className="hero-proof" aria-label={marketingCopy.hero.proofLabel}>
            <div className="page-stack" aria-hidden="true" />
            <div className="source-sheet">
              <div className="source-sheet__header">
                <span>{marketingCopy.hero.sheetKind}</span>
                <span>{marketingCopy.hero.sheetFormat}</span>
              </div>
              <p className="source-sheet-title">{marketingCopy.hero.sheetTitle}</p>
              <div className="source-sheet__footer">
                <span>{marketingCopy.hero.sheetSource}</span>
                <span>{marketingCopy.hero.sheetGeneration}</span>
              </div>
            </div>
            <div className="commit-mark">{marketingCopy.hero.commitMark}</div>
          </figure>
        </section>

        <aside className="invariant-strip" aria-label={marketingCopy.invariantsLabel}>
          {marketingCopy.invariants.map((invariant) => (
            <div key={invariant.title}>
              <strong>{invariant.title}</strong>
              <span>{invariant.detail}</span>
            </div>
          ))}
        </aside>

        <section className="section" id={PAGE_IDS.why} aria-labelledby={PAGE_IDS.whyTitle}>
          <SectionHeader copy={marketingCopy.why.heading} headingId={PAGE_IDS.whyTitle} />
          <div className="section-body">
            <p>{marketingCopy.why.body}</p>
            <figure className="drift-diagram" aria-label={marketingCopy.why.diagramLabel}>
              <svg viewBox="0 0 800 360" aria-hidden="true" focusable="false">
                <line className="axis" x1="60" y1="180" x2="740" y2="180" />
                <path d="M 92 92 C 245 86, 265 180, 400 180 S 565 280, 704 270" />
                <circle className="node" cx="92" cy="92" r="9" />
                <circle className="node" cx="400" cy="180" r="9" />
                <circle className="node" cx="704" cy="270" r="9" />
              </svg>
              <div className="drift-label drift-label--source">
                <strong>{marketingCopy.why.source.title}</strong>
                {marketingCopy.why.source.detail}
              </div>
              <div className="drift-label drift-label--draft">
                <strong>{marketingCopy.why.staged.title}</strong>
                {marketingCopy.why.staged.detail}
              </div>
              <div className="drift-label drift-label--committed">
                <strong>{marketingCopy.why.committed.title}</strong>
                {marketingCopy.why.committed.detail}
              </div>
            </figure>
          </div>
          <RegistrationMarks />
        </section>

        <section className="section" id={PAGE_IDS.how} aria-labelledby={PAGE_IDS.howTitle}>
          <SectionHeader copy={marketingCopy.how.heading} headingId={PAGE_IDS.howTitle} />
          <div className="section-body">
            <p>{marketingCopy.how.body}</p>
            <ol className="workflow" aria-label={marketingCopy.how.workflowLabel}>
              {marketingCopy.how.steps.map((step) => (
                <li className="workflow-step" key={step.number}>
                  <span className="workflow-step__number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </li>
              ))}
            </ol>

            <aside className="lab-panel" aria-label={marketingCopy.how.lab.label}>
              <div className="lab-panel__head">
                <span>{marketingCopy.how.lab.header}</span>
                <span className="lab-status">{marketingCopy.how.lab.status}</span>
              </div>
              <div className="lab-panel__body">
                <div>
                  <h3>{marketingCopy.how.lab.title}</h3>
                  <p>{marketingCopy.how.lab.description}</p>
                  <div className="hero-actions">
                    <a className="button button-primary" href="/examples/demo/">
                      {marketingCopy.how.lab.cta}
                    </a>
                  </div>
                </div>
                <dl>
                  {marketingCopy.how.lab.metrics.map((metric) => (
                    <div className="lab-panel__metric" key={metric.term}>
                      <dt>{metric.term}</dt>
                      <dd>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </aside>
          </div>
          <RegistrationMarks />
        </section>

        <section
          className="section"
          id={PAGE_IDS.compatibility}
          aria-labelledby={PAGE_IDS.compatibilityTitle}
        >
          <SectionHeader
            copy={marketingCopy.compatibility.heading}
            headingId={PAGE_IDS.compatibilityTitle}
          />
          <div className="section-body">
            <table className="contract-ledger">
              <caption>{marketingCopy.compatibility.tableCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{marketingCopy.compatibility.capabilityHeader}</th>
                  <th scope="col">{marketingCopy.compatibility.contractHeader}</th>
                  <th scope="col">{marketingCopy.compatibility.statusHeader}</th>
                </tr>
              </thead>
              <tbody>
                {marketingCopy.compatibility.rows.map((row) => (
                  <tr key={row.capability}>
                    <td>{row.capability}</td>
                    <td>{row.contract}</td>
                    <td>
                      <span className="ledger-status">{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RegistrationMarks />
        </section>

        <section
          className="section"
          id={PAGE_IDS.packages}
          aria-labelledby={PAGE_IDS.packagesTitle}
        >
          <SectionHeader copy={marketingCopy.packages.heading} headingId={PAGE_IDS.packagesTitle} />
          <div className="section-body">
            <div className="package-matrix">
              {marketingCopy.packages.items.map((item) => (
                <article key={item.name}>
                  <span className="package-matrix__name">{item.name}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <span className="package-matrix__rule" aria-hidden="true" />
                </article>
              ))}
            </div>
          </div>
          <RegistrationMarks />
        </section>

        <section
          className="section"
          id={PAGE_IDS.quickStart}
          aria-labelledby={PAGE_IDS.quickStartTitle}
        >
          <SectionHeader
            copy={marketingCopy.quickStart.heading}
            headingId={PAGE_IDS.quickStartTitle}
          />
          <div className="section-body">
            <div className="quickstart">
              <div className="quickstart-copy">
                <h3>{marketingCopy.quickStart.title}</h3>
                <p>{marketingCopy.quickStart.description}</p>
              </div>

              <div className="code-panel">
                <div className="code-panel__head">
                  <div
                    className="code-panel__tabs"
                    role="tablist"
                    aria-label={marketingCopy.quickStart.tabListLabel}
                  >
                    <button
                      className="code-panel__action"
                      id={CODE_TAB_IDS.react.tab}
                      type="button"
                      role="tab"
                      aria-selected={codeTab === "react"}
                      aria-controls={CODE_TAB_IDS.react.panel}
                      tabIndex={codeTab === "react" ? 0 : -1}
                      onClick={() => selectCodeTab("react")}
                      onKeyDown={handleCodeTabKeyDown}
                    >
                      {marketingCopy.quickStart.reactTab}
                    </button>
                    <button
                      className="code-panel__action"
                      id={CODE_TAB_IDS.core.tab}
                      type="button"
                      role="tab"
                      aria-selected={codeTab === "core"}
                      aria-controls={CODE_TAB_IDS.core.panel}
                      tabIndex={codeTab === "core" ? 0 : -1}
                      onClick={() => selectCodeTab("core")}
                      onKeyDown={handleCodeTabKeyDown}
                    >
                      {marketingCopy.quickStart.coreTab}
                    </button>
                  </div>

                  <button
                    className="code-panel__action code-panel__action--copy"
                    type="button"
                    aria-live="polite"
                    onClick={() => void handleCopyInstall()}
                  >
                    {copyButtonText}
                  </button>
                </div>

                <div
                  id={CODE_TAB_IDS.react.panel}
                  role="tabpanel"
                  aria-labelledby={CODE_TAB_IDS.react.tab}
                  hidden={codeTab !== "react"}
                >
                  <code>{`${INSTALL_COMMANDS.react}\n\n${reactSample(marketingCopy.quickStart.sampleText)}`}</code>
                </div>
                <div
                  id={CODE_TAB_IDS.core.panel}
                  role="tabpanel"
                  aria-labelledby={CODE_TAB_IDS.core.tab}
                  hidden={codeTab !== "core"}
                >
                  <code>{`${INSTALL_COMMANDS.core}\n\n${coreSample(marketingCopy.quickStart.sampleText)}`}</code>
                </div>
              </div>
            </div>
          </div>
          <RegistrationMarks />
        </section>

        <section className="closing" aria-labelledby={PAGE_IDS.closingTitle}>
          <div className="closing-copy">
            <p className="eyebrow">{marketingCopy.closing.eyebrow}</p>
            <h2 id={PAGE_IDS.closingTitle}>{marketingCopy.closing.title}</h2>
            <p>{marketingCopy.closing.description}</p>
            <div className="hero-actions">
              <a className="button button-primary" href="/examples/demo/">
                {marketingCopy.closing.cta}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <a className="brand" href="#top">
            <span className="brand-mark" aria-hidden="true" />
            <span>Imposia</span>
          </a>
          <p>{marketingCopy.footer.tagline}</p>
        </div>
        <nav className="footer-links" aria-label={marketingCopy.footerNavigationLabel}>
          <ul>
            <li>
              <a href="/examples/demo/">{marketingCopy.footer.demo}</a>
            </li>
            <li>
              <a href="#quick-start">{marketingCopy.footer.readme}</a>
            </li>
            <li>
              <a href="#compatibility">{marketingCopy.footer.compatibility}</a>
            </li>
          </ul>
        </nav>
        <div className="footer-meta">
          <strong>{marketingCopy.footer.metaTitle}</strong>
          {marketingCopy.footer.metaBody}
          <br />
          {marketingCopy.footer.license}
          <br />© {year} {marketingCopy.footer.contributors}
        </div>
        <RegistrationMarks />
      </footer>
    </div>
  );
}

const initialLocale = readStoredLocale();
const initialCopy = CONTENT[initialLocale];
applyDocumentCopy(initialLocale, initialCopy.meta, initialCopy.skipLink);

const rootElement = document.getElementById("app");
if (rootElement === null) throw new Error("Imposia homepage root was not found.");

createRoot(rootElement).render(
  <StrictMode>
    <Homepage initialLocale={initialLocale} />
  </StrictMode>,
);
