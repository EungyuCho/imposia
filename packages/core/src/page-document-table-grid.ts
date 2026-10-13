/**
 * Logical cell grid of a run of table rows, shared by pagination and the HTML export.
 *
 * Positions follow the HTML table model: a cell takes the first column not occupied by a
 * `rowspan` cell from an earlier row. Occupancy is stored as column intervals with the row
 * they end on, never as one entry per grid slot, so the work depends on the number of cells
 * and not on how large their spans are.
 */
export interface TableGridCell {
  readonly element: Element;
  /** Row index of the cell's first row within the rows the grid was built from. */
  readonly start: number;
  readonly column: number;
  readonly colspan: number;
  readonly rowspan: number;
}

/** Browsers clamp `colspan` to 1000 columns; the same bound keeps column indexes small. */
const MAX_COLSPAN = 1000;
/** Upper bound on interval bookkeeping, so hostile spans cannot make the grid expensive. */
const MAX_GRID_WORK = 2_000_000;

interface Occupied {
  readonly start: number;
  readonly end: number;
  readonly until: number;
}

function spanValue(cell: Element, attribute: "rowspan" | "colspan"): number | undefined {
  const value = cell.getAttribute(attribute);
  if (value === null) return 1;
  if (!/^\d+$/u.test(value.trim())) return undefined;
  const span = Number(value);
  return Number.isSafeInteger(span) && span > 0 ? span : undefined;
}

export function tableRowCells(row: Element): Element[] {
  return [...row.children].filter((child) => {
    const name = child.localName.toLowerCase();
    return name === "td" || name === "th";
  });
}

/** Cell grid of `rows`, or undefined when a span is invalid or the grid is too costly. */
export function buildTableGrid(rows: readonly Element[]): readonly TableGridCell[] | undefined {
  const cells: TableGridCell[] = [];
  let active: Occupied[] = [];
  let work = 0;
  for (const [rowIndex, row] of rows.entries()) {
    active = active.filter((interval) => interval.until > rowIndex);
    const added: Occupied[] = [];
    let next = 0;
    let column = 0;
    for (const cell of tableRowCells(row)) {
      work += 1;
      if (work + active.length > MAX_GRID_WORK) return undefined;
      const rowspan = spanValue(cell, "rowspan");
      const authoredColspan = spanValue(cell, "colspan");
      if (rowspan === undefined || authoredColspan === undefined) return undefined;
      while (next < active.length && (active[next] as Occupied).start <= column) {
        column = Math.max(column, (active[next] as Occupied).end);
        next += 1;
      }
      const colspan = Math.min(authoredColspan, MAX_COLSPAN);
      const span = Math.min(rowspan, rows.length - rowIndex);
      cells.push({ element: cell, start: rowIndex, column, colspan, rowspan: span });
      if (span > 1) added.push({ start: column, end: column + colspan, until: rowIndex + span });
      column += colspan;
    }
    if (added.length > 0) active = [...active, ...added].sort((a, b) => a.start - b.start);
    work += active.length;
  }
  return cells;
}
