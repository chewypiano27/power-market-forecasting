import { parseAemoPriceDemandCsv } from "../src/plugins/builtin/vic-power/aemo-price-demand-csv";
import { hourHistory } from "../src/plugins/builtin/vic-power/buy-sell-history";
import { evaluateBuySell } from "../src/plugins/builtin/vic-power/buy-sell-evaluation";

if (Bun.argv.length !== 4 && Bun.argv.length !== 6) {
  throw new Error("Usage: bun scripts/evaluate-buy-sell-baseline.ts previous-month.csv current-month.csv [from-date through-date]");
}
const files = await Promise.all(Bun.argv.slice(2, 4).map(async path =>
  parseAemoPriceDemandCsv(await Bun.file(path).text())));
const evaluation = evaluateBuySell(hourHistory(files.flat()), Bun.argv[4] ?? "2026-11-01", Bun.argv[5] ?? "2026-11-15");
// Keep paired outcomes together: resample whole days, preserving within-day dependence.
const days = [...new Set(evaluation.rows.map(row => row.time.slice(0, 10)))];
const byDay = days.map(day => evaluation.rows.filter(row => row.time.startsWith(day)));
let seed = 20261117;
function randomIndex(size: number) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return Math.floor(seed / 2 ** 32 * size);
}
const differences: number[] = [];
for (let sample = 0; sample < 10000 && days.length; sample++) {
  const rows = days.flatMap(() => byDay[randomIndex(days.length)]!);
  if (rows.length) differences.push(rows.reduce((sum, row) =>
    sum + Number(row.correct) - Number(row.baselineCorrect), 0) / rows.length);
}
differences.sort((a, b) => a - b);
console.log(JSON.stringify({ ...evaluation,
  pairedDayBootstrap95: differences.length ? [differences[Math.floor(differences.length * .025)],
    differences[Math.floor(differences.length * .975)]] : null,
  note: "Reused historical sample; gross price moves exclude costs and operating constraints. Bootstrap uses paired whole days, seed 20261117, 10000 samples."
}, null, 2));
