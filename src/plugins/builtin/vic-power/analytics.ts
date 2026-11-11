import { zonedWallClockToUtcMs } from "../../../utils/zoned-date-time";
import type { RegionalPricePoint } from "./data";
import type { VicMarketPoint } from "./model";

export const NEM_TIME_ZONE = "Australia/Brisbane";
export const WEATHER_TIME_ZONE = "Australia/Melbourne";

export const DISPATCH_MS = 5 * 60_000;
export const SPOT_REGIONS = ["VIC1", "NSW1", "SA1"] as const;

/** AEMO's unzoned dispatch timestamps use fixed AEST, including summer. */
export function dispatchTime(value: string): number {
  const iso = value.replace(" ", "T");
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : `${iso}+10:00`);
}

/** A real market instant; charts display it on the fixed NEM AEST clock. */
export function chartDate(value: string): Date {
  return new Date(dispatchTime(value));
}

/** Open-Meteo supplies Melbourne wall time, including daylight saving. */
export function weatherChartDate(value: string): Date {
  if (/(?:Z|[+-]\d\d:\d\d)$/.test(value)) return new Date(value);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!parts) return new Date(NaN);
  return new Date(zonedWallClockToUtcMs(WEATHER_TIME_ZONE,
    Number(parts[1]), Number(parts[2]), Number(parts[3]), Number(parts[4]), Number(parts[5]), Number(parts[6] ?? 0)));
}

export function marketIsFresh(settlementDate: string, fetchedAt: string, now: number): boolean {
  const dispatchAge = now - dispatchTime(settlementDate);
  const fetchAge = now - Date.parse(fetchedAt);
  return dispatchAge >= -DISPATCH_MS && dispatchAge <= 15 * 60_000 && fetchAge >= 0 && fetchAge <= 15 * 60_000;
}

function observationAt(points: readonly VicMarketPoint[], target: number): VicMarketPoint | null {
  // Comparisons require the actual dispatch interval, never an arbitrarily old print.
  return points.find((point) => point.timestamp && dispatchTime(point.timestamp) === target) ?? null;
}

export function marketComparisons(points: readonly VicMarketPoint[]) {
  const sorted = points.filter((point) => point.timestamp && Number.isFinite(dispatchTime(point.timestamp)))
    .toSorted((left, right) => dispatchTime(left.timestamp!) - dispatchTime(right.timestamp!));
  const current = sorted.at(-1) ?? null;
  const now = current?.timestamp ? dispatchTime(current.timestamp) : NaN;
  const noon = current?.timestamp ? dispatchTime(`${current.timestamp.slice(0, 10)}T12:00:00`) : NaN;
  const thirtyMinutesAgo = observationAt(sorted, now - 30 * 60_000);
  const lunch = now >= noon ? observationAt(sorted, noon) : null;
  return { points: sorted, current, thirtyMinutesAgo, lunch };
}

export interface RegionalDispatch {
  timestamp: string;
  time: number;
  prices: Partial<Record<RegionalPricePoint["regionId"], number>>;
}

/** One row per dispatch; missing legs stay missing rather than being carried forward. */
export function regionalDispatches(points: readonly RegionalPricePoint[]): RegionalDispatch[] {
  const groups = new Map<number, RegionalDispatch>();
  for (const point of points) {
    const time = dispatchTime(point.timestamp);
    if (!Number.isFinite(time) || !Number.isFinite(point.price)) continue;
    const row = groups.get(time) ?? { time, timestamp: point.timestamp, prices: {} };
    row.prices[point.regionId] = point.price;
    groups.set(time, row);
  }
  const rows = [...groups.values()].sort((left, right) => left.time - right.time);
  // A null row breaks chart lines across a missing dispatch interval.
  return rows.flatMap((row, index) => {
    const previous = rows[index - 1];
    if (!previous || row.time - previous.time <= DISPATCH_MS) return [row];
    const gapTime = previous.time + DISPATCH_MS;
    return [{ timestamp: new Date(gapTime + 10 * 3_600_000).toISOString().slice(0, 19), time: gapTime, prices: {} }, row];
  });
}

export interface SeparationWindow {
  start: string;
  end: string;
  averageDispersion: number;
  maximumDispersion: number;
  lowRegion: RegionalPricePoint["regionId"];
  highRegion: RegionalPricePoint["regionId"];
  timestamps: string[];
}

export function separationWindows(rows: readonly RegionalDispatch[]): SeparationWindow[] {
  const windows: SeparationWindow[] = [];
  let run: Array<{ row: RegionalDispatch; spread: number; low: typeof SPOT_REGIONS[number]; high: typeof SPOT_REGIONS[number] }> = [];
  const flush = () => {
    if (run.length >= 2) {
      const widest = run.reduce((best, item) => item.spread > best.spread ? item : best);
      windows.push({ start: run[0]!.row.timestamp, end: run.at(-1)!.row.timestamp,
        averageDispersion: run.reduce((sum, item) => sum + item.spread, 0) / run.length,
        maximumDispersion: widest.spread, lowRegion: widest.low, highRegion: widest.high,
        timestamps: run.map((item) => item.row.timestamp) });
    }
    run = [];
  };
  for (const row of rows) {
    if (SPOT_REGIONS.some((region) => row.prices[region] === undefined)) { flush(); continue; }
    const low = SPOT_REGIONS.reduce((best, region) => row.prices[region]! < row.prices[best]! ? region : best);
    const high = SPOT_REGIONS.reduce((best, region) => row.prices[region]! > row.prices[best]! ? region : best);
    const spread = row.prices[high]! - row.prices[low]!;
    if (spread < 30) { flush(); continue; }
    if (run.length && row.time - run.at(-1)!.row.time !== DISPATCH_MS) flush();
    run.push({ row, spread, low, high });
  }
  flush();
  return windows;
}
