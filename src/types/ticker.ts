import type { BrokerContractRef, PriceBasis } from "./instrument";

export interface TickerPosition {
  portfolio: string;
  shares: number;
  /** Absent when the source did not provide a finite cost; explicit zero is retained. */
  avgCost?: number;
  priceBasis?: PriceBasis;
  currency?: string;
  dateAcquired?: string;
  /**
   * What one unit of the lot's `currency` cost in `costFxCurrency` when it was
   * bought: entered with the position, or the FX close of its purchase date.
   * Valued in that currency, the lot's cost converts at this rate rather than
   * today's, so its P&L carries the currency's move since.
   */
  costFxRate?: number;
  /** The currency `costFxRate` converts the cost into: the portfolio's when it was entered. */
  costFxCurrency?: string; // "manual" | future broker plugin IDs
  side?: "long" | "short";
  marketValue?: number;
  unrealizedPnl?: number;
  /** Contract multiplier (e.g. 100 for options) */
  multiplier?: number;
  /** Last known mark price from broker snapshot */
  markPrice?: number;
  brokerInstanceId?: string;
  brokerAccountId?: string;
  brokerContractId?: number;
  /** Source-declared fallback contract identity when no canonical conId was supplied. */
  brokerContractIdentity?: string;
}

export interface TickerMetadata {
  ticker: string;
  exchange: string;
  currency: string;
  name: string;
  sector?: string;
  industry?: string;
  assetCategory?: string; // STK, ETF, OPT, FUT, BOND, etc.
  isin?: string;
  cusip?: string;
  portfolios: string[];
  watchlists: string[];
  positions: TickerPosition[];
  broker_contracts?: BrokerContractRef[];
  custom: Record<string, unknown>;
  tags: string[];
  /**
   * Lots this listing's row took from rows saved under a vendor's suffixed
   * key (GARAN.IS:BIST into GARAN:BIST), by that key, each as the fields sync
   * keeps: a copy an older build or sync brings back is not counted twice.
   * Bookkeeping, never shown, and no reason on its own to keep a row.
   */
  mergedLots?: Record<string, string[]>;
}

export interface TickerRecord {
  metadata: TickerMetadata;
}
