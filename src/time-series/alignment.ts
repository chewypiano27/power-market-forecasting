import type { TimeSeriesPoint } from "./types";
import { isFiniteNumber } from "../utils/guards";

/** Fiscal identity survives distinct periods published at the same instant. */
export function timeSeriesObservationKey(point: TimeSeriesPoint): string {
  return point.periodLabel === undefined ? String(point.date.getTime())
    : JSON.stringify([point.date.getTime(), point.observedAt.getTime(), point.periodLabel]);
}

function isStrictlyOrdered(points: readonly TimeSeriesPoint[]): boolean {
  let previous = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const time = point.date.getTime();
    if (!Number.isFinite(time) || time <= previous || point.periodLabel !== undefined) return false;
    previous = time;
  }
  return true;
}

/** Callers only read the result, so ordered input (every market series) is returned as is. */
export function sortedUniquePoints(points: readonly TimeSeriesPoint[]): readonly TimeSeriesPoint[] {
  // Live charts re-resolve on every quote; skip the keyed sort when nothing needs it.
  if (isStrictlyOrdered(points)) return points;
  const byObservation = new Map<string, TimeSeriesPoint>();
  for (const point of points) {
    const time = point.date.getTime();
    if (Number.isFinite(time)) byObservation.set(timeSeriesObservationKey(point), point);
  }
  return [...byObservation.values()].sort((left, right) => (
    left.date.getTime() - right.date.getTime() || left.observedAt.getTime() - right.observedAt.getTime()
  ));
}

export function effectiveTimeSeriesPointTime(point: TimeSeriesPoint): number {
  const pointTime = point.date.getTime();
  const availableTime = point.availableAt?.getTime();
  return isFiniteNumber(availableTime) ? Math.max(pointTime, availableTime) : pointTime;
}
