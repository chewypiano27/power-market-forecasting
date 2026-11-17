import { createHash } from "node:crypto";
import { BUY_SELL_MODEL, buySellInputs } from "../src/plugins/builtin/vic-power/buy-sell-model";
import { parseAemoPriceDemandCsv } from "../src/plugins/builtin/vic-power/aemo-price-demand-csv";
import { hourHistory } from "../src/plugins/builtin/vic-power/buy-sell-history";
import { victorianCalendarAnnotation } from "../src/plugins/builtin/vic-power/victoria-calendar";

// Inputs: AEMO monthly CSVs covering Jan–Oct 2026. Output goes to stdout.
if (Bun.argv.length < 3) throw new Error("Supply AEMO monthly CSV paths covering Jan–Oct 2026.");
const sources = [];
const records = [];
for (const path of Bun.argv.slice(2)) {
  const bytes = await Bun.file(path).arrayBuffer();
  sources.push({ file: path.split(/[\\/]/).at(-1), sha256: createHash("sha256").update(new Uint8Array(bytes)).digest("hex") });
  records.push(...parseAemoPriceDemandCsv(new TextDecoder().decode(bytes)));
}
const history = hourHistory(records);
const rows = [];
for (let index = 168; index < history.length; index++) {
  const actual = history[index]!;
  const day = actual.time.slice(0, 10);
  if (day < BUY_SELL_MODEL.trainingStart || day > BUY_SELL_MODEL.trainingEnd) continue;
  const inputs = buySellInputs(history.slice(index - 168, index), actual.time, victorianCalendarAnnotation(day));
  if (inputs.status !== "ready") continue;
  rows.push({ time: actual.time, features: inputs.features,
    target: Math.asinh(actual.price / 100) - Math.asinh(inputs.entryPrice / 100) });
}
console.log(JSON.stringify({ alpha: BUY_SELL_MODEL.alpha, decisionHurdle: BUY_SELL_MODEL.decisionHurdle,
  featureNames: BUY_SELL_MODEL.featureNames, sources, rows,
  expected: { means: BUY_SELL_MODEL.means, scales: BUY_SELL_MODEL.scales,
    weights: BUY_SELL_MODEL.weights, intercept: BUY_SELL_MODEL.intercept } }));
