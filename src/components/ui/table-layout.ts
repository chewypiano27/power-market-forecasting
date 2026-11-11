import { displayWidth } from "../../utils/format";

export interface TableWidthColumn {
  width: number;
  flexGrow?: number;
  align?: string;
  label?: string;
}

const TRAILING_COLUMN_GUTTER_WIDTH = 1;
const WEB_CELL_UNIT = "var(--cell-w)";

/** Space the sort indicator (" \u25b2") needs on top of the header label. */
const HEADER_RESERVED_WIDTH = 2;

/** Cells the data table puts between two columns. */
export const TABLE_COLUMN_GAP = 1;

/**
 * Blank cells a column gets on top of the regular gap. A right-aligned value
 * ends on its column edge and a left-aligned one starts on the next, so one
 * blank reads as a word space ("47 60 sessions"); a second keeps them apart.
 * Tables that set no gap pack their columns on purpose and get none.
 */
export function tableColumnLeadGap(
  columns: readonly TableWidthColumn[],
  index: number,
  columnGap = TABLE_COLUMN_GAP,
): number {
  if (index <= 0 || columnGap <= 0) return 0;
  const previous = columns[index - 1];
  const column = columns[index];
  return previous?.align === "right" && (column?.align ?? "left") === "left" ? 1 : 0;
}

/**
 * Width a column actually needs: its configured data width, but never less than
 * its own header label plus the sort indicator, so a header is only ever
 * shortened when the pane itself is too narrow for it.
 */
export function tableColumnWidth(column: TableWidthColumn): number {
  const width = Math.max(1, Math.floor(column.width));
  if (!column.label) return width;
  return Math.max(width, displayWidth(column.label) + HEADER_RESERVED_WIDTH);
}

export function getTableWidth(
  columns: readonly TableWidthColumn[],
  columnGap = 1,
  horizontalPadding = 1,
): number {
  return columns.reduce(
    (sum, column, index) => sum + tableColumnLeadGap(columns, index, columnGap) + tableColumnWidth(column) + columnGap,
    horizontalPadding * 2,
  );
}

export function hasMeaningfulTableHorizontalOverflow(
  tableWidth: number,
  viewportWidth: number,
  columnGap = TRAILING_COLUMN_GUTTER_WIDTH,
): boolean {
  return viewportWidth > 0 && tableWidth - viewportWidth > columnGap;
}

function columnMinCh(column: TableWidthColumn): number {
  const width = tableColumnWidth(column);
  const headerFloor = column.label
    ? Math.min(width, displayWidth(column.label) + HEADER_RESERVED_WIDTH)
    : 0;
  const heuristic = (() => {
    if ((column.flexGrow ?? 0) > 0) {
      return Math.max(8, Math.min(18, Math.floor(width * 0.35)));
    }
    if (column.align === "right") {
      return Math.max(3, Math.min(width, 8));
    }
    if (width >= 16) {
      return Math.max(8, Math.min(16, Math.floor(width * 0.35)));
    }
    return Math.max(1, Math.min(width, 8));
  })();
  return Math.max(heuristic, headerFloor);
}

function columnFlexWeight(column: TableWidthColumn): number {
  const flexGrow = column.flexGrow ?? 0;
  const baseWeight = tableColumnWidth(column);
  return flexGrow > 0 ? baseWeight * Math.max(1, flexGrow) : baseWeight;
}

function cellWidthCss(width: number): string {
  return `calc(${width} * ${WEB_CELL_UNIT})`;
}

/**
 * Grid tracks for the desktop table. A column's lead gap is part of its own
 * track (the cell sits after it as a margin), so the tracks add up to
 * getTableWidth and the row and header grids stay in step.
 */
export function buildTableGridTemplateColumns(
  columns: readonly TableWidthColumn[],
  fillAvailableWidth = true,
  columnGap = TABLE_COLUMN_GAP,
): string {
  const hasFlexColumn = columns.some((column) => (column.flexGrow ?? 0) > 0);
  return columns
    .map((column, index) => {
      const lead = tableColumnLeadGap(columns, index, columnGap);
      const width = tableColumnWidth(column) + lead;
      const minWidth = cellWidthCss(columnMinCh(column) + lead);
      if (!fillAvailableWidth) {
        return `minmax(${minWidth}, ${cellWidthCss(width)})`;
      }
      if (!hasFlexColumn || (column.flexGrow ?? 0) > 0) {
        return `minmax(${minWidth}, ${columnFlexWeight(column) + lead}fr)`;
      }
      return `minmax(${minWidth}, ${cellWidthCss(width)})`;
    })
    .join(" ");
}
