import type { PluginPersistence } from "../../../types/plugin";
import { httpFetch, type HttpFetchTransport } from "../../../utils/http-transport";
import { demandIssue, shiftDemandDate } from "./demand-features";
import { fetchDemandInputs } from "./demand-service";
import { peakDemand, type PeakArtifact } from "./demand-peak";
import { readPeakJournal } from "./demand-peak-journal";
import type { PeakTestRow } from "./demand-peak-test";
import bundled from "./demand-peak-test-data.json";
const KEY = "peak-demand-comparison";
interface Comparison { modelId: string; sourceHash: string; rows: PeakTestRow[] }

/** Reconstructed comparisons are kept outside the first-saved prediction journal. */
export function readPeakComparisons(store: PluginPersistence | null, model: PeakArtifact | null, now = Date.now()): PeakTestRow[] {
  if (!store || !model || !Number.isFinite(now)) return [];
  const saved = store.getState<unknown>(KEY, { schemaVersion: 1 }) as Comparison | null;
  if (!saved || saved.modelId !== model.evaluationSha256 || saved.sourceHash !== model.sourceManifestHash || !Array.isArray(saved.rows)) return [];
  const seen = new Set<string>();
  return saved.rows.filter((row): row is PeakTestRow => {
    try {
      if (!Array.isArray(row) || row.length !== 4 || typeof row[0] !== "string" || row[0] <= bundled.through
        || demandIssue(row[0]).end > now || seen.has(row[0]) || !row.slice(1).every(value => typeof value === "number" && Number.isFinite(value) && value > 0)) return false;
      seen.add(row[0]); return true;
    } catch { return false; }
  }).sort((a, b) => a[0].localeCompare(b[0]));
}

/** At most one missing, completed date per background tick, using the frozen model and issue-safe inputs. */
export async function extendPeakComparison(store: PluginPersistence, model: PeakArtifact, now = Date.now(), fetcher: HttpFetchTransport = httpFetch, timeoutMs = 20_000): Promise<PeakTestRow | null> {
  if (!Number.isFinite(now) || model.evaluationSha256 !== bundled.evaluationSha256 || model.sourceManifestHash !== bundled.sourceManifestHash) return null;
  const rows = readPeakComparisons(store, model, now), journal = readPeakJournal(store, model.evaluationSha256);
  const covered = new Set([...rows.map(row => row[0]), ...journal.map(entry => entry.targetDate)]);
  let target = shiftDemandDate(new Date(now + 10 * 3_600_000).toISOString().slice(0, 10), -1);
  while (target > bundled.through && covered.has(target)) target = shiftDemandDate(target, -1);
  if (target <= bundled.through) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Comparison retrieval timed out")); }, timeoutMs); });
    const inputs = await Promise.race([deadline, fetchDemandInputs(target, now, fetcher, controller.signal, model.biasCorrection.days, true)]);
    const actual = inputs.history.find(day => day.date === target);
    if (!actual?.complete || actual.peak === null || !Number.isFinite(actual.peak) || actual.peak <= 0) return null;
    // Simulate the original issue cutoff for a historical calculation; never record it as a before-day prediction.
    const result = peakDemand(model, target, inputs.forecast, inputs.history, Date.parse(demandIssue(target).issueAt), inputs.recentForecasts);
    if (result.status !== "ready") return null;
    const row: PeakTestRow = [target, result.peakMw, actual.peak, result.baselineMw];
    const latest = readPeakComparisons(store, model, now);
    if (!latest.some(saved => saved[0] === target)) store.setState(KEY, { modelId: model.evaluationSha256, sourceHash: model.sourceManifestHash, rows: [...latest, row] }, { schemaVersion: 1 });
    return row;
  } catch { return null; /* Missing/late sources remain a gap until a later background attempt. */ }
  finally { clearTimeout(timer); controller.abort(); }
}
