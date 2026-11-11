import {
  CHART_RESOLUTION_STEP_MS,
  chartBarSizeStepMs,
  type ChartBarSize,
  type ManualChartResolution,
} from "./resolution";

import type { SeriesPeriod } from "./types";

const MARKET_PERIOD_MAX_RESOLUTION: Partial<Record<SeriesPeriod, ManualChartResolution>> = {
  daily: "1d",
  weekly: "1wk",
  monthly: "1mo",
};

export function maximumResolutionForMarketPeriod(
  period: SeriesPeriod | undefined,
): ManualChartResolution | null {
  return period ? MARKET_PERIOD_MAX_RESOLUTION[period] ?? null : null;
}

export function isResolutionFineEnoughForMarketPeriod(
  resolution: ChartBarSize,
  period: SeriesPeriod | undefined,
): boolean {
  const maximum = maximumResolutionForMarketPeriod(period);
  return maximum === null
    || chartBarSizeStepMs(resolution) <= CHART_RESOLUTION_STEP_MS[maximum];
}
