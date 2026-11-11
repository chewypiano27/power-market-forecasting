/** Declared by the actual history source, independently of quote session state. */
export interface HistorySession {
  version: 1;
  kind: "regular";
  calendar: "us-equity";
  timeZone: "America/New_York";
  symbol: string;
  exchange: string;
  interval: string;
  source: "power";
  timestampConvention: "bar-open" | "bar-open-with-final-observation";
  barAlignment: "session-open" | "clock";
  /** Actual acquisition time, retained unchanged through source/cache projections. */
  observedAt: number;
}
