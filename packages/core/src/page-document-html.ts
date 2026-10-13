import { ImposiaError } from "./errors.js";
import { committedFrameGeneration } from "./page-document-frame.js";
import { pageSemanticSnapshot } from "./page-document-semantic.js";
import { buildTableGrid, type TableGridCell } from "./page-document-table-grid.js";
import type { PageDocument } from "./page-document-types.js";

export interface HtmlExportOptions {
  /** Title of the exported document; omit to keep the document's own title. */
  title?: string;
  /**
   * Device pixel ratio of the renderer that will lay the exported HTML out, for example a
   * PDF engine. Cell borders that this renderer would round up to a whole device pixel are
   * widened in the exported copy only, and the cell's padding gives up the same room, so the
   * content width and the line breaks stay as in the preview. Omit it to export unchanged.
   * In a collapsed-border table only edges whose cells all declare the same width are
   * corrected; mixed edges, borders on rows or columns, and tables whose cell grid cannot be
   * built are exported as authored.
   */
  targetDevicePixelRatio?: number;
}

const SIDES = ["top", "right", "bottom", "left"] as const;

function cssLength(value: number): string {
  return `${Number(value.toFixed(6))}px`;
}

type Side = (typeof SIDES)[number];

function borderWidth(view: Window, element: Element, side: Side): number {
  const width = Number.parseFloat(
    view.getComputedStyle(element).getPropertyValue(`border-${side}-width`),
  );
  return Number.isFinite(width) ? width : 0;
}

/**
 * Row groups in rendering order: header groups, then body groups (loose `tr` children form
 * one implicit group), then footer groups. A cell can only span rows of its own group.
 */
function rowGroups(table: Element): Element[][] {
  const head: Element[][] = [];
  const body: Element[][] = [];
  const foot: Element[][] = [];
  let implicit: Element[] | undefined;
  for (const child of table.children) {
    const name = child.localName.toLowerCase();
    if (name === "tr") {
      if (implicit === undefined) {
        implicit = [];
        body.push(implicit);
      }
      implicit.push(child);
      continue;
    }
    const rows = [...child.children].filter((row) => row.localName.toLowerCase() === "tr");
    if (name === "thead") head.push(rows);
    else if (name === "tfoot") foot.push(rows);
    else if (name === "tbody") body.push(rows);
  }
  return [...head, ...body, ...foot];
}

/**
 * Sides of each cell of a `border-collapse: collapse` table whose border can be corrected.
 * Collapsed borders are shared, and the width that is laid out is the widest one declared on
 * that edge, not the cell's own. A side is only safe to correct when every cell facing it
 * (and the table's own border, at the outer edge) declares the same width; mixed edges,
 * borders on rows, row groups, or columns, and tables whose grid cannot be built are left
 * as authored.
 */
function uniformCollapsedEdges(
  view: Window,
  table: Element,
): ReadonlyMap<Element, ReadonlySet<Side>> | undefined {
  // One grid per row group, so a span can never reach into the next group; row indexes are
  // offset to stay unique across the table.
  const rows: Element[] = [];
  const grid: TableGridCell[] = [];
  for (const group of rowGroups(table)) {
    const groupGrid = buildTableGrid(group);
    if (groupGrid === undefined) return undefined;
    for (const cell of groupGrid) grid.push({ ...cell, start: cell.start + rows.length });
    rows.push(...group);
  }
  let area = 0;
  for (const cell of grid) area += cell.rowspan;
  if (area > 200_000) return undefined;
  const furniture = [
    ...rows,
    ...[...table.children].filter((child) =>
      /^(thead|tbody|tfoot|colgroup)$/i.test(child.localName),
    ),
    ...[...table.querySelectorAll(":scope > colgroup > col")],
  ];
  for (const element of furniture) {
    if (SIDES.some((side) => borderWidth(view, element, side) > 0)) return undefined;
  }
  const byRow: TableGridCell[][] = rows.map(() => []);
  for (const cell of grid) {
    for (let row = cell.start; row < cell.start + cell.rowspan; row += 1) byRow[row]?.push(cell);
  }
  for (const cells of byRow) cells.sort((a, b) => a.column - b.column);
  const covering = (row: number, column: number): TableGridCell | undefined =>
    byRow[row]?.find((cell) => cell.column <= column && column < cell.column + cell.colspan);
  const overlapping = (row: number, from: number, to: number): TableGridCell[] =>
    (byRow[row] ?? []).filter((cell) => cell.column < to && cell.column + cell.colspan > from);

  const tableEdge: Record<Side, number> = {
    top: borderWidth(view, table, "top"),
    right: borderWidth(view, table, "right"),
    bottom: borderWidth(view, table, "bottom"),
    left: borderWidth(view, table, "left"),
  };
  const widths = new Map<Element, Record<Side, number>>();
  for (const cell of grid) {
    widths.set(cell.element, {
      top: borderWidth(view, cell.element, "top"),
      right: borderWidth(view, cell.element, "right"),
      bottom: borderWidth(view, cell.element, "bottom"),
      left: borderWidth(view, cell.element, "left"),
    });
  }
  const facing = (cell: TableGridCell, side: Side): number[] => {
    const found: number[] = [];
    const rowEnd = cell.start + cell.rowspan;
    const columnEnd = cell.column + cell.colspan;
    if (side === "left" || side === "right") {
      const column = side === "left" ? cell.column - 1 : columnEnd;
      for (let row = cell.start; row < rowEnd; row += 1) {
        const neighbor = column < 0 ? undefined : covering(row, column);
        if (neighbor === undefined) {
          if (tableEdge[side] > 0) found.push(tableEdge[side]);
        } else {
          found.push(widths.get(neighbor.element)?.[side === "left" ? "right" : "left"] ?? 0);
        }
      }
    } else {
      const row = side === "top" ? cell.start - 1 : rowEnd;
      const neighbors = row < 0 ? [] : overlapping(row, cell.column, columnEnd);
      if (neighbors.length === 0) {
        if (tableEdge[side] > 0) found.push(tableEdge[side]);
      }
      for (const neighbor of neighbors) {
        found.push(widths.get(neighbor.element)?.[side === "top" ? "bottom" : "top"] ?? 0);
      }
    }
    return found;
  };

  const eligible = new Map<Element, Set<Side>>();
  for (const cell of grid) {
    const own = widths.get(cell.element);
    const sides = new Set<Side>();
    for (const side of SIDES) {
      const width = own?.[side] ?? 0;
      if (width > 0 && facing(cell, side).every((other) => Math.abs(other - width) < 0.01)) {
        sides.add(side);
      }
    }
    eligible.set(cell.element, sides);
  }
  return eligible;
}

/**
 * Writes the border and padding of every side of a table cell that the target pixel ratio
 * would thicken into `!important` inline styles on the copy. Values are read from the
 * committed document, so the preview itself is never modified.
 */
function adjustCellBorders(source: Document, clone: Element, targetDevicePixelRatio: number): void {
  const view = source.defaultView;
  if (view === null) return;
  const originals = [...source.querySelectorAll("td, th")];
  const copies = [...clone.querySelectorAll<HTMLElement>("td, th")];
  const collapsedEdges = new Map<Element, ReadonlyMap<Element, ReadonlySet<Side>> | undefined>();
  for (const [index, original] of originals.entries()) {
    const copy = copies[index];
    if (copy === undefined) continue;
    const style = view.getComputedStyle(original);
    const collapsed = style.borderCollapse === "collapse";
    let allowed: ReadonlySet<Side> | undefined;
    if (collapsed) {
      const table = original.closest("table");
      if (table === null) continue;
      if (!collapsedEdges.has(table)) collapsedEdges.set(table, uniformCollapsedEdges(view, table));
      allowed = collapsedEdges.get(table)?.get(original);
      if (allowed === undefined) continue;
    }
    for (const side of SIDES) {
      if (allowed !== undefined && !allowed.has(side)) continue;
      const border = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
      const padding = Number.parseFloat(style.getPropertyValue(`padding-${side}`));
      if (!Number.isFinite(border) || border <= 0 || !Number.isFinite(padding)) continue;
      const targetBorder =
        Math.max(1, Math.floor(border * targetDevicePixelRatio + 0.000001)) /
        targetDevicePixelRatio;
      const adjustment = (targetBorder - border) / (collapsed ? 2 : 1);
      if (!Number.isFinite(adjustment) || adjustment === 0) continue;
      // Without enough padding to give up, the side is left as authored rather than
      // squeezing the content below zero.
      if (padding < adjustment) continue;
      // Left and right edges get a little extra room, so that fractional
      // coordinates rounding in the target renderer cannot wrap a line that just fits.
      const inlineGuard = side === "left" || side === "right" ? 1 / 64 : 0;
      const targetPadding = Math.max(0, padding - adjustment - inlineGuard);
      copy.style.setProperty(`border-${side}-width`, cssLength(targetBorder), "important");
      copy.style.setProperty(`padding-${side}`, cssLength(targetPadding), "important");
    }
  }
}

/**
 * Runs `read` with every page of the live document rendered, then puts each page's inline
 * `content-visibility` back exactly as it was. Pages skipped by the preview have no layout, so
 * anything measured inside them would depend on the current scroll position. The read is
 * synchronous, so no update can interleave with the temporary styles.
 */
function withPagesRendered<T>(source: Document, read: () => T): T {
  const pages = [...source.querySelectorAll<HTMLElement>("[data-imposia-page]")];
  const previous = pages.map(
    (page) =>
      [
        page.style.getPropertyValue("content-visibility"),
        page.style.getPropertyPriority("content-visibility"),
      ] as const,
  );
  try {
    for (const page of pages) page.style.setProperty("content-visibility", "visible", "important");
    return read();
  } finally {
    for (const [index, page] of pages.entries()) {
      const [value, priority] = previous[index] ?? ["", ""];
      if (value === "") page.style.removeProperty("content-visibility");
      else page.style.setProperty("content-visibility", value, priority);
    }
  }
}

/**
 * Anchor positioning is resolved by the browser and does not survive serialization, so each
 * anchored element is frozen at the page coordinate measured on the fully rendered original.
 * Elements anchored through inline styles or stylesheets are both covered.
 */
function freezeAnchoredElements(source: Document, clone: HTMLElement): void {
  const view = source.defaultView;
  const measured = withPagesRendered(source, () => {
    const result: { index: number; left: number; top: number }[] = [];
    const elements = [...source.querySelectorAll<HTMLElement>("[data-imposia-page] *")];
    for (const [index, element] of elements.entries()) {
      const style = view?.getComputedStyle(element);
      const anchored =
        element.style.getPropertyValue("position-anchor") !== "" ||
        style?.getPropertyValue("position-anchor").trim().startsWith("--") === true;
      if (!anchored) continue;
      const page = element.closest<HTMLElement>("[data-imposia-page]");
      if (page === null) continue;
      const rect = element.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      const scaleX = pageRect.width / page.offsetWidth || 1;
      const scaleY = pageRect.height / page.offsetHeight || 1;
      result.push({
        index,
        left:
          (rect.left - pageRect.left) / scaleX - (Number.parseFloat(style?.marginLeft ?? "") || 0),
        top: (rect.top - pageRect.top) / scaleY - (Number.parseFloat(style?.marginTop ?? "") || 0),
      });
    }
    return result;
  });
  const copies = [...clone.querySelectorAll<HTMLElement>("[data-imposia-page] *")];
  for (const { index, left, top } of measured) {
    const copy = copies[index];
    if (copy === undefined) continue;
    copy.style.setProperty("left", `${left}px`);
    copy.style.setProperty("top", `${top}px`);
    copy.style.setProperty("right", "auto");
    copy.style.setProperty("bottom", "auto");
    // Inline declarations are removed; ones from a stylesheet are cancelled by an override.
    for (const name of ["position-anchor", "position-area"]) {
      if (copy.style.getPropertyValue(name) !== "") copy.style.removeProperty(name);
      else copy.style.setProperty(name, "none");
    }
  }
}

const URL_ATTRIBUTES = new Set(["src", "href", "xlink:href", "srcset", "poster", "style"]);

async function blobDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/**
 * Serializes the committed pages as one standalone HTML document. Resolved asset bytes
 * are inlined as data URLs. Everything that reads the live document happens before the
 * first await, so destroying the controller mid-export cannot invalidate the result.
 */
export async function exportPageDocumentHtml(
  document: PageDocument,
  options: HtmlExportOptions = {},
): Promise<string> {
  const targetRatio = options.targetDevicePixelRatio;
  if (
    targetRatio !== undefined &&
    (typeof targetRatio !== "number" || !Number.isFinite(targetRatio) || targetRatio <= 0)
  ) {
    throw new TypeError("targetDevicePixelRatio must be a positive finite number.");
  }
  const snapshot = pageSemanticSnapshot(document);
  const source = document.iframe.contentDocument;
  if (
    snapshot === undefined ||
    source === null ||
    committedFrameGeneration(source) !== document.generation
  ) {
    throw new ImposiaError("DOCUMENT_UNAVAILABLE", "The document is no longer committed.");
  }
  // The copy lives in an inert document: attributes rewritten to data URLs on a copy owned
  // by the frame would be fetched, and the frame's CSP refuses them.
  const inert = source.implementation.createHTMLDocument("");
  const clone = inert.importNode(source.documentElement, true) as HTMLElement;
  for (const element of clone.querySelectorAll(
    "meta[http-equiv], style[data-imposia-viewer-style]",
  )) {
    element.remove();
  }
  // The frame has no charset declaration, and the CSP meta was removed above; without one a
  // consumer saving the string as UTF-8 can have non-ASCII text decoded with another encoding.
  if (clone.querySelector("meta[charset]") === null) {
    const charset = inert.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    clone.querySelector("head")?.prepend(charset);
  }
  clone.removeAttribute("data-imposia-viewer-presentation");
  clone.removeAttribute("data-imposia-viewer-cover");
  if (options.title !== undefined) {
    const title = inert.createElement("title");
    title.textContent = options.title;
    clone.querySelector("title")?.remove();
    clone.querySelector("head")?.append(title);
  }

  freezeAnchoredElements(source, clone);
  // The preview skips rendering of off-screen pages; a consumer that renders the copy under
  // either media type must paint every page.
  for (const page of clone.querySelectorAll<HTMLElement>("[data-imposia-page]")) {
    page.style.setProperty("content-visibility", "visible", "important");
  }

  if (targetRatio !== undefined) adjustCellBorders(source, clone, targetRatio);

  const attributes: Attr[] = [];
  for (const element of clone.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      if (URL_ATTRIBUTES.has(attribute.name)) attributes.push(attribute);
    }
  }
  const styles = [...clone.querySelectorAll("style")];
  const blobs = new Map<string, Blob>();
  for (const asset of snapshot.assets) {
    if (asset.blobUrl !== undefined) blobs.set(asset.blobUrl, asset.bytes);
  }

  const dataUrls = await Promise.all(
    [...blobs].map(async ([url, blob]) => [url, await blobDataUrl(blob)] as const),
  );
  for (const [url, dataUrl] of dataUrls) {
    for (const attribute of attributes) attribute.value = attribute.value.replaceAll(url, dataUrl);
    for (const style of styles) {
      style.textContent = (style.textContent ?? "").replaceAll(url, dataUrl);
    }
  }
  return `<!DOCTYPE html>${clone.outerHTML}`;
}
