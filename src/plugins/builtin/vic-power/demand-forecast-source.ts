import { demandIssue, DEMAND_MODEL, DEMAND_FORECAST_POLICY, type DemandForecast } from "./demand-features";

export const DEMAND_FORECAST_SOURCE = {
  model: DEMAND_MODEL, policy: DEMAND_FORECAST_POLICY, asIssuedFrom: "2024-01-01", latencyHours: 6,
  latencyEvidence: "Conservative availability assumption: each hourly reference is valid time minus 48 hours, plus six hours for global-model availability. This is an assumption, not a measured publication timestamp.",
};

export function demandForecastUrl(targetDate: string): string {
  const issue = demandIssue(targetDate);
  const query = new URLSearchParams({ latitude: "-37.8136", longitude: "144.9631", models: DEMAND_MODEL,
    start_date: new Date(issue.start).toISOString().slice(0, 10), end_date: new Date(issue.end - 1).toISOString().slice(0, 10),
    hourly: "temperature_2m_previous_day2,relative_humidity_2m_previous_day2", timeformat: "unixtime", timezone: "GMT" });
  return `https://previous-runs-api.open-meteo.com/v1/forecast?${query}`;
}

export function parseDemandForecast(body: string, targetDate: string, contract: {
  model: string; policy: string; asIssuedFrom: string | null; latencyHours: number; latencyEvidence: string;
}, fetchedAt: string): DemandForecast {
  const payload = JSON.parse(body);
  if (contract.model !== DEMAND_MODEL || contract.policy !== DEMAND_FORECAST_POLICY || !Number.isFinite(contract.latencyHours)
    || contract.latencyHours < 0 || contract.latencyHours > 8) throw new Error("Unsupported demand forecast contract");
  if (payload.hourly_units?.time !== "unixtime" || payload.hourly_units?.temperature_2m_previous_day2 !== "°C"
    || payload.hourly_units?.relative_humidity_2m_previous_day2 !== "%" || !Array.isArray(payload.hourly?.time)) throw new Error("Unexpected demand forecast units or schema");
  const issue = demandIssue(targetDate);
  const hours = payload.hourly.time.flatMap((time: unknown, index: number) => {
    const temperature = payload.hourly.temperature_2m_previous_day2?.[index];
    const humidity = payload.hourly.relative_humidity_2m_previous_day2?.[index];
    if (typeof time !== "number" || !Number.isFinite(time) || typeof temperature !== "number" || !Number.isFinite(temperature) || typeof humidity !== "number" || !Number.isFinite(humidity) || humidity < 0 || humidity > 100 || time % 3600 !== 0) return [];
    const instant = time * 1000;
    if (instant < issue.start || instant >= issue.end) return [];
    return [{ time: new Date(instant).toISOString(), referenceAt: new Date(instant - 48 * 3_600_000).toISOString(), temperature, humidity }];
  });
  if (hours.length !== 24 || new Set(hours.map((hour: { time: string }) => hour.time)).size !== 24) throw new Error("Demand forecast needs all 24 target hours");
  return { schemaVersion: 2, model: DEMAND_MODEL, policy: DEMAND_FORECAST_POLICY, fetchedAt,
    provenance: contract.asIssuedFrom && targetDate >= contract.asIssuedFrom ? "as-issued" : "unknown",
    availability: { basis: "documented-latency-assumption", evidence: contract.latencyEvidence,
      availableAt: new Date(issue.end - 3_600_000 - 48 * 3_600_000 + contract.latencyHours * 3_600_000).toISOString() }, hours };
}
