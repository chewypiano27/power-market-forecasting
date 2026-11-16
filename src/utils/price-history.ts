import type { PricePoint } from "../types/financials";

// Cached history carries ISO strings for dates, and every pass over a
// series (normalizing, sorting, charting) parses each one again; a sort
// comparator does it twice per comparison. Points are never edited in
// place, so the parse is kept per point.
const pointTimestamps = new WeakMap<PricePoint, number>();

export function getPricePointTimestamp(point: PricePoint): number {
  const value = point.date as Date | string | number | null | undefined;
  if (value instanceof Date) return value.getTime();
  if (value == null) return Number.NaN;
  const cached = pointTimestamps.get(point);
  if (cached !== undefined) return cached;
  const time = new Date(value).getTime();
  pointTimestamps.set(point, time);
  return time;
}
