import type { PricePoint } from "../types/financials";

type ReportedPricePoint = Readonly<Omit<PricePoint, "date" | "historySource"> & {
  date: string;
  historySource?: Readonly<NonNullable<PricePoint["historySource"]>>;
}>;

export interface PriceHistoryIntegrity {
  readonly reason: "inconsistent-ohlc";
  /** Original reported values, retained for inspection, never used as replacements. */
  readonly sourcePoints: ReadonlyArray<ReportedPricePoint>;
}

/** What a bar without volume shows in a history that reports volume: missing, never 0. */
export const MISSING_VOLUME_TEXT = "\u2014";
