import type { PricePoint } from "../types/financials";

// A venue without session hours here (OTC Markets, Cboe Canada) has no
// session to hold: its copy is current while the latest bar is this recent.
// Sources finish the closing auction and late prints some minutes after the
// bell, past the delayed feed's lag. A copy fetched later can still carry an
// unfinished bar when its source had not settled it; only the source can tell.
// A series that never closes must reach the present without a break: no hole
// this long (or three bars, if larger) in the stretch before now that a
// current window is read over.

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

// The merged financials view is rebuilt on every quote tick and normalizes
// the same history array each time. Arrays are replaced, not edited, so the
// result is kept per input array.

// An offer priced the day before trading, or a value carried forward to the
// opening auction, sits days at most before the first print.
