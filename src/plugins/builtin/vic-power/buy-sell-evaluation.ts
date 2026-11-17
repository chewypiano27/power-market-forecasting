import { decideBuySell, type BuySellHourlyPrice } from "./buy-sell-model";
import { victorianCalendarAnnotation } from "./victoria-calendar";

/** Compare both methods on the exact hours where the frozen model makes a call. */
export function evaluateBuySell(history: readonly BuySellHourlyPrice[], from = "2026-11-01", through = "9999-12-31") {
  const byTime = new Map(history.map(row => [row.time, row]));
  const rows = [];
  let hours = 0;
  for (let index = 168; index < history.length; index++) {
    const actual = history[index]!;
    if (actual.time.slice(0, 10) < from || actual.time.slice(0, 10) > through) continue;
    const decision = decideBuySell(history.slice(index - 168, index), actual.time,
      victorianCalendarAnnotation(actual.time.slice(0, 10)));
    if (decision.status !== "ready") continue;
    hours++;
    if (decision.action === "HOLD") continue;
    const weeklyTime = new Date(Date.parse(`${actual.time}Z`) - 168 * 3_600_000).toISOString().slice(0, 19);
    const weekly = byTime.get(weeklyTime)!;
    const move = actual.price - decision.entryMwHPrice;
    const side = decision.action === "BUY" ? 1 : -1;
    const baselineSide = Math.sign(weekly.price - decision.entryMwHPrice);
    rows.push({ time: actual.time, correct: side * move > 0, baselineCorrect: baselineSide * move > 0,
      grossMoveMwH: side * move, baselineGrossMoveMwH: baselineSide * move });
  }
  const calls = rows.length;
  const correct = rows.filter(row => row.correct).length;
  const baselineCorrect = rows.filter(row => row.baselineCorrect).length;
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return { hours, calls, correct, baselineCorrect, hitRate: calls ? correct / calls : null,
    baselineHitRate: calls ? baselineCorrect / calls : null,
    meanGrossMoveMwH: mean(rows.map(row => row.grossMoveMwH)),
    baselineMeanGrossMoveMwH: mean(rows.map(row => row.baselineGrossMoveMwH)), rows };
}
