import type { PageExtension, PageExtensionFinalizePageInput } from "../page-document-types.js";
import { cssPx } from "../page-media.js";

const SYNTHESIZED_COLGROUP_MARKER = "data-imposia-synthesized-colgroup";
const DEFAULT_EXTENSION_NAME = "imposia/table-colgroup";

export interface TableColgroupExtensionOptions {
  readonly name?: string;
}

function tableCellColspan(cell: Element): number | undefined {
  const value = cell.getAttribute("colspan")?.trim();
  if (value === undefined || value === "") return 1;
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const colspan = Number.parseInt(value, 10);
  return Number.isSafeInteger(colspan) ? colspan : undefined;
}

function directRows(table: Element): readonly Element[] {
  const rows: Element[] = [];
  for (const group of table.children) {
    if (group.localName !== "thead" && group.localName !== "tbody" && group.localName !== "tfoot") {
      continue;
    }
    for (const row of group.children) {
      if (row.localName === "tr") rows.push(row);
    }
  }
  return rows;
}

function measuredTableColumnWidths(table: Element): readonly number[] | undefined {
  for (const row of directRows(table)) {
    const cells = [...row.children].filter(
      (cell) => cell.localName === "td" || cell.localName === "th",
    );
    if (cells.length === 0 || !cells.every((cell) => tableCellColspan(cell) === 1)) continue;
    const widths = cells.map((cell) => cell.getBoundingClientRect().width);
    if (widths.some((width) => width <= 0)) continue;
    return Object.freeze(widths);
  }
  return undefined;
}

function directColgroups(table: Element): readonly Element[] {
  return [...table.children].filter((child) => child.localName === "colgroup");
}

function hasInlineStyle(
  element: Element,
): element is Element & { readonly style: CSSStyleDeclaration } {
  return "style" in element;
}

function insertSynthesizedColgroup(fragment: Element, widths: readonly number[]): void {
  const colgroup = fragment.ownerDocument.createElement("colgroup");
  colgroup.setAttribute(SYNTHESIZED_COLGROUP_MARKER, "");
  for (const width of widths) {
    const col = fragment.ownerDocument.createElement("col");
    col.style.width = cssPx(width);
    colgroup.append(col);
  }
  const furniture = [...fragment.children].find(
    (child) =>
      child.localName === "thead" || child.localName === "tbody" || child.localName === "tfoot",
  );
  if (furniture === undefined) fragment.append(colgroup);
  else fragment.insertBefore(colgroup, furniture);
}

function freezeFragmentColumnWidths(fragment: Element, widths: readonly number[]): void {
  const colgroups = directColgroups(fragment);
  if (colgroups.some((colgroup) => colgroup.hasAttribute(SYNTHESIZED_COLGROUP_MARKER))) return;
  if (colgroups.length === 0) {
    insertSynthesizedColgroup(fragment, widths);
    return;
  }
  const columns = colgroups.flatMap((colgroup) =>
    [...colgroup.children].filter((child) => child.localName === "col"),
  );
  if (
    columns.length !== widths.length ||
    columns.some((column) => (column.getAttribute("span")?.trim() || "1") !== "1")
  ) {
    return;
  }
  for (const [index, column] of columns.entries()) {
    const width = widths[index];
    if (width === undefined) continue;
    if (
      column.getAttribute("width") === null &&
      hasInlineStyle(column) &&
      column.style.width === ""
    ) {
      column.style.width = cssPx(width);
    }
  }
}

export function createTableColgroupExtension(
  options: TableColgroupExtensionOptions = {},
): PageExtension {
  return Object.freeze({
    name: options.name ?? DEFAULT_EXTENSION_NAME,
    finalizePage({ tableFragments }: PageExtensionFinalizePageInput): void {
      const measured = new Map<Element, readonly number[] | undefined>();
      for (const { origin, fragment } of tableFragments) {
        if (!measured.has(origin)) measured.set(origin, measuredTableColumnWidths(origin));
        const widths = measured.get(origin);
        if (widths === undefined) continue;
        freezeFragmentColumnWidths(fragment, widths);
      }
    },
  });
}
