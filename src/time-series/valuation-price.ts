import type { PricePoint, Quote } from "../types/financials";

export type ValuationPriceIssue = ({
  kind: "quote";
  reason: "stale" | "invalid-price" | "invalid-timestamp";
  quote: Pick<Quote, "symbol" | "currency" | "price" | "lastUpdated" | "stale" | "providerId">;
} | {
  kind: "history";
  reason: "invalid-price";
  point: Omit<PricePoint, "date"> & { date: string };
}) & { affectedAt?: string };
