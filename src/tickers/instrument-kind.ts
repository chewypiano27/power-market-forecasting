import type { TickerInstrumentKind } from "../types/instrument";

const KIND_BY_TYPE: Record<string, TickerInstrumentKind> = {
  STK: "equity",
  STOCK: "equity",
  EQUITY: "equity",
  COMMONSTOCK: "equity",
  ADR: "equity",
  DEPOSITARYRECEIPT: "equity",
  AMERICANDEPOSITARYRECEIPT: "equity",
  GLOBALDEPOSITARYRECEIPT: "equity",
  LIMITEDPARTNERSHIP: "equity",
  REIT: "equity",
  PREFERREDSTOCK: "equity",
  ETF: "fund",
  ETN: "fund",
  ETP: "fund",
  FUND: "fund",
  MUTUALFUND: "fund",
  CEF: "fund",
  CLOSEDEND: "fund",
  CLOSEDENDFUND: "fund",
  EXCHANGETRADEDFUND: "fund",
  MONEYMARKET: "fund",
  CRYPTO: "crypto",
  CRYPTOCURRENCY: "crypto",
  DIGITALCURRENCY: "crypto",
  COIN: "crypto",
  TOKEN: "crypto",
  CASH: "currency",
  FX: "currency",
  FOREX: "currency",
  CCY: "currency",
  CURRENCY: "currency",
  CURRENCYPAIR: "currency",
  IND: "index",
  INDEX: "index",
  IDX: "index",
  FUT: "future",
  FUTURE: "future",
  FUTURES: "future",
  CONTFUT: "future",
  PERP: "perpetual",
  PERPETUAL: "perpetual",
  KALSHI: "prediction",
  OPT: "option",
  OPTION: "option",
  OPTIONS: "option",
  FOP: "option",
  BOND: "bond",
  BILL: "bond",
  FIXEDINCOME: "bond",
  WAR: "other",
  WARRANT: "other",
  CFD: "other",
  CMDTY: "other",
};

function normalizeInstrumentType(type: string | null | undefined): string {
  return (type ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

/** A provider or broker type string, or null when it names nothing known. */
export function classifyInstrumentType(type: string | null | undefined): TickerInstrumentKind | null {
  const normalized = normalizeInstrumentType(type);
  if (!normalized) return null;
  const exact = KIND_BY_TYPE[normalized];
  if (exact) return exact;
  if (normalized.includes("CRYPTO")) return "crypto";
  if (normalized.includes("ETF") || normalized.includes("FUND")) return "fund";
  if (normalized.includes("FOREX") || normalized.includes("CURRENCY")) return "currency";
  return null;
}
