import { createHash } from "node:crypto";
import { buildDemandFeatures, dailyDemand, demandDayStart, demandIssue, parseDemandObservations, shiftDemandDate, type DemandForecast } from "../src/plugins/builtin/vic-power/demand-features";

const FIRST_MONTH = "2024-03";
const LAST_MONTH = "2026-10";
const FIRST_TARGET = "2024-03-14";
const LAST_TARGET = "2026-10-31";
const SOURCE_MANIFEST_HASH = "ab0ecd99270f1c574aec70c1fe64a627676efcdc07e9698f0a1e554c4d169623";
const DATASET_SHA256 = "8cb58cc2076f04e3c83845b2dbeaa0a991b77f84d5da911783d0244ef93cf945";
const MARKET_ARCHIVE_SHA256 = "8c5dea476cf433e2edc13a0dd34fbaf558b849b3213e6f4ddebfaf01adcf48f8";
const WEATHER_ARCHIVE_SHA256 = "71f6555a7dc398c95e566ec6ee77d0bbab9dcc197867a34fa0a5727ff6bc8da1";
const AVAILABILITY_EVIDENCE = "Conservative availability assumption: each hour reference is valid time minus 48 hours, plus six hours for global-model availability. Latest target-hour reference plus six hours is 13 hours before the fixed issue cutoff. This is an assumption, not a measured publication timestamp.";
const FEATURE_NAMES = ["temperatureMax", "temperatureMin", "coolingDegrees", "heatingDegrees", "humidityMean", "previousCompletedPeak", "sevenDayMeanPeak", "weekend", "publicHoliday", "seasonSin", "seasonCos", "sameWeekdayPeak"];
const CONTRACT = {
  model: "gfs_global",
  policy: "fixed-lead-48h",
  asIssuedFrom: "2024-01-01",
  provenanceEvidence: "https://open-meteo.com/en/docs/previous-runs-api documents archived forecasts at fixed 48-hour lead, most variables from January 2024, with GFS temperature from March 2021. Coverage must still pass the collection pilot. Each hourly value has a separate lead reference; no common initialisation is claimed.",
  latencyHours: 6,
  latencyEvidence: AVAILABILITY_EVIDENCE,
};
const MARKET_MONTHS = monthsBetween(FIRST_MONTH, LAST_MONTH);

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Expected ${name} <path>`);
  return value;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function monthsBetween(first: string, last: string): string[] {
  const [startYear, startMonth] = first.split("-").map(Number);
  const [endYear, endMonth] = last.split("-").map(Number);
  const months: string[] = [];
  for (let index = startYear * 12 + startMonth - 1; index <= endYear * 12 + endMonth - 1; index++) {
    months.push(`${Math.floor(index / 12)}${String(index % 12 + 1).padStart(2, "0")}`);
  }
  return months;
}

async function fetchMarketMonth(month: string): Promise<string> {
  const url = `https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${month}_VIC1.csv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`AEMO ${month}: HTTP ${response.status}`);
  return response.text();
}

async function fetchMarketData(): Promise<string[]> {
  const months = MARKET_MONTHS;
  const result = new Array<string>(months.length);
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < months.length) {
      const index = next++;
      result[index] = await fetchMarketMonth(months[index]!);
    }
  }));
  return result;
}

async function fetchWeatherData() {
  const url = new URL("https://previous-runs-api.open-meteo.com/v1/forecast");
  for (const [key, value] of Object.entries({
    latitude: "-37.8136", longitude: "144.9631", models: "gfs_global",
    start_date: "2024-03-13", end_date: LAST_TARGET,
    hourly: "temperature_2m_previous_day2,relative_humidity_2m_previous_day2",
    timeformat: "unixtime", timezone: "GMT",
  })) url.searchParams.set(key, value);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo Previous Runs API: HTTP ${response.status}`);
  const payload = await response.json() as { hourly?: { time?: number[]; temperature_2m_previous_day2?: number[]; relative_humidity_2m_previous_day2?: number[] } };
  const hourly = payload.hourly;
  if (!hourly?.time || !hourly.temperature_2m_previous_day2 || !hourly.relative_humidity_2m_previous_day2
    || hourly.time.length !== 23_112 || hourly.time.length !== hourly.temperature_2m_previous_day2.length
    || hourly.time.length !== hourly.relative_humidity_2m_previous_day2.length) throw new Error("Open-Meteo returned incomplete weather history");
  return hourly;
}

const outputPath = option("--output");
const [marketCsv, weather] = await Promise.all([fetchMarketData(), fetchWeatherData()]);
const marketHash = hash(marketCsv.map((csv, index) => `PRICE_AND_DEMAND_${MARKET_MONTHS[index]}_VIC1.csv:${hash(csv)}`).join("\n"));
if (marketHash !== MARKET_ARCHIVE_SHA256) throw new Error(`AEMO archive content changed (SHA-256=${marketHash})`);
const weatherHash = hash(stableJson(weather));
if (weatherHash !== WEATHER_ARCHIVE_SHA256) throw new Error(`Open-Meteo archive content changed (SHA-256=${weatherHash})`);
const days = dailyDemand(marketCsv.flatMap(parseDemandObservations));
const marketByDate = new Map(days.map(day => [day.date, day]));
const weatherByTime = new Map(weather.time.map((seconds, index) => [seconds * 1000, index]));

const rows = [];
for (let target = Date.parse(`${FIRST_TARGET}T00:00:00Z`), end = Date.parse(`${LAST_TARGET}T00:00:00Z`); target <= end; target += 86_400_000) {
  const targetDate = new Date(target).toISOString().slice(0, 10);
  const issue = demandIssue(targetDate);
  const start = demandDayStart(targetDate);
  const hours: DemandForecast["hours"] = [];
  for (let time = start; time < start + 86_400_000; time += 3_600_000) {
    const index = weatherByTime.get(time);
    if (index === undefined) throw new Error(`Missing archived weather hour: ${new Date(time).toISOString()}`);
    hours.push({
      time: new Date(time).toISOString(),
      referenceAt: new Date(time - 48 * 3_600_000).toISOString(),
      temperature: weather.temperature_2m_previous_day2![index]!,
      humidity: weather.relative_humidity_2m_previous_day2![index]!,
    });
  }
  const latestReference = Date.parse(hours.at(-1)!.referenceAt);
  const forecast = {
    schemaVersion: 2, model: "gfs_global", policy: "fixed-lead-48h", provenance: "as-issued",
    availability: { basis: "documented-latency-assumption", availableAt: new Date(latestReference + 6 * 3_600_000).toISOString(), evidence: AVAILABILITY_EVIDENCE },
    hours,
  } as DemandForecast;
  const featureResult = buildDemandFeatures(targetDate, forecast, days);
  const marketDay = marketByDate.get(targetDate);
  if (featureResult.status !== "ready" || !marketDay?.complete || marketDay.peak === null) throw new Error(`Incomplete training row: ${targetDate}`);
  const baseline = marketByDate.get(shiftDemandDate(targetDate, -7));
  if (!baseline?.complete || baseline.peak === null) throw new Error(`Missing same-weekday baseline: ${targetDate}`);
  rows.push({
    status: "ready", values: [...featureResult.values, baseline.peak], issueAt: featureResult.issueAt,
    forecastReferenceAt: featureResult.forecastReferenceAt, targetDate, peak: marketDay.peak,
    complete: marketDay.complete, conflictingIntervals: marketDay.conflictingIntervals,
    availabilityBasis: "documented-latency-assumption", provenance: "as-issued",
    baselineMw: baseline.peak,
    outcomeAvailableAt: new Date(start + 86_400_000).toISOString(),
  });
}

const dataset = {
  schemaVersion: 2,
  featureNames: FEATURE_NAMES,
  sourceManifestHash: SOURCE_MANIFEST_HASH,
  contract: CONTRACT,
  rows,
};
const serialized = JSON.stringify(dataset);
const datasetSha256 = hash(serialized);
if (rows.length !== 962 || datasetSha256 !== DATASET_SHA256) {
  throw new Error(`Fetched data does not match the model's audited input (rows=${rows.length}, SHA-256=${datasetSha256})`);
}
await Bun.write(outputPath, serialized);
console.log(JSON.stringify({ rows: rows.length, from: FIRST_TARGET, through: LAST_TARGET,
  marketMonths: marketCsv.length, weatherHours: weather.time.length, datasetSha256,
  sourceManifestHash: SOURCE_MANIFEST_HASH, marketArchiveVerified: true, weatherArchiveVerified: true,
  noSourceSnapshotsSaved: true }, null, 2));
