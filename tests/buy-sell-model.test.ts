import { expect, test } from "bun:test";
import { decideBuySell, type BuySellHourlyPrice } from "../src/plugins/builtin/vic-power/buy-sell-model";

const target = "2026-11-12T12:00:00";
const holiday = { isPublicHoliday: false, isSchoolHoliday: false };
function hour(offset: number): string {
  return new Date(Date.parse(`${target}Z`) + offset * 3_600_000).toISOString().slice(0, 19);
}
function history(price: number): BuySellHourlyPrice[] {
  return Array.from({ length: 168 }, (_, index) => ({ time: hour(index - 168), price, demand: 6000 }));
}

test("missing weekly or prior-day history prevents a decision", () => {
  const rows = history(50);
  expect(decideBuySell(rows.slice(1), target, holiday).status).toBe("unavailable");
  expect(decideBuySell(rows.filter(row => row.time !== hour(-30)), target, holiday).status).toBe("unavailable");
});

test("future and target-hour outcomes do not change the decision", () => {
  const rows = history(50);
  const decision = decideBuySell(rows, target, holiday);
  expect(decision.status).toBe("ready");
  expect(decideBuySell([...rows, { time: target, price: 15000, demand: 1 },
    { time: hour(1), price: -1000, demand: 100000 }], target, holiday)).toEqual(decision);
});

for (const price of [-100, 0]) {
  test(`a ${price} entry price remains finite without dividing by price`, () => {
    const decision = decideBuySell(history(price), target, holiday);
    expect(decision.status).toBe("ready");
    if (decision.status !== "ready") throw new Error(decision.reason);
    expect(decision.entryMwHPrice).toBe(price);
    expect(Number.isFinite(decision.forecastPrice)).toBe(true);
    expect(Number.isFinite(decision.expectedMove)).toBe(true);
  });
}

test("nonfinite input prices suppress the signal", () => {
  const rows = history(50);
  rows[0] = { ...rows[0]!, price: NaN };
  expect(decideBuySell(rows, target, holiday).status).toBe("unavailable");
});
