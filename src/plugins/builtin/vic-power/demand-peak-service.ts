import { extendPeakComparison, readPeakComparisons } from "./demand-peak-comparison";
import { settlePeakForecasts } from "./demand-peak-settlement";
import { savedPeakCalculation, validPeakCalculation } from "./demand-peak-calculation";
import type { PluginPersistence } from "../../../types/plugin";
import { readPeakJournal, recordPeakJournal } from "./demand-peak-journal";
import { createPluginCache } from "../../../data/plugin-cache";
import { httpFetch, type HttpFetchTransport } from "../../../utils/http-transport";
import { demandIssue, shiftDemandDate } from "./demand-features";
import { fetchDemandInputs, nextDemandTarget } from "./demand-service";
import { peakDemand, validatePeakArtifact, type PeakResult } from "./demand-peak";
import candidate from "./demand-peak-artifact.json";

export const peakModel = validatePeakArtifact(candidate);
type ReadyPeak = Extract<PeakResult, { status: "ready" }>;
function validCachedPeak(value: unknown, target?: string): value is ReadyPeak {
  if (!value || typeof value !== "object") return false;
  const data = value as ReadyPeak;
  try { return data.status === "ready" && (!target || data.targetDate === target) && !!peakModel && data.targetDate > peakModel.testEnd
    && (data.calculation === undefined || validPeakCalculation(data.calculation, data.basePeakMw))
    && data.issueAt === demandIssue(data.targetDate).issueAt && Number.isFinite(data.basePeakMw) && data.basePeakMw > 0
    && Number.isFinite(data.correctionMw) && data.correctionDays === peakModel.biasCorrection.days && Math.abs(data.peakMw - data.basePeakMw - data.correctionMw) < 1e-7 && Number.isFinite(data.peakMw) && data.peakMw > 0
    && Number.isFinite(data.baselineMw) && data.baselineMw > 0 && Number.isFinite(Date.parse(data.forecastReferenceAt))
    && Date.parse(data.forecastReferenceAt) <= Date.parse(data.issueAt); } catch { return false; }
}
const cache = createPluginCache<ReadyPeak>({ kind: "vic-demand-peak-preview", source: "aemo-gfs-48h", schemaVersion: 2,
  policy: { staleMs: 300_000, expireMs: 2 * 86_400_000 },
  decode(value) { if (!validCachedPeak(value)) throw new Error("Invalid cached peak forecast"); return value; },
});
let persistence: PluginPersistence | null = null;
export const attachPeakPersistence = (store: PluginPersistence) => { persistence = store; cache.attach(store); };
export const resetPeakPersistence = () => { persistence = null; cache.reset(); };
export const getPeakComparisons = () => readPeakComparisons(persistence, peakModel);
export const getPeakJournal = () => peakModel ? readPeakJournal(persistence, peakModel.evaluationSha256) : [];
function firstSavedForecast(result: ReadyPeak): ReadyPeak {
  const first = getPeakJournal().find(entry => entry.targetDate === result.targetDate);
  return first ? { ...result, peakMw: first.peakMw, baselineMw: first.baselineMw, basePeakMw: first.basePeakMw,
    correctionMw: first.correctionMw, correctionDays: first.correctionDays, forecastReferenceAt: first.forecastReferenceAt, calculation: savedPeakCalculation(first, result) } : result;
}
/** One capture per target/model while the main desktop window is running. */
export function startPeakTracking(): () => void {
  let busy = false, closed = false, attemptedAt = 0, settling = false, settlementAt = -Infinity;
  const capture = () => {
    if (closed || !persistence || !peakModel) return;
    const now = Date.now(), target = latestPeakTarget(now);
    if (!settling && now - settlementAt >= 300_000) {
      settling = true; settlementAt = now;
      void Promise.allSettled([settlePeakForecasts(persistence, peakModel, now), extendPeakComparison(persistence, peakModel, now)]).finally(() => { settling = false; });
    }
    if (busy) return;
    if (getPeakJournal().some(entry => entry.targetDate === target) || now - attemptedAt < 60_000) return;
    busy = true; attemptedAt = now;
    void loadPeakDemand(target).catch(() => { /* Retrieval failures retry on the next timer tick. */ }).finally(() => { busy = false; });
  };
  const initial = setTimeout(capture, 1_000), timer = setInterval(capture, 60_000);
  return () => { closed = true; clearTimeout(initial); clearInterval(timer); };
}

export function latestPeakTarget(now: number): string {
  const next = nextDemandTarget(now);
  return now >= Date.parse(demandIssue(next).issueAt) ? next : shiftDemandDate(next, -1);
}
export async function fetchPeakDemand(target: string, now = Date.now(), fetcher: HttpFetchTransport = httpFetch, timeoutMs = 20_000): Promise<PeakResult> {
  if (!Number.isFinite(now)) return { status: "unavailable", reason: "Invalid current clock" };
  if (!peakModel) return { status: "unavailable", reason: "Peak demand model unavailable" };
  const issue = demandIssue(target);
  if (now < Date.parse(issue.issueAt)) return { status: "pending", reason: "Awaiting 18:00 AEST issue" };
  if (now >= issue.end) return { status: "expired", reason: "Target day has ended" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Demand inputs timed out")); }, timeoutMs); });
    const { forecast, history, recentForecasts } = await Promise.race([deadline, fetchDemandInputs(target, now, fetcher, controller.signal, peakModel.biasCorrection.days)]);
    const result = peakDemand(peakModel, target, forecast, history, now, recentForecasts);
    if (result.status === "ready") recordPeakJournal(persistence, peakModel, result, history, now);
    return result.status === "ready" ? firstSavedForecast(result) : result;
  } catch (error) { return { status: "unavailable", reason: controller.signal.aborted ? "Demand inputs timed out" : error instanceof Error ? error.message : String(error) }; }
  finally { clearTimeout(timer); controller.abort(); }
}
export async function loadPeakDemand(target: string, force = false): Promise<PeakResult> {
  const now = Date.now(), issue = demandIssue(target);
  if (!peakModel || now < Date.parse(issue.issueAt) || now >= issue.end) return fetchPeakDemand(target, now);
  const key = [peakModel.evaluationSha256, peakModel.sourceManifestHash, target, issue.issueAt].join(":");
  try {
    const saved = await cache.load(key, async () => {
      const result = await fetchPeakDemand(target);
      if (result.status !== "ready") throw new Error(result.reason);
      return result;
    }, { force });
    if (!validCachedPeak(saved.data, target)) {
      if (!force) return loadPeakDemand(target, true);
      return { status: "unavailable", reason: "Cached forecast target mismatch" };
    }
    recordPeakJournal(persistence, peakModel, saved.data, [], now);
    return { ...firstSavedForecast(saved.data), ...(saved.refreshError ? { inputWarning: saved.refreshError } : {}) };
  } catch (error) { return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) }; }
}
