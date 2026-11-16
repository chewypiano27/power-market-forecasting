import { buildDemandFeatures, demandIssue, type DemandForecast } from "./demand-features";
import { evaluatePeakModel, peakDemand, type PeakArtifact, type PeakResult } from "./demand-peak";
import { peakCalculation } from "./demand-peak-calculation";
import { fetchDemandInputs } from "./demand-service";
import { httpFetch, type HttpFetchTransport } from "../../../utils/http-transport";

export type TemperatureInputs = Awaited<ReturnType<typeof fetchDemandInputs>>;
/** Conditional model sensitivity: change temperature only, retaining historical inputs and correction. */
export function temperaturePeakScenario(model: PeakArtifact, target: string, inputs: TemperatureInputs, now: number, delta: number): PeakResult {
  if (!Number.isFinite(delta) || Math.abs(delta) > 8) return { status: "unavailable", reason: "Temperature change must be between -8 and +8 degrees" };
  const baseline = peakDemand(model, target, inputs.forecast, inputs.history, now, inputs.recentForecasts);
  if (baseline.status !== "ready" || delta === 0) return baseline;
  const forecast: DemandForecast = { ...inputs.forecast, hours: inputs.forecast.hours.map(hour => ({ ...hour, temperature: hour.temperature + delta })) };
  const features = buildDemandFeatures(target, forecast, inputs.history);
  if (features.status !== "ready") return features;
  const values = [...features.values, baseline.baselineMw];
  const basePeakMw = evaluatePeakModel(model, values), peakMw = basePeakMw + baseline.correctionMw;
  if (!Number.isFinite(peakMw) || peakMw <= 0) return { status: "unavailable", reason: "Temperature scenario produced an invalid peak" };
  return { ...baseline, basePeakMw, peakMw, calculation: peakCalculation(model, values) };
}

export async function fetchTemperatureInputs(target: string, model: PeakArtifact, now = Date.now(), fetcher: HttpFetchTransport = httpFetch, timeoutMs = 20_000): Promise<TemperatureInputs> {
  const issue = demandIssue(target);
  if (now < Date.parse(issue.issueAt) || now >= issue.end) throw new Error("Temperature sensitivity requires an issued, current demand forecast");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Temperature inputs timed out")); }, timeoutMs); });
    return await Promise.race([fetchDemandInputs(target, now, fetcher, controller.signal, model.biasCorrection.days), deadline]);
  } finally { clearTimeout(timer); controller.abort(); }
}
