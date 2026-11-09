import { buildDemandFeatures, DEMAND_FEATURES, DEMAND_MODEL, DEMAND_FORECAST_POLICY, demandIssue, shiftDemandDate, type DemandDay, type DemandForecast } from "./demand-features";

export interface DemandProbabilityArtifact {
  schemaVersion: 2; featureNames: readonly string[]; thresholdMw: number; model: string;
  means: number[]; scales: number[]; weights: number[]; intercept: number;
  calibrator: { slope: number; intercept: number };
  trainingEnd: string; calibrationEnd: string; testEnd: string;
  evaluationSha256: string; sourceManifestHash: string;
  sourceContract: { model: string; asIssuedFrom: string; policy: string; provenanceEvidence: string };
  deployment: { enabled: boolean; reasons: string[] };
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finiteArray(value: unknown, size: number): value is number[] {
  return Array.isArray(value) && value.length === size && value.every(item => typeof item === "number" && Number.isFinite(item));
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return shiftDemandDate(value, 0) === value; } catch { return false; }
}

/** Reject disabled candidates and incompatible schemas before they can produce a displayed percentage. */
export function validateDemandArtifact(value: unknown): DemandProbabilityArtifact | null {
  if (!record(value) || value.schemaVersion !== 2 || value.model !== DEMAND_MODEL || !Array.isArray(value.featureNames)
    || JSON.stringify(value.featureNames) !== JSON.stringify(DEMAND_FEATURES)
    || typeof value.thresholdMw !== "number" || !Number.isFinite(value.thresholdMw) || value.thresholdMw <= 0
    || !finiteArray(value.means, DEMAND_FEATURES.length) || !finiteArray(value.weights, DEMAND_FEATURES.length)
    || !finiteArray(value.scales, DEMAND_FEATURES.length) || value.scales.some(scale => scale <= 0)
    || typeof value.intercept !== "number" || !Number.isFinite(value.intercept)
    || !record(value.calibrator) || typeof value.calibrator.slope !== "number" || !Number.isFinite(value.calibrator.slope)
    || value.calibrator.slope <= 0 || typeof value.calibrator.intercept !== "number" || !Number.isFinite(value.calibrator.intercept)
    || !validDate(value.trainingEnd) || !validDate(value.calibrationEnd) || !validDate(value.testEnd)
    || !(value.trainingEnd < value.calibrationEnd && value.calibrationEnd < value.testEnd)
    || !record(value.sourceContract) || value.sourceContract.model !== DEMAND_MODEL || value.sourceContract.policy !== DEMAND_FORECAST_POLICY || !validDate(value.sourceContract.asIssuedFrom)
    || typeof value.sourceContract.provenanceEvidence !== "string" || !value.sourceContract.provenanceEvidence.trim()
    || !record(value.deployment) || value.deployment.enabled !== true || !Array.isArray(value.deployment.reasons) || value.deployment.reasons.length !== 0
    || typeof value.evaluationSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.evaluationSha256)
    || typeof value.sourceManifestHash !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceManifestHash)) return null;
  return value as unknown as DemandProbabilityArtifact;
}

export function logisticProbability(logit: number): number {
  return logit >= 0 ? 1 / (1 + Math.exp(-logit)) : Math.exp(logit) / (1 + Math.exp(logit));
}

/** Numerical inference is separate from eligibility; UI callers must use demandProbability. */
export function evaluateDemandModel(artifact: DemandProbabilityArtifact, values: readonly number[]): number {
  if (values.length !== DEMAND_FEATURES.length || values.some(value => !Number.isFinite(value))) throw new Error("Demand feature vector is incomplete");
  const logit = values.reduce((sum, value, index) => sum + (value - artifact.means[index]!) / artifact.scales[index]! * artifact.weights[index]!, artifact.intercept);
  const calibrated = artifact.calibrator.intercept + artifact.calibrator.slope * logit;
  if (!Number.isFinite(calibrated)) throw new Error("Demand model calculation is nonfinite");
  return logisticProbability(calibrated);
}

export type DemandProbabilityResult = { status: "ready"; inputWarning?: string; probability: number; thresholdMw: number; targetDate: string; issueAt: string; forecastReferenceAt: string; availabilityBasis: DemandForecast["availability"]["basis"] }
  | { status: "unavailable" | "pending" | "expired"; reason: string };

export function demandProbability(candidate: unknown, targetDate: string, forecast: DemandForecast, history: readonly DemandDay[], now: number): DemandProbabilityResult {
  const artifact = validateDemandArtifact(candidate);
  if (!artifact) return { status: "unavailable", reason: "No compatible model has passed evaluation" };
  const issue = demandIssue(targetDate);
  if (!Number.isFinite(now)) return { status: "unavailable", reason: "Invalid current clock" };
  if (now < Date.parse(issue.issueAt)) return { status: "pending", reason: `Next issue ${issue.issueAt}` };
  if (now >= issue.end) return { status: "expired", reason: "The forecast target day has ended" };
  if (targetDate <= artifact.testEnd || targetDate < artifact.sourceContract.asIssuedFrom) return { status: "unavailable", reason: "Target is outside the deployed artifact's prospective coverage" };
  const features = buildDemandFeatures(targetDate, forecast, history);
  if (features.status !== "ready") return features;
  try {
    return { status: "ready", probability: evaluateDemandModel(artifact, features.values), thresholdMw: artifact.thresholdMw,
      targetDate, issueAt: features.issueAt, forecastReferenceAt: features.forecastReferenceAt, availabilityBasis: forecast.availability.basis };
  } catch (error) { return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) }; }
}
