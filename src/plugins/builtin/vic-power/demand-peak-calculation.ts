import type { PeakArtifact, PeakResult } from "./demand-peak";

export interface PeakCalculation { startingMw: number; weatherMw: number; demandMw: number; calendarMw: number }
type Ready = Extract<PeakResult, { status: "ready" }>;
/** Exact additive terms in the fitted, standardised linear model. No causal attribution is implied. */
export function peakCalculation(model: PeakArtifact, values: readonly number[]): PeakCalculation {
  if (values.length !== model.weights.length || values.some(value => !Number.isFinite(value))) throw new Error("Peak demand features are incomplete");
  const terms = values.map((value, i) => (value - model.means[i]!) / model.scales[i]! * model.weights[i]!);
  const sum = (indices: number[]) => indices.reduce((total, i) => total + terms[i]!, 0);
  return { startingMw: model.intercept, weatherMw: sum([0, 1, 2, 3, 4]), demandMw: sum([5, 6, 11]), calendarMw: sum([7, 8, 9, 10]) };
}
export function validPeakCalculation(value: unknown, baseMw: number): value is PeakCalculation {
  if (!value || typeof value !== "object") return false;
  const c = value as PeakCalculation;
  return [c.startingMw, c.weatherMw, c.demandMw, c.calendarMw].every(Number.isFinite)
    && Math.abs(c.startingMw + c.weatherMw + c.demandMw + c.calendarMw - baseMw) < 1e-7;
}
/** Older saved forecasts gain a reproduced calculation only if all original numbers and the archive reference agree. */
export function savedPeakCalculation(first: Ready, current: Ready): PeakCalculation | undefined {
  if (validPeakCalculation(first.calculation, first.basePeakMw)) return first.calculation;
  return first.targetDate === current.targetDate && first.forecastReferenceAt === current.forecastReferenceAt
    && first.peakMw === current.peakMw && first.basePeakMw === current.basePeakMw && first.correctionMw === current.correctionMw
    && first.baselineMw === current.baselineMw && first.correctionDays === current.correctionDays
    && validPeakCalculation(current.calculation, first.basePeakMw) ? current.calculation : undefined;
}
/** Round cumulative totals so the visible whole-MW steps add up exactly to the displayed forecast. */
export function peakCalculationSteps(forecast: Ready) {
  const c = forecast.calculation, detailed = validPeakCalculation(c, forecast.basePeakMw);
  const start = detailed ? c.startingMw : forecast.basePeakMw;
  const terms: [string, number][] = detailed ? [["Weather", c.weatherMw], ["Demand history", c.demandMw], ["Calendar", c.calendarMw]] : [];
  terms.push(["Recent correction", forecast.correctionMw]);
  let total = start;
  return { startMw: Math.round(start), startLabel: detailed ? "Model starting point" : "Model estimate",
    steps: terms.map(([label, value]) => { const before = Math.round(total); total += value; return { label, mw: Math.round(total) - before }; }),
    peakMw: Math.round(forecast.peakMw) };
}
