import { classifyInstrumentType } from "../../tickers/instrument-kind";

/**
 * The unit an index level is in, as a chart's axis and series name it. A
 * generic future on an index reads in the same points.
 */
export const INDEX_POINTS_UNIT = "points";

/** How a report line names that unit: `history` heads an index's bars with it, `ticker` its quote. */
export const INDEX_POINTS_LABEL = "Index points";

/** How an export names it, in `currency_or_unit` and a `unit` field. */
export const INDEX_POINTS_EXPORT_UNIT = "index points";

/**
 * An index level is points, not money: ^GSPC at 7,805.45 or ^VIX at 19.99 has
 * no currency to name, wherever it is shown, though its quote names the
 * currency its members trade in.
 */
export function isIndexLevel(instrumentType: string | null | undefined): boolean {
  return classifyInstrumentType(instrumentType) === "index";
}
