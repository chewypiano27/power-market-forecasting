import { demandIssue } from "./demand-features";
import type { DemandProbabilityArtifact } from "./demand-probability";
export interface DemandHistoryRow { targetDate: string; issueAt: string; forecastReferenceAt: string; thresholdMw: number; probability: number; observedPeak: number; event: number }
export interface DemandHistory { schemaVersion: 1; evaluationSha256: string; sourceManifestHash: string; thresholdMw: number; from: string; through: string; days: number; events: number; brier: number; baselineBrier: number; rows: DemandHistoryRow[] }
export type DemandHistoryFilter = "all" | "events" | "misses" | "false-alarms";
export function demandHistoryRows(history: DemandHistory, filter: DemandHistoryFilter): DemandHistoryRow[] {
  return history.rows.filter(row => filter === "all" || (filter === "events" ? row.event === 1 : filter === "misses" ? row.event === 1 && row.probability < .5 : row.event === 0 && row.probability >= .5));
}
export function demandHistoryOutcome(row: DemandHistoryRow): string {
  return row.event ? row.probability >= .5 ? "Hit" : "Miss" : row.probability >= .5 ? "False alarm" : "Below threshold";
}
/** Immutable held-out predictions, tied to the deployed evaluation; never labelled live forecasts. */
export function validateDemandHistory(value: unknown, model: DemandProbabilityArtifact | null): DemandHistory {
  const data = value as DemandHistory;
  if (!model || !data || data.schemaVersion !== 1 || data.evaluationSha256 !== model.evaluationSha256 || data.sourceManifestHash !== model.sourceManifestHash
    || data.thresholdMw !== model.thresholdMw || !Array.isArray(data.rows) || !data.rows.length || data.rows.length !== data.days
    || data.from !== data.rows[0]?.targetDate || data.through !== data.rows.at(-1)?.targetDate || data.through !== model.testEnd || data.from <= model.calibrationEnd) throw new Error("Model history does not match the approved evaluation");
  let previous = "", events = 0, brier = 0;
  for (const row of data.rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.targetDate) || row.targetDate <= previous || row.issueAt !== demandIssue(row.targetDate).issueAt
      || !Number.isFinite(Date.parse(row.forecastReferenceAt)) || Date.parse(row.forecastReferenceAt) > Date.parse(row.issueAt)
      || row.thresholdMw !== data.thresholdMw || !Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1
      || !Number.isFinite(row.observedPeak) || row.observedPeak <= 0 || row.event !== Number(row.observedPeak > row.thresholdMw)) throw new Error("Invalid held-out prediction row");
    previous = row.targetDate; events += row.event; brier += (row.probability - row.event) ** 2;
  }
  if (events !== data.events || !Number.isFinite(data.brier) || Math.abs(data.brier - brier / data.days) > 1e-10
    || !Number.isFinite(data.baselineBrier) || data.baselineBrier < 0 || data.baselineBrier > 1) throw new Error("Model history totals do not reconcile");
  return data;
}
