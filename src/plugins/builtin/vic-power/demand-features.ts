import { victorianCalendarAnnotation } from "./victoria-calendar";

export const DEMAND_SCHEMA = 2;
export const NEM_DAY_MS = 86_400_000;
export const INTERVAL_MS = 300_000;
export const DEMAND_MODEL = "gfs_global";
export const DEMAND_FORECAST_POLICY = "fixed-lead-48h";
export const DEMAND_FEATURES = ["temperatureMax", "temperatureMin", "coolingDegrees", "heatingDegrees", "humidityMean",
  "previousCompletedPeak", "sevenDayMeanPeak", "weekend", "publicHoliday", "seasonSin", "seasonCos"] as const;

export function shiftDemandDate(date: string, days: number): string {
  const start = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== date) throw new Error(`Invalid target date: ${date}`);
  return new Date(start + days * NEM_DAY_MS).toISOString().slice(0, 10);
}

export function demandDayStart(date: string): number {
  shiftDemandDate(date, 0);
  return Date.parse(`${date}T00:00:00+10:00`);
}

export function demandIssue(date: string) {
  return { targetDate: date, start: demandDayStart(date), end: demandDayStart(date) + NEM_DAY_MS,
    issueAt: new Date(demandDayStart(date) - 6 * 3_600_000).toISOString() };
}

export interface DemandObservation { endAt: number; demand: number | null }
export interface DemandDay {
  date: string; peak: number | null; validIntervals: number; invalidIntervals: number;
  duplicateIntervals: number; conflictingIntervals: number; complete: boolean;
}

function csvFields(line: string): string[] {
  return (line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g) ?? []).map(cell => {
    const text = cell.replace(/^,/, "").trim();
    return text.startsWith('"') ? text.slice(1, -1).replaceAll('""', '"') : text;
  });
}

/** Unlike hourly modelling means, these retain every original interval and invalid demand. */
export function parseDemandObservations(csv: string): DemandObservation[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  const header = csvFields(lines.shift() ?? "").map(value => value.toUpperCase());
  for (const column of ["REGION", "SETTLEMENTDATE", "TOTALDEMAND", "PERIODTYPE"]) if (!header.includes(column)) throw new Error(`Missing demand column: ${column}`);
  const at = (row: string[], column: string) => row[header.indexOf(column)] ?? "";
  return lines.flatMap(line => {
    const row = csvFields(line);
    if (at(row, "REGION") !== "VIC1" || !["TRADE", "ACTUAL"].includes(at(row, "PERIODTYPE").toUpperCase())) return [];
    const stamp = at(row, "SETTLEMENTDATE").replaceAll("/", "-").replace(" ", "T");
    const endAt = Date.parse(`${stamp}+10:00`);
    // Do not allow Date.parse to normalise impossible dates, non-boundary intervals or future rows.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(stamp) || !Number.isFinite(endAt)
      || endAt % INTERVAL_MS !== 0 || new Date(endAt + 10 * 3_600_000).toISOString().slice(0, 19) !== stamp) return [];
    const raw = at(row, "TOTALDEMAND");
    const value = raw === "" ? NaN : Number(raw);
    return [{ endAt, demand: Number.isFinite(value) ? value : null }];
  });
}

export function dailyDemand(observations: readonly DemandObservation[]): DemandDay[] {
  const groups = new Map<string, Map<number, { value: number | null; conflict: boolean; duplicates: number }>>();
  for (const observation of observations) {
    if (!Number.isFinite(observation.endAt) || observation.endAt % INTERVAL_MS !== 0) continue;
    const date = new Date(observation.endAt - 1 + 10 * 3_600_000).toISOString().slice(0, 10);
    const day = groups.get(date) ?? new Map();
    const old = day.get(observation.endAt);
    const value = observation.demand !== null && Number.isFinite(observation.demand) ? observation.demand : null;
    if (old) { old.duplicates++; old.conflict ||= old.value !== value; }
    else day.set(observation.endAt, { value, conflict: false, duplicates: 0 });
    groups.set(date, day);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, intervals]) => {
    const cells = [...intervals.values()];
    const values = cells.filter(cell => !cell.conflict && cell.value !== null).map(cell => cell.value!);
    const invalidIntervals = cells.filter(cell => cell.value === null).length;
    const conflictingIntervals = cells.filter(cell => cell.conflict).length;
    return { date, peak: values.length ? Math.max(...values) : null, validIntervals: values.length,
      invalidIntervals, duplicateIntervals: cells.reduce((sum, cell) => sum + cell.duplicates, 0), conflictingIntervals,
      complete: values.length === 288 && invalidIntervals === 0 && conflictingIntervals === 0 };
  });
}

export interface DemandForecast {
  schemaVersion: 2; model: string; policy: "fixed-lead-48h"; fetchedAt: string;
  provenance: "as-issued" | "hindcast" | "unknown";
  availability: { basis: "documented-latency-assumption" | "verified-publication"; availableAt: string; evidence: string };
  hours: Array<{ time: string; referenceAt: string; temperature: number; humidity: number }>;
}
export type FeatureResult = { status: "ready"; values: number[]; issueAt: string; forecastReferenceAt: string; targetDate: string }
  | { status: "unavailable"; reason: string };

export function buildDemandFeatures(date: string, forecast: DemandForecast, history: readonly DemandDay[]): FeatureResult {
  const issue = demandIssue(date);
  if (!forecast || !Array.isArray(forecast.hours) || !forecast.availability || typeof forecast.availability.evidence !== "string") return { status: "unavailable", reason: "Malformed forecast envelope" };
  if (forecast.schemaVersion !== DEMAND_SCHEMA || forecast.model !== DEMAND_MODEL || forecast.provenance !== "as-issued") return { status: "unavailable", reason: "Requires the pinned model's as-issued forecast; hindcasts and unknown provenance are ineligible" };
  if (forecast.policy !== DEMAND_FORECAST_POLICY) return { status: "unavailable", reason: "Forecast lead-time policy does not match the model" };
  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(forecast.availability.availableAt)
    || !["documented-latency-assumption", "verified-publication"].includes(forecast.availability.basis)) return { status: "unavailable", reason: "Ambiguous forecast availability clock" };
  const available = Date.parse(forecast.availability.availableAt);
  if (!Number.isFinite(available) || available > Date.parse(issue.issueAt) || !forecast.availability.evidence.trim()) return { status: "unavailable", reason: "Forecast availability at the issue cutoff is not established" };
  if (forecast.hours.some(hour => !hour || typeof hour.time !== "string")) return { status: "unavailable", reason: "Malformed forecast hour" };
  const hours = forecast.hours.filter(hour => Date.parse(hour.time) >= issue.start && Date.parse(hour.time) < issue.end);
  const times = new Set(hours.map(hour => Date.parse(hour.time)));
  if (hours.length !== 24 || times.size !== 24 || [...times].some(time => (time - issue.start) % 3_600_000 !== 0)
    || hours.some(hour => !/(?:Z|[+-]\d\d:\d\d)$/.test(hour.time) || !Number.isFinite(hour.temperature) || !Number.isFinite(hour.humidity) || hour.humidity < 0 || hour.humidity > 100)) return { status: "unavailable", reason: "Requires 24 distinct, valid hourly forecasts covering the NEM day" };
  // Each hourly value has its own 48-hour reference. This is not one common model run.
  if (hours.some(hour => typeof hour.referenceAt !== "string" || !/(?:Z|[+-]\d\d:\d\d)$/.test(hour.referenceAt)
    || Date.parse(hour.referenceAt) !== Date.parse(hour.time) - 48 * 3_600_000)) return { status: "unavailable", reason: "Hourly forecast references must precede valid times by 48 hours" };
  const latestReference = Math.max(...hours.map(hour => Date.parse(hour.referenceAt)));
  if (available < latestReference) return { status: "unavailable", reason: "Forecast availability precedes its latest reference" };
  const byDate = new Map(history.map(day => [day.date, day]));
  // At 18:00 on D-1, the most recent complete NEM day is D-2, not D-1.
  const lookbacks = Array.from({ length: 7 }, (_, index) => byDate.get(shiftDemandDate(date, -2 - index)));
  if (lookbacks.some(day => !day?.complete || day.peak === null || !Number.isFinite(day.peak))) return { status: "unavailable", reason: "Seven completed, valid market days before the cutoff are required" };
  const temperatures = hours.map(hour => hour.temperature);
  const day = new Date(`${date}T00:00:00Z`);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const yearEnd = Date.UTC(day.getUTCFullYear() + 1, 0, 1);
  const season = 2 * Math.PI * (day.getTime() - yearStart) / (yearEnd - yearStart);
  if (![2024, 2025, 2026].includes(day.getUTCFullYear())) return { status: "unavailable", reason: "Calendar coverage is limited to audited years 2024-2026" };
  const values = [Math.max(...temperatures), Math.min(...temperatures),
    temperatures.reduce((sum, value) => sum + Math.max(0, value - 22), 0) / 24,
    temperatures.reduce((sum, value) => sum + Math.max(0, 16 - value), 0) / 24,
    hours.reduce((sum, hour) => sum + hour.humidity, 0) / 24,
    lookbacks[0]!.peak!, lookbacks.reduce((sum, value) => sum + value!.peak!, 0) / 7,
    Number([0, 6].includes(day.getUTCDay())), Number(victorianCalendarAnnotation(date).isPublicHoliday), Math.sin(season), Math.cos(season)];
  return { status: "ready", values, issueAt: issue.issueAt, forecastReferenceAt: new Date(latestReference).toISOString(), targetDate: date };
}
