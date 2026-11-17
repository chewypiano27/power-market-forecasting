import type { BuySellHourlyPrice } from "./buy-sell-model";
import type { fetchVicPowerMarketHistory, parseAemoPriceDemandCsv } from "./data";
import { dispatchTime } from "./analytics";

type MarketAccumulator = { demand: number; price: number; count: number };

function hourAccumulator(groups: Map<string, MarketAccumulator>, timestamp: string, price: number, demand: number): void {
  const match = timestamp.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match || !Number.isFinite(price) || !Number.isFinite(demand)) return;
  const [, year, month, day, hour, minute] = match;
  if (Number(minute) % 5 !== 0 || Number(match[6] ?? 0) !== 0) return;
  const intervalEnd = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const bucket = new Date(Math.floor((intervalEnd - 300_000) / 3_600_000) * 3_600_000);
  const time = `${bucket.getUTCFullYear()}-${String(bucket.getUTCMonth() + 1).padStart(2, "0")}-${String(bucket.getUTCDate()).padStart(2, "0")}T${String(bucket.getUTCHours()).padStart(2, "0")}:00:00`;
  const group = groups.get(time) ?? { demand: 0, price: 0, count: 0 };
  group.demand += demand;
  group.price += price;
  group.count += 1;
  groups.set(time, group);
}

function materializeHours(groups: Map<string, MarketAccumulator>, minimumIntervals = 12): BuySellHourlyPrice[] {
  return [...groups].filter(([, value]) => value.count >= minimumIntervals).map(([time, value]) => ({
    time, demand: value.demand / value.count, price: value.price / value.count,
  })).sort((a, b) => a.time.localeCompare(b.time));
}

export function hourHistory(rows: ReturnType<typeof parseAemoPriceDemandCsv>): BuySellHourlyPrice[] {
  const groups = new Map<string, MarketAccumulator>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.settlementDate.replaceAll("/", "-").replace(" ", "T");
    if (seen.has(key) || row.periodType.toUpperCase() !== "TRADE") continue;
    seen.add(key);
    hourAccumulator(groups, key, row.rrp, row.totalDemand);
  }
  return materializeHours(new Map([...groups].filter(([, value]) => value.count === 12)));
}

export function liveHourHistory(points: Awaited<ReturnType<typeof fetchVicPowerMarketHistory>>, now: Date): BuySellHourlyPrice[] {
  const groups = new Map<string, MarketAccumulator>();
  const seen = new Set<string>();
  for (const point of points) {
    if (!point.timestamp || dispatchTime(point.timestamp) > now.getTime() || !Number.isFinite(point.price) || !Number.isFinite(point.demand)) continue;
    const key = point.timestamp;
    if (seen.has(key)) continue;
    seen.add(key);
    hourAccumulator(groups, point.timestamp, point.price, point.demand);
  }
  return materializeHours(groups).filter((row) => Date.parse(`${row.time}+10:00`) + 3_600_000 <= now.getTime());
}

