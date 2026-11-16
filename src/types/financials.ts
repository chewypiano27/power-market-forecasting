/** Price observations used by workstation charts and cache metadata. */
export interface Quote {
  symbol: string;
  currency: string;
  price: number;
  lastUpdated: number;
  stale?: boolean;
  providerId?: string;
}

export interface QuoteIntradayBar {
  start: number;
  minutes: number;
}

export interface PricePoint {
  date: Date;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}
