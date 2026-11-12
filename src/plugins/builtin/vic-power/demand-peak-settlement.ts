import type { PluginPersistence } from "../../../types/plugin";
import { httpFetch, type HttpFetchTransport } from "../../../utils/http-transport";
import { dailyDemand, demandIssue, parseDemandObservations } from "./demand-features";
import { readPeakJournal, recordPeakJournal } from "./demand-peak-journal";
import type { PeakArtifact } from "./demand-peak";

/** Score saved predictions independently of weather retrieval and the currently selected tab. */
export async function settlePeakForecasts(store: PluginPersistence, model: PeakArtifact, now = Date.now(), fetcher: HttpFetchTransport = httpFetch, timeoutMs = 20_000): Promise<number> {
  if (!Number.isFinite(now)) return 0;
  const pending = readPeakJournal(store, model.evaluationSha256).filter(entry => entry.actualMw === undefined && demandIssue(entry.targetDate).end <= now);
  if (!pending.length) return 0;
  const months = [...new Set(pending.map(entry => entry.targetDate.slice(0, 7)))];
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Actual demand retrieval timed out")); }, timeoutMs); });
    await Promise.race([deadline, Promise.allSettled(months.map(async month => {
      const response = await fetcher(`https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${month.replace("-", "")}_VIC1.csv`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Actual demand request failed (${response.status})`);
      const history = dailyDemand(parseDemandObservations(await response.text()));
      // Save each completed month immediately; another month's timeout must not discard it.
      if (!controller.signal.aborted) recordPeakJournal(store, model, pending[0]!, history, now);
    }))]);
  } catch { /* Unavailable months retry without discarding outcomes already saved. */ }
  finally { clearTimeout(timer); controller.abort(); }
  return readPeakJournal(store, model.evaluationSha256).filter(entry => pending.some(prior => prior.targetDate === entry.targetDate) && entry.actualMw !== undefined).length;
}
