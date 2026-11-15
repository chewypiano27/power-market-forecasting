export const BUY_SELL_MODEL = {
  version: 1,
  alpha: 0.25,
  trainingStart: "2026-01-08",
  trainingEnd: "2026-10-31",
  decisionHurdle: 5,
  featureNames: ["hourSin", "hourCos", "weekdaySin", "weekdayCos", "publicHoliday", "schoolHoliday",
    "lag24DemandMw", "lag168DemandMw", "priorDayMeanDemandMw", "lag24PriceAsinh", "lag168PriceAsinh", "priorDayMeanPriceAsinh"],
  means: [-7.393699071121798e-17, -7.39681417500683e-17, -0.007375902807297676, -0.0016835016835018153,
    0.030303030303030304, 0.22895622895622897, 5237.131610223056, 5212.699369288245, 5237.783512067357,
    0.4510724452583747, 0.44112053440355026, 0.45187824882102745],
  scales: [0.7071067811865476, 0.7071067811865476, 0.7076633005176403, 0.706509316980577,
    0.17141982574217718, 0.42016100982643, 1144.213404536993, 1166.2345021118288, 767.6633869892679,
    0.4478645299552844, 0.44901837725753974, 0.3271816314072809],
  weights: [-0.03807753703422382, -0.020247601782708558, 0.000602887614868533, -0.00016579170759501027,
    -0.0007058776134717391, 0.0001550716238544198, -0.023665391420676973, -0.006941226357978452,
    0.015451495263414758, 0.020740637534012733, 0.013609730901069506, -0.01849227398858269],
  intercept: -5.887194616637691e-05,
  holdout: { from: "2026-11-01", through: "2026-11-15", hours: 360, calls: 143, correct: 96,
    hitRate: 96 / 143, coverage: 143 / 360, baselineHitRate: 206 / 360 },
} as const;

export type BuySellAction = "BUY" | "SELL" | "HOLD";

export interface BuySellHourlyPrice {
  time: string;
  demand: number;
  price: number;
}

export interface BuySellDecision {
  status: "ready";
  action: BuySellAction;
  entryMwHPrice: number;
  forecastPrice: number;
  expectedMove: number;
  hurdle: number;
  targetHour: string;
}

/** Predict the next hourly spot-price change from a fixed, fit-through-October Ridge model. */
export function decideBuySell(history: readonly BuySellHourlyPrice[], targetHour: string, holiday: {
  isPublicHoliday: boolean; isSchoolHoliday: boolean;
}): BuySellDecision | { status: "unavailable"; reason: string } {
  const model = BUY_SELL_MODEL;
  if (history.length < 168 || history.some((row, index) => index > 0
    && Date.parse(`${row.time}+10:00`) - Date.parse(`${history[index - 1]!.time}+10:00`) !== 3_600_000)) {
    return { status: "unavailable", reason: "Eight complete days of hourly VIC price and demand history are required." };
  }
  // This string represents NEM wall-clock time, so read it as a UTC-shaped
  // calendar value to preserve its local hour and weekday across UTC offsets.
  const date = new Date(`${targetHour}Z`);
  const hour = date.getUTCHours();
  const weekday = date.getUTCDay();
  const priorDay = history.slice(-48, -24);
  if (priorDay.length !== 24) return { status: "unavailable", reason: "Prior-day hourly observations are incomplete." };
  const lag24 = history.at(-24)!;
  const lag168 = history.at(-168)!;
  const features = [Math.sin(2 * Math.PI * hour / 24), Math.cos(2 * Math.PI * hour / 24),
    Math.sin(2 * Math.PI * weekday / 7), Math.cos(2 * Math.PI * weekday / 7), Number(holiday.isPublicHoliday),
    Number(holiday.isSchoolHoliday), lag24.demand, lag168.demand,
    priorDay.reduce((sum, row) => sum + row.demand, 0) / 24,
    Math.asinh(lag24.price / 100), Math.asinh(lag168.price / 100),
    priorDay.reduce((sum, row) => sum + Math.asinh(row.price / 100), 0) / 24];
  const delta = model.intercept + features.reduce((sum, value, index) => (
    sum + model.weights[index]! * (value - model.means[index]!) / model.scales[index]!
  ), 0);
  const entryMwHPrice = history.at(-1)!.price;
  const forecastPrice = 100 * Math.sinh(Math.asinh(entryMwHPrice / 100) + delta);
  if (!Number.isFinite(forecastPrice)) return { status: "unavailable", reason: "Price estimate is invalid." };
  const expectedMove = forecastPrice - entryMwHPrice;
  return { status: "ready", action: expectedMove > model.decisionHurdle ? "BUY"
    : expectedMove < -model.decisionHurdle ? "SELL" : "HOLD",
  entryMwHPrice, forecastPrice, expectedMove, hurdle: model.decisionHurdle, targetHour };
}
