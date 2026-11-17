import { expect, test } from "bun:test";
import { hourHistory, liveHourHistory } from "../src/plugins/builtin/vic-power/buy-sell-history";
const rows = Array.from({ length: 12 }, (_, i) => ({
  settlementDate: `2026-11-17 ${i === 11 ? "11:00" : `10:${String((i + 1) * 5).padStart(2, "0")}`}:00`,
  region: "VIC1", rrp: i, totalDemand: 6000, periodType: "TRADE",
}));
test("monthly hours require twelve unique five-minute interval ends", () => {
  expect(hourHistory(rows)).toHaveLength(1);
  expect(hourHistory([...rows.slice(1), rows[1]!])).toHaveLength(0);
  expect(hourHistory([...rows, ...rows])).toHaveLength(1);
});
test("live entry excludes incomplete and unfinished hours", () => {
  const points = rows.map(r => ({ timestamp: r.settlementDate.replace(" ", "T") + "+10:00", price: r.rrp, demand: r.totalDemand }));
  const now = new Date("2026-11-17T01:05:00Z");
  expect(liveHourHistory(points.slice(0, 1) as any, now)).toHaveLength(0);
  expect(liveHourHistory(points as any, now)).toHaveLength(1);
  expect(liveHourHistory(points as any, new Date("2026-11-17T00:55:00Z"))).toHaveLength(0);
});
