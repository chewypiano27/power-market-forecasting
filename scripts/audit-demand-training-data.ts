import { createHash } from "node:crypto";
import { join } from "node:path";
import { buildDemandFeatures, dailyDemand, parseDemandObservations, shiftDemandDate } from "../src/plugins/builtin/vic-power/demand-features";

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Expected ${name} <path>`);
  return value;
}

const sourceRoot = option("--source-root");
const output = option("--output");
const readJson = async (path: string) => Bun.file(path).json();
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const data = await readJson(join(sourceRoot, "probability/dataset.json"));
const manifest = await readJson(join(sourceRoot, "probability/dataset-manifest.json"));
if (hash(JSON.stringify(manifest)) !== data.sourceManifestHash) throw new Error("Dataset manifest hash mismatch");

const observations = [];
for (const source of manifest.sources) {
  if (source.file !== source.file.split(/[\\/]/).at(-1)) throw new Error("Invalid market source filename");
  const body = await Bun.file(join(sourceRoot, "raw/aemo", source.file)).text();
  if (hash(body) !== source.sha256) throw new Error(`Market source hash mismatch: ${source.file}`);
  observations.push(...parseDemandObservations(body));
}

const days = dailyDemand(observations);
const byDate = new Map(days.map(day => [day.date, day]));
const forecastHashes = new Map(manifest.forecastSources.map((source: { file: string; sha256: string }) => [source.file, source.sha256]));
const rows = [];
for (const row of data.rows) {
  const filename = `${row.targetDate}.json`;
  const expectedHash = forecastHashes.get(filename);
  if (!expectedHash) throw new Error(`Missing forecast hash: ${filename}`);
  const body = await Bun.file(join(sourceRoot, "probability/forecasts", filename)).text();
  if (hash(body) !== expectedHash) throw new Error(`Forecast hash mismatch: ${filename}`);
  const forecast = JSON.parse(body);
  const rebuilt = buildDemandFeatures(row.targetDate, forecast, days);
  const day = byDate.get(row.targetDate);
  if (rebuilt.status !== "ready" || JSON.stringify(rebuilt.values) !== JSON.stringify(row.values)
    || !day?.complete || day.peak !== row.peak) throw new Error(`Feature/label parity mismatch: ${row.targetDate}`);
  const baseline = byDate.get(shiftDemandDate(row.targetDate, -7));
  if (!baseline?.complete || baseline.peak === null) throw new Error(`Missing same-weekday baseline: ${row.targetDate}`);
  if (Date.parse(forecast.availability.availableAt) > Date.parse(row.issueAt)) throw new Error(`Weather unavailable at issue: ${row.targetDate}`);
  rows.push({ ...row, values: [...rebuilt.values, baseline.peak], baselineMw: baseline.peak,
    outcomeAvailableAt: new Date(Date.parse(`${row.targetDate}T00:00:00+10:00`) + 86_400_000).toISOString() });
}

await Bun.write(output, JSON.stringify({ ...data, featureNames: [...data.featureNames, "sameWeekdayPeak"], rows }));
console.log(JSON.stringify({ rows: rows.length, from: rows[0]?.targetDate, through: rows.at(-1)?.targetDate,
  marketSources: manifest.sources.length, forecastSources: forecastHashes.size, rawSourceHashesVerified: true,
  featuresRebuilt: true, labelsRebuilt: true, sourceManifestHash: data.sourceManifestHash }, null, 2));
