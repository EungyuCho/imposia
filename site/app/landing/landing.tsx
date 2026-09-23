import {
  ArrowRight,
  ArrowUpRight,
  Atom,
  BookOpen,
  Check,
  Copy,
  Cpu,
  FileText,
  Globe,
  Image,
  Info,
  Languages,
  Layers,
  Lock,
  type LucideIcon,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import baseline from "../../../benchmarks/baseline.json";
import { LOCALE_NAMES, LOCALES, type Locale } from "../../lib/i18n";
import { LANDING_COPY } from "./copy";

const GITHUB_URL = "https://github.com/EungyuCho/imposia";
const NPM_URL = "https://www.npmjs.com/org/imposia";
const DEMO_PATH = "/examples/demo/index.html";
const INSTALL_COMMAND = "pnpm add @imposia/react";

const FEATURE_ICONS: readonly LucideIcon[] = [FileText, Printer, ShieldCheck, Layers, Atom, Lock];

function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Mark({ iconSize, className }: { iconSize: number; className: string }) {
  return (
    <span className={className}>
      <BookOpen aria-hidden="true" color="#fff" size={iconSize} strokeWidth={2.2} />
    </span>
  );
}

interface BenchmarkScenario {
  readonly id: string;
  readonly median: number;
  readonly pageCount: number;
}

function benchmarkValue(id: string): string {
  const scenario = (baseline.scenarios as readonly BenchmarkScenario[]).find(
    (item) => item.id === id,
  );
  if (scenario === undefined) throw new Error(`benchmarks/baseline.json has no "${id}" scenario.`);
  const value = scenario.median;
  return value < 10 && !Number.isInteger(value) ? value.toFixed(1) : String(Math.round(value));
}

function chromiumMajor(): string {
  return baseline.environment.chromiumVersion.split(".", 1)[0] ?? "";
}

// A deliberately small highlighter for the two fixed snippets below.
const TOKEN_PATTERN =
  /(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*")|\b(import|from|export|function|const|return|type)\b|(<\/?)([A-Za-z]+)|\b([a-zA-Z]+)(?==[{"])|\b(useRef|print)\b(?=[<(])|([a-z-]+)(?=:\s)|(\d+)/g;

function highlight(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(line.slice(last, index));
    const [text, comment, string, keyword, bracket, tag, attribute, call, property, number] = match;
    if (comment)
      nodes.push(
        <span className="lp-tok-comment" key={index}>
          {comment}
        </span>,
      );
    else if (string)
      nodes.push(
        <span className="lp-tok-string" key={index}>
          {string}
        </span>,
      );
    else if (keyword)
      nodes.push(
        <span className="lp-tok-keyword" key={index}>
          {keyword}
        </span>,
      );
    else if (bracket && tag) {
      nodes.push(
        bracket,
        <span className="lp-tok-tag" key={index}>
          {tag}
        </span>,
      );
    } else if (attribute)
      nodes.push(
        <span className="lp-tok-attr" key={index}>
          {attribute}
        </span>,
      );
    else if (call)
      nodes.push(
        <span className="lp-tok-call" key={index}>
          {call}
        </span>,
      );
    else if (property)
      nodes.push(
        <span className="lp-tok-attr" key={index}>
          {property}
        </span>,
      );
    else if (number)
      nodes.push(
        <span className="lp-tok-string" key={index}>
          {number}
        </span>,
      );
    else nodes.push(text);
    last = index + text.length;
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
}

const CODE_FILES = [
  {
    name: "Report.tsx",
    lines: [
      'import { useRef } from "react";',
      'import { ImposiaPageViewer, type ImposiaPageViewerHandle } from "@imposia/react";',
      'import "@imposia/react/styles.css";',
      "",
      "export function Report({ html }: { html: string }) {",
      "  const viewer = useRef<ImposiaPageViewerHandle>(null);",
      "  return (",
      "    <>",
      "      <ImposiaPageViewer",
      "        ref={viewer}",
      "        source={{ html }}",
      '        documentOptions={{ page: { size: "A4", margin: "18mm" } }}',
      "      />",
      "      <button onClick={() => viewer.current?.print()}>",
      "        Print or save as PDF",
      "      </button>",
      "    </>",
      "  );",
      "}",
    ],
  },
  {
    name: "styles.css",
    lines: [
      "/* Your own CSS still applies inside the pages. */",
      "h2 {",
      "  break-before: page;",
      "}",
      "",
      "figure {",
      "  break-inside: avoid;",
      "}",
    ],
  },
] as const;

/** Pairs each entry with its 1-based position, which is its stable identity here. */
function numberedLines<T>(items: readonly T[]): { number: number; text: T }[] {
  return items.map((text, position) => ({ number: position + 1, text }));
}

const MOCK_TABLE_ROWS = ["head", "row-1", "row-2", "row-3", "row-4"] as const;

function CodeWindow({ label }: { label: string }) {
  const [active, setActive] = useState(0);
  const file = CODE_FILES[active] ?? CODE_FILES[0];
  return (
    <div className="lp-code">
      <div aria-label={label} className="lp-code-tabs" role="tablist">
        {CODE_FILES.map((item, index) => (
          <button
            aria-controls="lp-code-panel"
            aria-selected={index === active}
            className="lp-code-tab"
            key={item.name}
            onClick={() => setActive(index)}
            role="tab"
            type="button"
          >
            {item.name}
          </button>
        ))}
      </div>
      {/* Scrollable regions are keyboard-focusable in current browsers. */}
      <pre className="lp-code-body" id="lp-code-panel" role="tabpanel">
        <code>
          {numberedLines(file.lines).map((line) => (
            <span className="lp-code-line" key={`${file.name}-${line.number}`}>
              <span aria-hidden="true" className="lp-code-ln">
                {line.number}
              </span>
              {highlight(line.text)}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function CopyInstall({ label, copiedLabel }: { label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={copied ? copiedLabel : label}
      className="lp-cta-install"
      onClick={() => {
        void navigator.clipboard?.writeText(INSTALL_COMMAND).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      type="button"
    >
      <code>{INSTALL_COMMAND}</code>
      {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
    </button>
  );
}

function MockLines({ widths }: { widths: readonly number[] }) {
  return numberedLines(widths).map((line) => (
    <span className="lp-mock-line" key={line.number} style={{ width: `${line.text}%` }} />
  ));
}

function ViewerMock({ label }: { label: string }) {
  return (
    <figure aria-label={label} className="lp-viewer" role="img">
      <div className="lp-viewer-bar">
        <span className="lp-viewer-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="lp-viewer-title">{"<ImposiaPageViewer />"}</span>
        <span className="lp-viewer-modes">
          <span>Single</span>
          <span className="is-active">Spread</span>
        </span>
        <span className="lp-viewer-print">
          <Printer aria-hidden="true" size={13} />
          Print
        </span>
      </div>
      <div className="lp-viewer-stage">
        <div className="lp-mock-page">
          <div className="lp-mock-body">
            <span className="lp-mock-kicker">CHAPTER 2</span>
            <span className="lp-mock-heading">The shape of a page</span>
            <span className="lp-mock-gap" />
            <MockLines widths={[100, 96, 100, 88, 100, 72]} />
            <span className="lp-mock-figure">
              <Image aria-hidden="true" color="#A5A0F0" size={20} />
            </span>
            <MockLines widths={[100, 94, 100, 97, 100, 60]} />
          </div>
          <div className="lp-mock-folio">
            <span>Field Notes</span>
            <span>4</span>
          </div>
        </div>
        <div className="lp-mock-page lp-mock-page-right">
          <div className="lp-mock-body">
            <MockLines widths={[100, 92, 64]} />
            <span className="lp-mock-subheading">Tables that break cleanly</span>
            <span className="lp-mock-table">
              {MOCK_TABLE_ROWS.map((row) => (
                <span className="lp-mock-row" key={row}>
                  <span />
                  <span />
                  <span />
                </span>
              ))}
            </span>
            <MockLines widths={[100, 95, 100, 90, 100, 97, 100, 86, 58]} />
          </div>
          <div className="lp-mock-folio">
            <span>Field Notes</span>
            <span>5</span>
          </div>
        </div>
      </div>
      <div className="lp-viewer-status">
        <span className="lp-viewer-meta">
          <span>A4 · 18mm</span>
          <span>Spread</span>
        </span>
        <span className="lp-viewer-meta">
          <span className="lp-viewer-ok">committed</span>
          <span className="lp-viewer-pages">4–5 / 12</span>
        </span>
      </div>
    </figure>
  );
}

function LanguageMenu({ lang, label }: { lang: Locale; label: string }) {
  return (
    <details className="lp-lang">
      <summary aria-label={label}>
        <Languages aria-hidden="true" size={16} />
        <span>{lang === "zh-CN" ? "ZH" : lang.toUpperCase()}</span>
      </summary>
      <ul>
        {LOCALES.map((locale) => (
          <li key={locale}>
            <Link
              aria-current={locale === lang ? "page" : undefined}
              lang={locale}
              to={`/${locale}`}
            >
              {LOCALE_NAMES[locale]}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Landing({ lang }: { lang: Locale }) {
  const copy = LANDING_COPY[lang];
  const docs = `/${lang}/docs`;
  const stats = [
    { ...copy.bench.stats.edit, value: benchmarkValue("report-update"), unit: "ms" },
    { ...copy.bench.stats.large, value: benchmarkValue("large-mount"), unit: "ms" },
    { ...copy.bench.stats.print, value: benchmarkValue("print-call"), unit: "ms" },
    { ...copy.bench.stats.partial, value: benchmarkValue("partial-frames") },
  ];
  const packages = [
    { name: "@imposia/react", icon: Atom, description: copy.packages.descriptions.react },
    { name: "@imposia/core", icon: Cpu, description: copy.packages.descriptions.core },
    { name: "@imposia/viewer", icon: BookOpen, description: copy.packages.descriptions.viewer },
    { name: "@imposia/client", icon: Globe, description: copy.packages.descriptions.client },
  ];

  return (
    <div className="lp" id="imposia-landing">
      <header className="lp-nav">
        <nav aria-label="Imposia" className="lp-nav-left">
          <Link className="lp-logo" to={`/${lang}`}>
            <Mark className="lp-mark" iconSize={14} />
            <span>Imposia</span>
          </Link>
          <Link className="lp-nav-link" to={docs}>
            {copy.nav.docs}
          </Link>
          <a className="lp-nav-link lp-nav-optional" href={DEMO_PATH}>
            {copy.nav.examples}
          </a>
          <Link className="lp-nav-link lp-nav-optional" to={`${docs}/api`}>
            {copy.nav.api}
          </Link>
          <a
            className="lp-nav-link lp-nav-optional"
            href={GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
        <LanguageMenu label={copy.nav.language} lang={lang} />
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-badge">
              <span className="lp-badge-tag">{copy.hero.badgeTag}</span>
              {copy.hero.badge}
            </p>
            <h1 className="lp-wordmark">
              <Mark className="lp-wordmark-mark" iconSize={40} />
              <span className="lp-wordmark-text">Imposia</span>
            </h1>
            <p className="lp-tagline">{copy.hero.tagline}</p>
            <div className="lp-install">
              <code>
                <span aria-hidden="true" className="lp-prompt">
                  $
                </span>
                {INSTALL_COMMAND}
              </code>
              <code>
                <span aria-hidden="true" className="lp-prompt">
                  ›
                </span>
                {'import { ImposiaPageViewer } from "@imposia/react"'}
              </code>
            </div>
            <div className="lp-ctas">
              <Link className="lp-btn lp-btn-primary" to={`${docs}/getting-started`}>
                {copy.hero.getStarted}
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <a
                className="lp-btn lp-btn-secondary"
                href={GITHUB_URL}
                rel="noreferrer"
                target="_blank"
              >
                <GithubMark />
                GitHub
              </a>
              <a className="lp-btn lp-btn-tertiary" href={DEMO_PATH}>
                {copy.hero.demo}
                <ArrowUpRight aria-hidden="true" size={15} />
              </a>
            </div>
          </div>
          <ViewerMock label={copy.hero.viewerLabel} />
        </section>

        <section aria-labelledby="lp-features-title" className="lp-section lp-features">
          <header className="lp-section-head lp-center">
            <p className="lp-eyebrow">{copy.features.eyebrow}</p>
            <h2 className="lp-title" id="lp-features-title">
              {copy.features.title}
            </h2>
            <p className="lp-subtitle">{copy.features.subtitle}</p>
          </header>
          <ul className="lp-feature-grid">
            {copy.features.items.map((feature, index) => {
              const Icon = FEATURE_ICONS[index] ?? FileText;
              return (
                <li className="lp-card lp-feature" key={feature.title}>
                  <span className="lp-icon-box">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="lp-how-title" className="lp-how">
          <div className="lp-how-inner">
            <div className="lp-how-copy">
              <header className="lp-section-head">
                <p className="lp-eyebrow">{copy.how.eyebrow}</p>
                <h2 className="lp-title" id="lp-how-title">
                  {copy.how.title}
                </h2>
                <p className="lp-subtitle">{copy.how.subtitle}</p>
              </header>
              <ol className="lp-steps">
                {copy.how.steps.map((step, index) => (
                  <li key={step.title}>
                    <span className="lp-step-no">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <CodeWindow label={copy.how.codeLabel} />
          </div>
        </section>

        <section aria-labelledby="lp-bench-title" className="lp-section">
          <header className="lp-bench-head">
            <div className="lp-section-head">
              <p className="lp-eyebrow">{copy.bench.eyebrow}</p>
              <h2 className="lp-title" id="lp-bench-title">
                {copy.bench.title}
              </h2>
              <p className="lp-subtitle">{copy.bench.subtitle}</p>
            </div>
            <p className="lp-env">
              <Cpu aria-hidden="true" size={14} />
              {`${baseline.environment.cpuModel} · Chromium ${chromiumMajor()} · ${copy.bench.medianOf} ${baseline.runs.measured}`}
            </p>
          </header>
          <dl className="lp-stats">
            {stats.map((stat) => (
              <div className="lp-stat" key={stat.label}>
                <dt>{stat.label}</dt>
                <dd className="lp-stat-value">
                  <span>{stat.value}</span>
                  <span className="lp-stat-unit">{stat.unit}</span>
                </dd>
                <dd className="lp-stat-desc">{stat.description}</dd>
              </div>
            ))}
          </dl>
          <p className="lp-footnote">
            <Info aria-hidden="true" size={14} />
            {`Imposia 0.6.0 (unreleased) · ${copy.bench.footnote}`}
          </p>
        </section>

        <section aria-labelledby="lp-packages-title" className="lp-section lp-packages">
          <header className="lp-bench-head">
            <div className="lp-section-head">
              <p className="lp-eyebrow">{copy.packages.eyebrow}</p>
              <h2 className="lp-title lp-title-small" id="lp-packages-title">
                {copy.packages.title}
              </h2>
            </div>
            <a className="lp-text-link" href={NPM_URL} rel="noreferrer" target="_blank">
              {copy.packages.npm}
              <ArrowUpRight aria-hidden="true" size={16} />
            </a>
          </header>
          <ul className="lp-package-row">
            {packages.map((item, index) => (
              <li
                className={index === 0 ? "lp-package is-recommended" : "lp-package"}
                key={item.name}
              >
                <span className="lp-package-top">
                  <item.icon aria-hidden="true" size={22} />
                  {index === 0 ? <span className="lp-tag">{copy.packages.recommended}</span> : null}
                </span>
                <a
                  className="lp-package-name"
                  href={`https://www.npmjs.com/package/${item.name}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.name}
                </a>
                <p>{item.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-final">
          <div className="lp-final-panel">
            <h2>{copy.cta.title}</h2>
            <p>{copy.cta.subtitle}</p>
            <div className="lp-ctas">
              <Link className="lp-btn lp-btn-light" to={docs}>
                {copy.cta.docs}
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <CopyInstall copiedLabel={copy.cta.copied} label={copy.cta.copy} />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="lp-footer-left">
          <Mark className="lp-mark lp-mark-small" iconSize={12} />
          Imposia · Apache-2.0
        </span>
        <nav aria-label="Footer" className="lp-footer-links">
          <Link to={docs}>{copy.footer.docs}</Link>
          <Link to={`${docs}/changelog`}>{copy.footer.changelog}</Link>
          <a href={NPM_URL} rel="noreferrer" target="_blank">
            npm
          </a>
          <a href={GITHUB_URL} rel="noreferrer" target="_blank">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  );
}
