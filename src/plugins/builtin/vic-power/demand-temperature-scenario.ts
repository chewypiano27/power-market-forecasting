import { buildDemandFeatures, demandIssue, type DemandForecast, type DemandObservation, demandDayStart, shiftDemandDate } from "./demand-features";
import { evaluatePeakModel, peakDemand, type PeakArtifact, type PeakResult } from "./demand-peak";
import { peakCalculation } from "./demand-peak-calculation";
import { fetchDemandInputs } from "./demand-service";
import { httpFetch, type HttpFetchTransport } from "../../../utils/http-transport";

export type TemperatureInputs = Omit<Awaited<ReturnType<typeof fetchDemandInputs>>, "observations"> & { observations?: DemandObservation[] };
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

/** Use a complete earlier weekday's shape; the fitted model supplies the peak level. */
export function temperatureHourlyProfile(target: string, inputs: TemperatureInputs, baselineMw: number, scenarioMw: number) {
  const day = shiftDemandDate(target, -7);
  if (!inputs.history.some(row => row.date === day && row.complete)) return [];
  const start = demandDayStart(day), targetStart = demandDayStart(target);
  const intervals = new Map((inputs.observations ?? []).filter(row => row.endAt > start && row.endAt <= start + 86_400_000).map(row => [row.endAt, row.demand]));
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const values = Array.from({ length: 12 }, (_, i) => intervals.get(start + (hour * 12 + i + 1) * 300_000));
    return values.every(value => value !== undefined && value !== null && Number.isFinite(value))
      ? values.reduce<number>((sum, value) => sum + value!, 0) / 12 : null;
  });
  if (hours.some(value => value === null)) return [];
  const peak = Math.max(...hours as number[]);
  if (!(peak > 0)) return [];
  return hours.map((value, hour) => ({ time: new Date(targetStart + hour * 3_600_000), baselineMw: value! / peak * baselineMw, scenarioMw: value! / peak * scenarioMw }));
}
