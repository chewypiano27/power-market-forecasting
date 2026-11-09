import { colors, type ThemeColors } from "../../theme/colors";

import type { PricePoint } from "../../types/financials";

import { getPricePointTimestamp } from "../../utils/price-history";

const SPARKLINE_FALLBACK_POINTS = 22;

export type PriceSparklineTrend = "positive" | "negative" | "neutral";
export type PriceSparklinePeriod = "1D" | "1W" | "1M" | "1Y";
/** A window, or "all" for every point of a series whose span the caller already chose. */
export type SparklineWindow = PriceSparklinePeriod | "all";

export interface SparklineSample {
  x: number;
  y: number;
}

const PERIOD_WINDOW_DAYS: Record<SparklineWindow, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "1Y": 365,
  all: Number.POSITIVE_INFINITY,
};

const PERIOD_FALLBACK_POINTS: Record<SparklineWindow, number> = {
  "1D": 2,
  "1W": 7,
  "1M": SPARKLINE_FALLBACK_POINTS,
  "1Y": 252,
  all: Number.POSITIVE_INFINITY,
};

function closeValue(point: PricePoint): number | null {
  return Number.isFinite(point.close) ? point.close : null;
}

export function resolveSparklineHistory(priceHistory: PricePoint[], period: SparklineWindow = "1M"): PricePoint[] {
  const validHistory = priceHistory.filter((point) => Number.isFinite(getPricePointTimestamp(point)));
  const latest = validHistory.at(-1);
  if (!latest) return [];

  const latestTime = getPricePointTimestamp(latest);
  if (Number.isFinite(latestTime)) {
    const cutoffTime = latestTime - PERIOD_WINDOW_DAYS[period] * 86_400_000;
    const windowHistory = validHistory.filter((point) => getPricePointTimestamp(point) >= cutoffTime);
    if (windowHistory.length >= 2) return windowHistory;
  }

  return validHistory.slice(-PERIOD_FALLBACK_POINTS[period]);
}

export function sparklineValues(priceHistory: PricePoint[]): number[] {
  return priceHistory
    .map(closeValue)
    .filter((value): value is number => value != null);
}

export function sparklineColor(
  values: number[],
  trend?: PriceSparklineTrend,
  palette: ThemeColors = colors,
): string {
  if (trend === "positive") return palette.positive;
  if (trend === "negative") return palette.negative;
  if (trend === "neutral") return palette.textMuted;

  const first = values[0];
  const last = values.at(-1);
  if (first == null || last == null) return palette.textMuted;
  return last >= first ? palette.positive : palette.negative;
}

export function buildSamples(values: number[], width: number, height: number, padding: number): SparklineSample[] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const left = padding;
  const right = Math.max(left, width - padding);
  const top = padding;
  const bottom = Math.max(top, height - padding);
  return values.map((value, index) => ({
    x: left + (index / Math.max(values.length - 1, 1)) * (right - left),
    y: bottom - ((value - min) / range) * (bottom - top),
  }));
}

export function svgPath(samples: SparklineSample[]): string {
  return samples
    .map((sample, index) => `${index === 0 ? "M" : "L"}${sample.x.toFixed(2)} ${sample.y.toFixed(2)}`)
    .join(" ");
}
