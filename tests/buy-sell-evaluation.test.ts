import { expect, test } from "bun:test";
import { evaluateBuySell } from "../src/plugins/builtin/vic-power/buy-sell-evaluation";
const start = Date.parse("2026-11-01T00:00:00Z");
const rows = Array.from({ length: 240 }, (_, index) => ({
  time: new Date(start + (index - 168) * 3_600_000).toISOString().slice(0, 19),
  price: 50 + Math.sin(index / 3) * 100, demand: 6000 + Math.cos(index / 5) * 1000,
}));
test("paired evaluation uses identical called hours and signed price moves", () => {
  const result = evaluateBuySell(rows, "2026-11-01", "2026-11-03");
  expect(result.calls).toBeGreaterThan(0);
  expect(result.calls).toBe(result.rows.length);
  expect(result.correct).toBe(result.rows.filter(row => row.grossMoveMwH > 0).length);
  expect(result.baselineCorrect).toBe(result.rows.filter(row => row.baselineGrossMoveMwH > 0).length);
  expect(evaluateBuySell([...rows, { ...rows.at(-1)!, time: "2026-11-04T00:00:00", price: 15000 }],
    "2026-11-01", "2026-11-03")).toEqual(result);
});
