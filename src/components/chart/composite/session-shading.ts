import { isIntradayResolution } from "../../../time-series/resolution";
import type { ResolvedSeries } from "../../../time-series/types";

const DAY_MS = 86_400_000;

/** Whether a series holds intraday bars, by its cadence or its acquired resolution. */
export function isIntradaySeries(series: ResolvedSeries): boolean {
  const cadence = series.timeBasis?.cadenceMs;
  if (cadence !== undefined) return cadence < DAY_MS;
  return !!series.historyResolution && isIntradayResolution(series.historyResolution);
}
