// Business documents for the playground. Each template turns a few inputs into
// ordinary HTML and CSS, the way an application would render its own data, and
// Imposia turns that into pages. Page size and margins are authored `@page`
// rules, so changing them is a normal source update rather than a remount.

export type TemplateId = "invoice" | "statement" | "report" | "agreement" | "batch";
export type PageSizeId = "A4" | "Letter" | "A5";
export type Orientation = "portrait" | "landscape";
export type MarginId = "narrow" | "normal" | "wide";

export type PageSetup = Readonly<{
  size: PageSizeId;
  orientation: Orientation;
  margin: MarginId;
}>;

export type TemplateInput = Readonly<{
  count: number;
  name: string;
  page: PageSetup;
}>;

export type Notice = Readonly<{ icon: NoticeIcon; title: string; body: string }>;
export type NoticeIcon = "rows" | "hash" | "scissors" | "grid" | "files" | "pen" | "sum";

export type Template = Readonly<{
  id: TemplateId;
  title: string;
  summary: string;
  countLabel: string;
  countMin: number;
  countMax: number;
  countDefault: number;
  nameLabel: string;
  nameDefault: string;
  notices: readonly Notice[];
  code: string;
}>;

const MARGINS: Readonly<Record<MarginId, string>> = {
  narrow: "10mm",
  normal: "16mm",
  wide: "24mm",
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cssString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", " ")}"`;
}

function money(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const value = Math.abs(cents) / 100;
  return `${sign}$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A small deterministic generator, so the same inputs always make the same document. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

const BASE_CSS = `
  body { margin: 0; color: #16161a; font: 9.5pt/1.45 Geist, system-ui, -apple-system, "Segoe UI", sans-serif; }
  body[data-imposia-pages] { background: #141418; }
  h1 { margin: 0; font-size: 20pt; line-height: 1.1; letter-spacing: -0.02em; }
  h2 { margin: 14pt 0 6pt; font-size: 11.5pt; }
  p { margin: 0 0 6pt; }
  .muted { color: #6b6b75; }
  .mono { font-family: "Geist Mono", ui-monospace, Menlo, Consolas, monospace; }
  .brand { display: flex; align-items: center; gap: 6pt; font-weight: 700; letter-spacing: 0.02em; }
  .brand i { display: inline-block; width: 12pt; height: 12pt; border-radius: 3pt; background: linear-gradient(135deg, #4f46e5, #7c3aed); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16pt; margin-bottom: 16pt; }
  .meta { display: grid; grid-template-columns: auto auto; gap: 2pt 12pt; font-size: 8.5pt; }
  .meta dt { color: #6b6b75; }
  .meta dd { margin: 0; font-weight: 600; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th { padding: 5pt 6pt; background: #f1f0ff; color: #4f46e5; font-weight: 600; text-align: left; font-size: 7.5pt; letter-spacing: 0.04em; text-transform: uppercase; }
  td { padding: 4pt 6pt; border-bottom: 1px solid #ececef; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.mono { white-space: nowrap; }
`;

function pageRule(page: PageSetup, boxes: string): string {
  return `@page { size: ${page.size} ${page.orientation}; margin: ${MARGINS[page.margin]}; ${boxes} }`;
}

const MARGIN_BOX_STYLE = "font-size: 7pt; color: #8a8a93;";

const ITEMS = [
  "Brand strategy workshop",
  "Design system audit",
  "Component library build",
  "Checkout flow redesign",
  "Accessibility review",
  "Usability testing session",
  "Illustration set",
  "Motion guidelines",
  "Content model",
  "Localization pass",
  "Analytics dashboard",
  "Performance budget review",
];

function invoiceBody(
  number: string,
  customer: string,
  items: number,
  seed: number,
  footerLabel?: string,
): string {
  const random = seeded(seed);
  let subtotal = 0;
  const rows = Array.from({ length: items }, (_value, index) => {
    const quantity = 1 + Math.floor(random() * 8);
    const unit = (40 + Math.floor(random() * 460)) * 100;
    const amount = quantity * unit;
    subtotal += amount;
    return `<tr><td>${pick(random, ITEMS)}<div class="muted">Ref. ${number}-${String(index + 1).padStart(3, "0")}</div></td><td class="num">${quantity}</td><td class="num">${money(unit)}</td><td class="num">${money(amount)}</td></tr>`;
  }).join("");
  const tax = Math.round(subtotal * 0.1);
  return `
    <div class="head">
      <div>
        <div class="brand"><i></i>ACME STUDIO</div>
        <p class="muted" style="margin-top:6pt">12 Harbor Street, Portland OR<br>billing@acme.studio</p>
      </div>
      <dl class="meta"><dt>Invoice</dt><dd class="mono">${number}</dd><dt>Issued</dt><dd>Sep 24, 2026</dd><dt>Due</dt><dd>Oct 24, 2026</dd></dl>
    </div>
    <h1${footerLabel === undefined ? "" : ` class="invoice-title" data-invoice="${escapeHtml(footerLabel)}"`}>Invoice</h1>
    <p class="muted" style="margin:4pt 0 14pt">Billed to <strong style="color:#16161a">${escapeHtml(customer)}</strong></p>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals" style="width:45%;margin:10pt 0 0 auto;break-inside:avoid">
      <tbody>
        <tr><td>Subtotal</td><td class="num">${money(subtotal)}</td></tr>
        <tr><td>Tax (10%)</td><td class="num">${money(tax)}</td></tr>
        <tr><td><strong>Total due</strong></td><td class="num"><strong>${money(subtotal + tax)}</strong></td></tr>
      </tbody>
    </table>
    <p class="muted" style="margin-top:16pt;break-inside:avoid">Payment within 30 days by bank transfer. Thank you for your business.</p>`;
}

function invoice({ count, name, page }: TemplateInput): string {
  return `<style>${BASE_CSS}
    ${pageRule(
      page,
      `@bottom-left { content: "Acme Studio · Invoice INV-2026-0142"; ${MARGIN_BOX_STYLE} }
       @bottom-right { content: "Page " counter(page) " of " counter(pages); ${MARGIN_BOX_STYLE} }`,
    )}
  </style>${invoiceBody("INV-2026-0142", name, count, 42)}`;
}

const MERCHANTS = [
  "Blue Bottle Coffee",
  "City Transit",
  "Grocery Outlet",
  "Payroll deposit",
  "Office Depot",
  "Utility payment",
  "Cloud hosting",
  "Airline ticket",
  "Hotel stay",
  "Card refund",
];

const DISPUTE_NOTE = Array.from(
  { length: 26 },
  (_value, index) =>
    `<p>${index === 0 ? "<strong>Dispute correspondence.</strong> " : ""}Customer reported a duplicate authorization on this transaction. The merchant confirmed a single capture, and the pending hold was released after review. Reference ${1000 + index * 37}: case notes recorded by the operations desk and attached to the statement.</p>`,
).join("");

function statement({ count, name, page }: TemplateInput): string {
  const random = seeded(7);
  let balance = 4_821_000;
  const rows = Array.from({ length: count }, (_value, index) => {
    const credit = random() < 0.2;
    const amount = credit
      ? 50_000 + Math.floor(random() * 200_000)
      : -(500 + Math.floor(random() * 40_000));
    balance += amount;
    const day = 1 + (index % 28);
    const month = 7 + Math.floor((index / Math.max(1, count)) * 3);
    const memo =
      index === 6 ? DISPUTE_NOTE : random() < 0.15 ? "Recurring payment · auto-debit" : "";
    return `<tr><td class="mono">2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}</td><td>${pick(random, MERCHANTS)}${memo ? `<div class="muted">${memo}</div>` : ""}</td><td class="num">${money(amount)}</td><td class="num">${money(balance)}</td></tr>`;
  }).join("");
  return `<style>${BASE_CSS}
    ${pageRule(
      page,
      `@top-left { content: "Northwind Bank · Account statement"; ${MARGIN_BOX_STYLE} }
       @top-right { content: ${cssString(name)}; ${MARGIN_BOX_STYLE} }
       @bottom-right { content: "Page " counter(page) " of " counter(pages); ${MARGIN_BOX_STYLE} }`,
    )}
    .summary { display: flex; gap: 24pt; margin: 10pt 0 14pt; }
    .summary span, .summary strong { display: block; }
    .summary strong { font-size: 13pt; }
  </style>
  <div class="head">
    <div class="brand"><i></i>NORTHWIND BANK</div>
    <dl class="meta"><dt>Account</dt><dd class="mono">•••• 4821</dd><dt>Period</dt><dd>Jul 1 – Sep 30, 2026</dd></dl>
  </div>
  <h1>Account statement</h1>
  <p class="muted" style="margin-top:4pt">${escapeHtml(name)}</p>
  <div class="summary">
    <div><span class="muted">Opening balance</span><strong>${money(4_821_000)}</strong></div>
    <div><span class="muted">Closing balance</span><strong>${money(balance)}</strong></div>
    <div><span class="muted">Transactions</span><strong>${count.toLocaleString("en-US")}</strong></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const REGIONS = [
  "Pacific Northwest",
  "Mountain West",
  "Great Lakes",
  "New England",
  "Gulf Coast",
  "Mid-Atlantic",
  "Southeast",
  "Southwest",
  "Northern Plains",
  "California",
];

function bars(random: () => number): string {
  return Array.from({ length: 12 }, () => {
    const height = 20 + Math.floor(random() * 80);
    return `<span style="height:${height}%"></span>`;
  }).join("");
}

function report({ count, name, page }: TemplateInput): string {
  const random = seeded(11);
  const cards = Array.from({ length: count }, (_value, index) => {
    const revenue = 120 + Math.floor(random() * 880);
    const growth = Math.round((random() * 30 - 8) * 10) / 10;
    return `<section class="card"><p class="label">${REGIONS[index % REGIONS.length]}${index >= REGIONS.length ? ` ${Math.floor(index / REGIONS.length) + 1}` : ""}</p><p class="value">$${revenue}k</p><p class="${growth >= 0 ? "up" : "down"}">${growth >= 0 ? "▲" : "▼"} ${Math.abs(growth)}%</p><div class="spark">${bars(random)}</div></section>`;
  }).join("");
  return `<style>${BASE_CSS}
    ${pageRule(
      page,
      `@top-left { content: ${cssString(`${name} · Q3 2026 report`)}; ${MARGIN_BOX_STYLE} }
       @bottom-right { content: "Page " counter(page) " of " counter(pages); ${MARGIN_BOX_STYLE} }`,
    )}
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8pt; }
    .grid > .full { grid-column: 1 / -1; }
    .grid > .wide { grid-column: span 2; }
    .card { box-sizing: border-box; padding: 9pt 10pt; border: 1px solid #e3e3df; border-radius: 6pt; break-inside: avoid; }
    .full h2 { margin: 10pt 0 0; }
    .label { margin: 0; color: #6b6b75; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; }
    .value { margin: 2pt 0 0; font-size: 15pt; font-weight: 700; }
    .up { margin: 0; color: #059669; font-size: 8pt; }
    .down { margin: 0; color: #dc2626; font-size: 8pt; }
    .spark { display: flex; align-items: flex-end; gap: 2pt; height: 34pt; margin-top: 6pt; }
    .spark span { flex: 1; border-radius: 1.5pt; background: linear-gradient(#7c3aed, #4f46e5); }
    .wide .spark { height: 64pt; }
  </style>
  <div class="head"><div class="brand"><i></i>${escapeHtml(name.toUpperCase())}</div><span class="muted">Quarterly business review · Q3 2026</span></div>
  <div class="grid">
    <section class="full"><h1>Q3 at a glance</h1><p class="muted" style="margin-top:4pt">Revenue, retention, and regional performance for July through September.</p></section>
    <section class="card"><p class="label">Revenue</p><p class="value">$8.42M</p><p class="up">▲ 12.4% QoQ</p></section>
    <section class="card"><p class="label">Net retention</p><p class="value">118%</p><p class="up">▲ 3 pts</p></section>
    <section class="card"><p class="label">Active accounts</p><p class="value">2,914</p><p class="down">▼ 1.1%</p></section>
    <section class="card wide"><p class="label">Monthly revenue, trailing 12 months</p><div class="spark">${bars(random)}</div></section>
    <section class="card"><p class="label">Pipeline</p><p class="value">$14.1M</p><p class="up">▲ 22%</p><div class="spark">${bars(random)}</div></section>
    <section class="full"><h2>Regions</h2></section>
    ${cards}
    <section class="full"><h2>Outlook</h2><p>Expansion revenue should carry Q4 while new-logo growth recovers in the Southeast and Gulf Coast. Hiring stays flat until pipeline coverage reaches 3.5×.</p></section>
  </div>`;
}

const CLAUSES = [
  [
    "Services",
    "The Provider will perform the services described in each statement of work with the care, skill, and diligence of a professional provider of similar services.",
  ],
  [
    "Fees and payment",
    "The Client will pay the fees set out in each statement of work within thirty days of receiving a correct invoice. Late amounts accrue interest at one percent per month.",
  ],
  [
    "Confidentiality",
    "Each party will protect the other party's confidential information with at least the care it uses for its own, and will use it only to perform this agreement.",
  ],
  [
    "Intellectual property",
    "Deliverables become the Client's property on full payment. The Provider keeps its pre-existing tools and know-how and grants the Client a license to use them in the deliverables.",
  ],
  [
    "Warranties",
    "The Provider warrants that the services will conform to the statement of work for ninety days after delivery. The Client's remedy is re-performance of the non-conforming services.",
  ],
  [
    "Limitation of liability",
    "Neither party is liable for indirect or consequential damages. Each party's total liability is limited to the fees paid in the twelve months before the claim.",
  ],
  [
    "Term and termination",
    "This agreement runs for two years and renews for one-year terms unless either party gives sixty days' notice. Either party may terminate for an uncured material breach.",
  ],
  [
    "Governing law",
    "This agreement is governed by the laws of the State of Oregon, and the parties submit to the courts of Multnomah County.",
  ],
] as const;

function agreement({ count, name, page }: TemplateInput): string {
  const clauses = Array.from({ length: count }, (_value, index) => {
    const [title, text] = CLAUSES[index % CLAUSES.length] ?? CLAUSES[0];
    const number = index + 1;
    return `<section class="clause"><h2>${number}. ${title}</h2><p>${number}.1 ${text}</p><p>${number}.2 ${text}</p><p>${number}.3 Notices under this section are given in writing to the addresses in the order form and take effect on receipt.</p></section>`;
  }).join("");
  return `<style>${BASE_CSS}
    ${pageRule(
      page,
      `@top-left { content: "Master services agreement"; ${MARGIN_BOX_STYLE} }
       @top-right { content: string(clause); ${MARGIN_BOX_STYLE} }
       @bottom-center { content: "Page " counter(page) " of " counter(pages); ${MARGIN_BOX_STYLE} }`,
    )}
    @page :first { @top-left { content: none; } @top-right { content: none; } }
    body { font-family: Georgia, "Times New Roman", serif; font-size: 10pt; line-height: 1.55; }
    .clause h2 { string-set: clause content(); font-family: Geist, system-ui, sans-serif; break-after: avoid; }
    .parties { margin: 12pt 0 18pt; padding: 10pt 12pt; background: #f6f6f4; border-radius: 6pt; font-family: Geist, system-ui, sans-serif; font-size: 9pt; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24pt; margin-top: 28pt; break-inside: avoid; font-family: Geist, system-ui, sans-serif; font-size: 8.5pt; }
    .sign div { padding-top: 28pt; border-top: 1px solid #16161a; }
  </style>
  <div class="head"><div class="brand" style="font-family:Geist,system-ui,sans-serif"><i></i>ACME STUDIO</div><span class="muted" style="font-family:Geist,system-ui,sans-serif">Agreement MSA-2026-17</span></div>
  <h1>Master services agreement</h1>
  <div class="parties">Between <strong>Acme Studio LLC</strong> (the Provider) and <strong>${escapeHtml(name)}</strong> (the Client), effective September 24, 2026.</div>
  ${clauses}
  <div class="sign"><div>For Acme Studio LLC<br><span class="muted">Name, title, date</span></div><div>For ${escapeHtml(name)}<br><span class="muted">Name, title, date</span></div></div>`;
}

const BATCH_CUSTOMERS = [
  "Northwind Traders",
  "Contoso Ltd.",
  "Fabrikam Inc.",
  "Tailspin Toys",
  "Wide World Importers",
  "Adventure Works",
  "Litware Inc.",
  "Proseware",
];

export type BatchEntry = Readonly<{ id: string; title: string; html: string }>;

/** One invoice per entry; each gets its own `Page X of Y` through per-entry numbering. */
export function batchEntries({ count, name, page }: TemplateInput): readonly BatchEntry[] {
  return Array.from({ length: count }, (_value, index) => {
    const number = `INV-2026-${String(201 + index).padStart(4, "0")}`;
    const customer = index === 0 ? name : (BATCH_CUSTOMERS[index % BATCH_CUSTOMERS.length] ?? name);
    const items = 6 + ((index * 17) % 34);
    return {
      id: number.toLowerCase(),
      title: `${number} · ${customer}`,
      // Every entry's CSS applies to the whole batch, so the footer reads the
      // invoice number from a named string each invoice sets for itself.
      html: `<style>${BASE_CSS}
        ${pageRule(
          page,
          `@bottom-left { content: string(invoice); ${MARGIN_BOX_STYLE} }
           @bottom-right { content: "Page " counter(page) " of " counter(pages); ${MARGIN_BOX_STYLE} }`,
        )}
        .invoice-title { string-set: invoice attr(data-invoice); }
      </style>${invoiceBody(number, customer, items, 100 + index, `Acme Studio · Invoice ${number}`)}`,
    };
  });
}

export function templateHtml(id: Exclude<TemplateId, "batch">, input: TemplateInput): string {
  if (id === "invoice") return invoice(input);
  if (id === "statement") return statement(input);
  if (id === "report") return report(input);
  return agreement(input);
}

export const TEMPLATES: readonly Template[] = [
  {
    id: "invoice",
    title: "Invoice",
    summary: "Line items and totals, footer on every page",
    countLabel: "Line items",
    countMin: 3,
    countMax: 400,
    countDefault: 24,
    nameLabel: "Customer",
    nameDefault: "Northwind Traders",
    notices: [
      {
        icon: "rows",
        title: "The column header repeats",
        body: "Add line items until the table spills onto page 2. Description · Qty · Unit · Amount is there again at the top.",
      },
      {
        icon: "hash",
        title: "Page 1 of 3 in the footer",
        body: "The footer is a CSS @page margin box. The total is counted once the last page is known.",
      },
      {
        icon: "sum",
        title: "Totals never split",
        body: "The totals block uses break-inside: avoid, so it moves to the next page whole instead of losing its last line.",
      },
    ],
    code: `<ImposiaPageViewer
  ref={viewer}
  source={{ html: renderInvoice(order) }}
/>

// A print button in your own toolbar
<button onClick={() => viewer.current?.print()}>
  Print / Save as PDF
</button>`,
  },
  {
    id: "statement",
    title: "Account statement",
    summary: "Thousands of rows, header repeats",
    countLabel: "Transactions",
    countMin: 10,
    countMax: 2000,
    countDefault: 240,
    nameLabel: "Account holder",
    nameDefault: "Northwind Traders",
    notices: [
      {
        icon: "rows",
        title: "Header repeats on every page",
        body: "Scroll to any page: Date · Description · Amount · Balance is still at the top of the table.",
      },
      {
        icon: "scissors",
        title: "A row taller than a page splits",
        body: "Transaction 7 carries a long dispute note. It continues in the same column on the next page instead of being cut off.",
      },
      {
        icon: "hash",
        title: "Running head from your data",
        body: "The account holder in the top-right margin box comes from the field on the left.",
      },
    ],
    code: `<ImposiaPageViewer
  source={{ html: renderStatement(transactions) }}
  // Re-render on every change. Imposia keeps the
  // last complete pages on screen until the next
  // set is ready.
/>`,
  },
  {
    id: "report",
    title: "Quarterly report",
    summary: "Dashboard grid, charts, sections",
    countLabel: "Regions",
    countMin: 3,
    countMax: 80,
    countDefault: 12,
    nameLabel: "Company",
    nameDefault: "Northwind Traders",
    notices: [
      {
        icon: "grid",
        title: "The grid breaks between rows",
        body: "Cards never split. Full-width headings and the two-column chart keep their places on every page.",
      },
      {
        icon: "rows",
        title: "Your CSS, unchanged",
        body: "This is ordinary CSS Grid with grid-column: span 2 and 1 / -1. No layout rewrite for print.",
      },
      {
        icon: "hash",
        title: "Company name in the margin",
        body: "Type a company name on the left; the running head updates on every page.",
      },
    ],
    code: `.grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
}
.full { grid-column: 1 / -1; }
.wide { grid-column: span 2; }
.card { break-inside: avoid; }`,
  },
  {
    id: "agreement",
    title: "Service agreement",
    summary: "Long clauses, Page X of Y",
    countLabel: "Clauses",
    countMin: 3,
    countMax: 80,
    countDefault: 16,
    nameLabel: "Client",
    nameDefault: "Northwind Traders",
    notices: [
      {
        icon: "pen",
        title: "The current clause in the header",
        body: "string-set copies each clause title into the top-right margin box of the page it is on.",
      },
      {
        icon: "hash",
        title: "Page X of Y at the bottom",
        body: "counter(page) and counter(pages) in @bottom-center, with no header on the cover page.",
      },
      {
        icon: "rows",
        title: "Headings stay with their text",
        body: "break-after: avoid keeps a clause title from being stranded at the bottom of a page.",
      },
    ],
    code: `@page {
  @top-right { content: string(clause); }
  @bottom-center {
    content: "Page " counter(page) " of " counter(pages);
  }
}
h2 { string-set: clause content(); }`,
  },
  {
    id: "batch",
    title: "Invoice batch",
    summary: "Each invoice numbered from page 1",
    countLabel: "Invoices",
    countMin: 2,
    countMax: 30,
    countDefault: 6,
    nameLabel: "First customer",
    nameDefault: "Northwind Traders",
    notices: [
      {
        icon: "files",
        title: "Each invoice has its own page numbers",
        body: "One print job, many documents: every invoice starts on a new page and reads Page 1 of N.",
      },
      {
        icon: "hash",
        title: "One print dialog for the whole batch",
        body: "Print once to send every invoice to the printer, or save the batch as a single PDF.",
      },
      {
        icon: "rows",
        title: "Long invoices still repeat headers",
        body: "An invoice that spills onto a second page keeps its table header and its own page count.",
      },
    ],
    code: `<ImposiaPublicationViewer
  snapshot={{
    metadata: { title: "September invoices" },
    entries: invoices.map(toEntry),
  }}
  publicationOptions={{ pageNumbering: "entry" }}
/>`,
  },
];
