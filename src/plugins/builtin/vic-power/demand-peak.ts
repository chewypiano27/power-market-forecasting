import { peakCalculation, type PeakCalculation } from "./demand-peak-calculation";
import { buildDemandFeatures, DEMAND_FEATURES, DEMAND_MODEL, DEMAND_FORECAST_POLICY, demandIssue, shiftDemandDate, type DemandDay, type DemandForecast } from "./demand-features";

export const PEAK_FEATURES = [...DEMAND_FEATURES, "sameWeekdayPeak"] as const;
export interface PeakArtifact {
  schemaVersion: 2; kind: "daily-peak-mw-ridge-corrected";
  biasCorrection: { method: "mean-completed-errors"; days: number; lagDays: 2 }; featureNames: readonly string[];
  means: number[]; scales: number[]; weights: number[]; intercept: number;
  trainingStart: string; trainingEnd: string; calibrationEnd: string; testEnd: string;
  evaluationSha256: string; sourceManifestHash: string;
  sourceContract: { model: string; policy: string; asIssuedFrom: string; provenanceEvidence: string };
}
const validDate = (value: unknown): value is string => {
  try { return typeof value === "string" && shiftDemandDate(value, 0) === value; } catch { return false; }
};
export function validatePeakArtifact(value: unknown): PeakArtifact | null {
  if (!value || typeof value !== "object") return null;
  const data = value as PeakArtifact;
  if (data.schemaVersion !== 2 || data.kind !== "daily-peak-mw-ridge-corrected") return null;

  const correction = data.biasCorrection;
  if (correction?.method !== "mean-completed-errors" || correction.lagDays !== 2
    || ![7, 14, 28, 56].includes(correction.days)) return null;
  if (JSON.stringify(data.featureNames) !== JSON.stringify(PEAK_FEATURES)) return null;

  const vectors = [data.means, data.scales, data.weights];
  const finiteVector = (array: unknown): array is number[] => Array.isArray(array)
    && array.length === PEAK_FEATURES.length
    && array.every(value => typeof value === "number" && Number.isFinite(value));
  if (!vectors.every(finiteVector)) return null;
  if (data.scales.some(value => value <= 0)
    || typeof data.intercept !== "number" || !Number.isFinite(data.intercept)) return null;

  const dates = [data.trainingStart, data.trainingEnd, data.calibrationEnd, data.testEnd];
  if (!dates.every(validDate)) return null;
  const chronological = data.trainingStart <= data.trainingEnd
    && data.trainingEnd < data.calibrationEnd && data.calibrationEnd < data.testEnd;
  if (!chronological) return null;

  const source = data.sourceContract;
  if (source?.model !== DEMAND_MODEL || source.policy !== DEMAND_FORECAST_POLICY
    || !validDate(source.asIssuedFrom) || typeof source.provenanceEvidence !== "string"
    || !source.provenanceEvidence.trim()) return null;
  const hashes = [data.evaluationSha256, data.sourceManifestHash];
  if (!hashes.every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))) return null;
  return data;
}
/** Frozen base estimate; displayed forecasts also apply the completed-error correction. */
export function evaluatePeakModel(model: PeakArtifact, values: readonly number[]): number {
  if (values.length !== PEAK_FEATURES.length || values.some(value => !Number.isFinite(value))) throw new Error("Peak demand features are incomplete");
  const peak = values.reduce((sum, value, index) => sum + (value - model.means[index]!) / model.scales[index]! * model.weights[index]!, model.intercept);
  if (!Number.isFinite(peak) || peak <= 0) throw new Error("Peak demand calculation is invalid");
  return peak;
}
export interface PeakError { targetDate: string; actualMw: number; basePeakMw: number }
export function meanPeakCorrection(model: PeakArtifact, targetDate: string, errors: readonly PeakError[]): number {
  let total = 0;
  for (let index = 0; index < model.biasCorrection.days; index++) {
    const date = shiftDemandDate(targetDate, -2 - index);
    const matches = errors.filter(error => error.targetDate === date);
    const error = matches[0];
    if (matches.length !== 1 || !error || !Number.isFinite(error.actualMw) || error.actualMw <= 0 || !Number.isFinite(error.basePeakMw) || error.basePeakMw <= 0) throw new Error("Completed forecast errors are unavailable");
    total += error.actualMw - error.basePeakMw;
  }
  return total / model.biasCorrection.days;
}
export type PeakResult = { status: "ready"; peakMw: number; basePeakMw: number; correctionMw: number; correctionDays: number; baselineMw: number; targetDate: string; issueAt: string; forecastReferenceAt: string; calculation?: PeakCalculation; inputWarning?: string }
  | { status: "pending" | "expired" | "unavailable"; reason: string };

/** Prospective inference uses only complete days and archived weather available before issue. */
export function peakDemand(candidate: unknown, targetDate: string, forecast: DemandForecast, history: readonly DemandDay[], now: number, recentForecasts: ReadonlyMap<string, DemandForecast> = new Map()): PeakResult {
  const model = validatePeakArtifact(candidate);
  if (!model) return { status: "unavailable", reason: "Peak demand model unavailable" };
  const issue = demandIssue(targetDate);
  if (!Number.isFinite(now)) return { status: "unavailable", reason: "Invalid current clock" };
  if (now < Date.parse(issue.issueAt)) return { status: "pending", reason: "Awaiting 18:00 AEST issue" };
  if (now >= issue.end) return { status: "expired", reason: "Target day has ended" };
  if (targetDate <= model.testEnd || targetDate < model.sourceContract.asIssuedFrom) return { status: "unavailable", reason: "Target precedes the prospective model period" };
  const features = buildDemandFeatures(targetDate, forecast, history);
  if (features.status !== "ready") return features;
  const baseline = history.find(day => day.date === shiftDemandDate(targetDate, -7));
  if (!baseline?.complete || baseline.peak === null || !Number.isFinite(baseline.peak) || baseline.peak <= 0) return { status: "unavailable", reason: "Same-weekday baseline unavailable" };
  try {
    const errors: PeakError[] = [];
    for (let index = 0; index < model.biasCorrection.days; index++) {
      const date = shiftDemandDate(targetDate, -2 - index);
      const day = history.find(day => day.date === date), prior = recentForecasts.get(date);
      const weekly = history.find(day => day.date === shiftDemandDate(date, -7));
      if (!day?.complete || day.peak === null || !prior || !weekly?.complete || weekly.peak === null) throw new Error("Completed forecast errors are unavailable");
      const earlier = buildDemandFeatures(date, prior, history);
      if (earlier.status !== "ready") throw new Error(earlier.reason);
      errors.push({ targetDate: date, actualMw: day.peak, basePeakMw: evaluatePeakModel(model, [...earlier.values, weekly.peak]) });
    }
    const basePeakMw = evaluatePeakModel(model, [...features.values, baseline.peak]);
    const correctionMw = meanPeakCorrection(model, targetDate, errors), peakMw = basePeakMw + correctionMw;
    if (!Number.isFinite(peakMw) || peakMw <= 0) throw new Error("Peak demand calculation is invalid");
    return { status: "ready", peakMw, basePeakMw, correctionMw, correctionDays: model.biasCorrection.days, baselineMw: baseline.peak,
      targetDate, issueAt: features.issueAt, forecastReferenceAt: features.forecastReferenceAt, calculation: peakCalculation(model, [...features.values, baseline.peak]) };
  } catch (error) { return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) }; }
}
