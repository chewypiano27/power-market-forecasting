import { savedPeakCalculation } from "./demand-peak-calculation";
import type { PluginPersistence } from "../../../types/plugin";
import { demandIssue, shiftDemandDate, type DemandDay } from "./demand-features";
import type { PeakArtifact, PeakResult } from "./demand-peak";

type Ready = Extract<PeakResult, { status: "ready" }>;
export interface PeakJournalEntry extends Ready {
  modelId: string; recordedAt: string; beforeTargetDay: boolean; actualMw?: number; actualRecordedAt?: string;
}
const KEY = "peak-demand-journal";

export function readPeakJournal(store: PluginPersistence | null, modelId: string): PeakJournalEntry[] {
  const value = store?.getState<unknown>(KEY, { schemaVersion: 1 });
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PeakJournalEntry => {
    try { return entry?.status === "ready" && entry.modelId === modelId && Number.isFinite(entry.peakMw) && entry.peakMw > 0
      && Number.isFinite(entry.baselineMw) && entry.baselineMw > 0 && shiftDemandDate(entry.targetDate, 0) === entry.targetDate
      && entry.issueAt === demandIssue(entry.targetDate).issueAt && Number.isFinite(Date.parse(entry.recordedAt))
      && Date.parse(entry.recordedAt) >= Date.parse(entry.issueAt)
      && entry.beforeTargetDay === (Date.parse(entry.recordedAt) < demandIssue(entry.targetDate).start)
      && (entry.actualMw === undefined || (Number.isFinite(entry.actualMw) && entry.actualMw > 0 && Number.isFinite(Date.parse(entry.actualRecordedAt)) && Date.parse(entry.actualRecordedAt) >= demandIssue(entry.targetDate).end));
    } catch { return false; }
  }).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
}

/** First prediction and first completed outcome stay unchanged on refresh or data revision. */
export function recordPeakJournal(store: PluginPersistence | null, model: PeakArtifact, result: Ready, history: readonly DemandDay[], now: number): void {
  if (!store || !Number.isFinite(now)) return;
  const all = store.getState<unknown>(KEY, { schemaVersion: 1 });
  const other = Array.isArray(all) ? all.filter(entry => entry && typeof entry === "object" && entry.modelId !== model.evaluationSha256) : [];
  const entries = readPeakJournal(store, model.evaluationSha256);
  let changed = false;
  if (!entries.some(entry => entry.targetDate === result.targetDate) && now >= Date.parse(result.issueAt) && now < demandIssue(result.targetDate).end) {
    entries.push({ ...result, modelId: model.evaluationSha256, recordedAt: new Date(now).toISOString(), beforeTargetDay: now < demandIssue(result.targetDate).start });
    changed = true;
  }
  for (const entry of entries) {
    if (!entry.calculation && entry.targetDate === result.targetDate) {
      const calculation = savedPeakCalculation(entry, result);
      if (calculation) { entry.calculation = calculation; changed = true; }
    }
    if (entry.actualMw !== undefined || demandIssue(entry.targetDate).end > now) continue;
    const actual = history.find(day => day.date === entry.targetDate);
    if (!actual?.complete || actual.peak === null || !Number.isFinite(actual.peak) || actual.peak <= 0) continue;
    entry.actualMw = actual.peak; entry.actualRecordedAt = new Date(now).toISOString(); changed = true;
  }
  if (changed) store.setState(KEY, [...other, ...entries].sort((a, b) => a.targetDate.localeCompare(b.targetDate)).slice(-365), { schemaVersion: 1 });
}

export function peakJournalMetrics(entries: readonly PeakJournalEntry[]) {
  const completed = entries.filter(entry => entry.beforeTargetDay && entry.actualMw !== undefined);
  const error = completed.map(entry => entry.peakMw - entry.actualMw!);
  return { count: completed.length, maeMw: error.length ? error.reduce((sum, value) => sum + Math.abs(value), 0) / error.length : null,
    rmseMw: error.length ? Math.sqrt(error.reduce((sum, value) => sum + value ** 2, 0) / error.length) : null,
    biasMw: error.length ? error.reduce((sum, value) => sum + value, 0) / error.length : null,
    baselineMaeMw: completed.length ? completed.reduce((sum, entry) => sum + Math.abs(entry.baselineMw - entry.actualMw!), 0) / completed.length : null };
}
