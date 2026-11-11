import type { ChartBarSizeUnit, ChartResolution, TimeRange } from "./range";
import { CHART_RESOLUTIONS, TIME_RANGES } from "./range";

/** The bar sizes sources and brokers serve, and the only ones they are asked for. */
export type ManualChartResolution = "1m" | "5m" | "15m" | "30m" | "45m" | "1h" | "1d" | "1wk" | "1mo";
/** Any bar size a chart draws: one a source serves, or one built from them. */
export type ChartBarSize = Exclude<ChartResolution, "auto">;

export interface ChartResolutionSupport {
  resolution: ManualChartResolution;
  maxRange: TimeRange;
}

/** @deprecated Use `TIME_RANGES` from `vic1/time-series`; this is the same array. */
export const TIME_RANGE_ORDER = TIME_RANGES;
const CHART_RESOLUTION_ORDER = CHART_RESOLUTIONS;

const CHART_RESOLUTION_LABELS: Record<ManualChartResolution | "auto", string> = {
  auto: "AUTO",
  "1m": "1M",
  "5m": "5M",
  "15m": "15M",
  "30m": "30M",
  "45m": "45M",
  "1h": "1H",
  "1d": "1D",
  "1wk": "1W",
  "1mo": "1MO",
};

/**
 * The bar size a price history for a range is served in, unlike the chart
 * presets above: what `power history` and the historical prices pane get.
 */
export const RANGE_HISTORY_RESOLUTION: Readonly<Record<TimeRange, ManualChartResolution>> = {
  "1D": "5m",
  "1W": "1h",
  "1M": "1d",
  "3M": "1d",
  "6M": "1d",
  "1Y": "1d",
  "5Y": "1wk",
  "ALL": "1mo",
};

export const CHART_RESOLUTION_STEP_MS: Record<ManualChartResolution, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "45m": 45 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1wk": 7 * 24 * 60 * 60_000,
  "1mo": 30 * 24 * 60 * 60_000,
};

export type BarIntervalUnit = "min" | "h" | "day" | "week" | "month";

/** One bar of each unit in milliseconds; a month counts as 30 days. */
export const BAR_INTERVAL_UNIT_MS: Readonly<Record<BarIntervalUnit, number>> = {
  min: 60_000,
  h: 60 * 60_000,
  day: 24 * 60 * 60_000,
  week: 7 * 24 * 60 * 60_000,
  month: 30 * 24 * 60 * 60_000,
};

const TIME_RANGE_INDEX = new Map(TIME_RANGES.map((range, index) => [range, index]));

function getTimeRangeIndex(range: TimeRange): number {
  return TIME_RANGE_INDEX.get(range) ?? 0;
}

function compareTimeRange(left: TimeRange, right: TimeRange): number {
  return getTimeRangeIndex(left) - getTimeRangeIndex(right);
}

export function isManualChartResolution(value: unknown): value is ManualChartResolution {
  return value !== "auto" && CHART_RESOLUTION_ORDER.includes(value as ChartResolution);
}

const BAR_SIZE_UNIT_MS: Readonly<Record<ChartBarSizeUnit, number>> = {
  m: 60_000,
  h: 60 * 60_000,
  d: 24 * 60 * 60_000,
  wk: 7 * 24 * 60 * 60_000,
  mo: 30 * 24 * 60 * 60_000,
};

/** The longest bar of each unit: a day of minutes or hours, a year of days, weeks or months. */
const BAR_SIZE_MAX_COUNT: Readonly<Record<ChartBarSizeUnit, number>> = { m: 1440, h: 24, d: 365, wk: 52, mo: 12 };

/** A bar size in its one stored form: `90m`, `4h` (not `240m`), `2d`, `1wk`, `3mo`. */
function canonicalBarSize(count: number, unit: ChartBarSizeUnit): ChartBarSize | null {
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  if (unit === "m" && count % 60 === 0) return canonicalBarSize(count / 60, "h");
  if (count > BAR_SIZE_MAX_COUNT[unit]) return null;
  return `${count}${unit}` as ChartBarSize;
}

/** A stored bar size's count and unit; null for anything that is not one. */
export function chartBarSizeParts(size: unknown): { count: number; unit: ChartBarSizeUnit } | null {
  if (typeof size !== "string") return null;
  const match = /^([1-9]\d{0,3})(m|h|d|wk|mo)$/.exec(size);
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2] as ChartBarSizeUnit;
  return canonicalBarSize(count, unit) === size ? { count, unit } : null;
}

/** A stored bar size (`4h`, `2d`, `1wk`); `auto` is not one. */
function isChartBarSize(value: unknown): value is ChartBarSize {
  return chartBarSizeParts(value) !== null;
}

/** Any value a chart's resolution may hold: `auto` or a stored bar size. */
export function isChartResolution(value: unknown): value is ChartResolution {
  return value === "auto" || isChartBarSize(value);
}

/** How long one bar is; a month counts as 30 days. */
export function chartBarSizeStepMs(size: ChartBarSize): number {
  const parts = chartBarSizeParts(size);
  return parts ? parts.count * BAR_SIZE_UNIT_MS[parts.unit] : Number.NaN;
}

/**
 * Every bar size the chart lists, shortest first: the ones sources serve and
 * the ones most asked for that it builds from them. Any other is typed in.
 */
export const CHART_BAR_SIZE_PRESETS: readonly ChartBarSize[] = [
  "1m", "5m", "10m", "15m", "30m", "45m", "1h", "2h", "4h", "1d", "2d", "3d", "1wk", "1mo",
];

const CUSTOM_BAR_UNIT_LABELS: Readonly<Record<ChartBarSizeUnit, string>> = { m: "M", h: "H", d: "D", wk: "W", mo: "MO" };

export function getChartResolutionLabel(resolution: ChartResolution): string {
  if (isManualChartResolution(resolution) || resolution === "auto") return CHART_RESOLUTION_LABELS[resolution];
  const parts = chartBarSizeParts(resolution);
  return parts ? `${parts.count}${CUSTOM_BAR_UNIT_LABELS[parts.unit]}` : String(resolution).toUpperCase();
}

function sortChartResolutionSupport(support: readonly ChartResolutionSupport[]): ChartResolutionSupport[] {
  return [...support].sort((left, right) => (
    CHART_RESOLUTION_ORDER.indexOf(left.resolution) - CHART_RESOLUTION_ORDER.indexOf(right.resolution)
  ));
}

export function normalizeChartResolutionSupport(support: readonly ChartResolutionSupport[]): ChartResolutionSupport[] {
  const byResolution = new Map<ManualChartResolution, TimeRange>();
  for (const entry of support) {
    if (!isManualChartResolution(entry.resolution)) continue;
    const current = byResolution.get(entry.resolution);
    byResolution.set(
      entry.resolution,
      current ? (compareTimeRange(current, entry.maxRange) >= 0 ? current : entry.maxRange) : entry.maxRange,
    );
  }
  return sortChartResolutionSupport(
    [...byResolution.entries()].map(([resolution, maxRange]) => ({ resolution, maxRange })),
  );
}

/** provider-shaped support used for first paint when broker/provider support is async. */
export const DEFAULT_CHART_RESOLUTION_SUPPORT: ChartResolutionSupport[] = normalizeChartResolutionSupport([
  { resolution: "5m", maxRange: "1W" },
  { resolution: "15m", maxRange: "1M" },
  { resolution: "1h", maxRange: "3M" },
  { resolution: "1d", maxRange: "5Y" },
  { resolution: "1wk", maxRange: "ALL" },
  { resolution: "1mo", maxRange: "ALL" },
]);

export function isIntradayResolution(resolution: ManualChartResolution): boolean {
  return resolution === "1m"
    || resolution === "5m"
    || resolution === "15m"
    || resolution === "30m"
    || resolution === "45m"
    || resolution === "1h";
}
