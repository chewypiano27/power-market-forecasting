import { createPluginCache } from "../../../data/plugin-cache";
import { httpFetch, type HttpFetchTransport } from "../../../utils/http-transport";
import { dailyDemand, DEMAND_FORECAST_POLICY, demandIssue, parseDemandObservations, shiftDemandDate } from "./demand-features";
import { DEMAND_FORECAST_SOURCE, demandForecastUrl, parseDemandForecast } from "./demand-forecast-source";
import { demandProbability, validateDemandArtifact, type DemandProbabilityArtifact, type DemandProbabilityResult } from "./demand-probability";
import bundledCandidate from "./demand-model-artifact.json";

const cache = createPluginCache<Extract<DemandProbabilityResult, { status: "ready" }>>({
  kind: "vic-demand-probability", source: "aemo-gfs-48h", schemaVersion: 2,
  decode(value) {
    const model = bundledDemandModel;
    if (!model || !validCachedDemand(value, model)) throw new Error("Invalid saved demand forecast");
    return value;
  },
  policy: { staleMs: 5 * 60_000, expireMs: 2 * 86_400_000 },
});
export const attachDemandPersistence = cache.attach;
export const resetDemandPersistence = cache.reset;
export const bundledDemandModel = validateDemandArtifact(bundledCandidate);

export function nextDemandTarget(now: number): string {
  return shiftDemandDate(new Date(now + 10 * 3_600_000).toISOString().slice(0, 10), 1);
}

/** Separate from the primary market/weather request: optional probability cannot delay those panes. */
export async function fetchDemandProbability(candidate: unknown, targetDate: string, now = Date.now(), fetcher: HttpFetchTransport = httpFetch, timeoutMs = 20_000): Promise<DemandProbabilityResult> {
  const artifact = validateDemandArtifact(candidate);
  if (!artifact) return { status: "unavailable", reason: "Model pending" };
  const issue = demandIssue(targetDate);
  if (now < Date.parse(issue.issueAt)) return { status: "pending", reason: "Awaiting 18:00 AEST issue" };
  if (now >= issue.end) return { status: "expired", reason: "Target day has ended" };
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error("Demand inputs timed out")); }, timeoutMs);
  });
  try {
    const { forecast, history } = await Promise.race([deadline, fetchDemandInputs(targetDate, now, fetcher, controller.signal)]);
    return demandProbability(artifact, targetDate, forecast, history, now);
  } catch (error) {
    return { status: "unavailable", reason: controller.signal.aborted ? "Demand inputs timed out" : error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timeout); controller.abort(); }
}

/** Shared, issue-safe inputs for the probability and peak-MW models. */
export async function fetchDemandInputs(targetDate: string, now: number, fetcher: HttpFetchTransport = httpFetch, signal?: AbortSignal, correctionDays = 0) {
  if (!Number.isInteger(correctionDays) || correctionDays < 0 || correctionDays > 56) throw new Error("Invalid completed-error window");
  const text = async (url: string) => {
    const response = await fetcher(url, { signal });
    if (!response.ok) throw new Error(`Demand input request failed (${response.status})`);
    return response.text();
  };
  const months = [...new Set(Array.from({ length: correctionDays ? correctionDays + 8 : 7 }, (_, index) => shiftDemandDate(targetDate, -2-index).slice(0, 7)))];
  const weatherUrl = new URL(demandForecastUrl(targetDate));
  if (correctionDays) weatherUrl.searchParams.set("start_date", new Date(demandIssue(shiftDemandDate(targetDate, -correctionDays - 1)).start).toISOString().slice(0, 10));
  const [weather, ...market] = await Promise.all([
    text(weatherUrl.href),
    ...months.map(month => text(`https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${month.replace("-", "")}_VIC1.csv`)),
  ]);
  const parse = (date: string) => parseDemandForecast(weather!, date, DEMAND_FORECAST_SOURCE, new Date(now).toISOString());
  const recentForecasts = new Map(Array.from({ length: correctionDays }, (_, index) => {
    const date = shiftDemandDate(targetDate, -2 - index);
    return [date, parse(date)] as const;
  }));
  return { forecast: parse(targetDate), recentForecasts,
    history: dailyDemand(market.flatMap(body => parseDemandObservations(body))) };
}

function validCachedDemand(value: unknown, model: DemandProbabilityArtifact): value is Extract<DemandProbabilityResult, { status: "ready" }> {
  if (!value || typeof value !== "object") return false;
  const record = value as Extract<DemandProbabilityResult, { status: "ready" }>;
  return record.status === "ready" && Number.isFinite(record.probability) && record.probability >= 0 && record.probability <= 1
    && /^\d{4}-\d{2}-\d{2}$/.test(record.targetDate) && record.issueAt === demandIssue(record.targetDate).issueAt
    && record.thresholdMw === model.thresholdMw && Number.isFinite(Date.parse(record.forecastReferenceAt))
    && record.availabilityBasis === "documented-latency-assumption";
}

function modelCacheKey(artifact: DemandProbabilityArtifact, targetDate: string): string {
  return [artifact.evaluationSha256, artifact.sourceManifestHash, targetDate, demandIssue(targetDate).issueAt, DEMAND_FORECAST_POLICY].join(":");
}

export async function loadDemandProbability(targetDate: string, force = false): Promise<DemandProbabilityResult> {
  const model = bundledDemandModel;
  const now = Date.now();
  const issue = demandIssue(targetDate);
  if (!model || now < Date.parse(issue.issueAt) || now >= issue.end) return fetchDemandProbability(model, targetDate, now);
  try {
    const result = await cache.load(modelCacheKey(model, targetDate), async () => {
      const prediction = await fetchDemandProbability(model, targetDate);
      if (prediction.status !== "ready") throw new Error(prediction.reason);
      return prediction;
    }, { force });
    if (!validCachedDemand(result.data, model) || result.data.targetDate !== targetDate || result.data.issueAt !== issue.issueAt) {
      if (!force) return loadDemandProbability(targetDate, true);
      return { status: "unavailable", reason: "Cached forecast target mismatch" };
    }
    return { ...result.data, ...(result.refreshError ? { inputWarning: result.refreshError } : {}) };
  } catch (error) { return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) }; }
}
