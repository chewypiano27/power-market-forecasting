import { expect, test } from "bun:test";
import artifact from "../src/plugins/builtin/vic-power/demand-peak-artifact.json";
import { buildDemandFeatures, demandDayStart, demandIssue, shiftDemandDate, type DemandForecast } from "../src/plugins/builtin/vic-power/demand-features";
import { evaluatePeakModel, peakDemand, validatePeakArtifact } from "../src/plugins/builtin/vic-power/demand-peak";
import { fetchTemperatureInputs, temperaturePeakScenario, temperatureHourlyProfile, type TemperatureInputs } from "../src/plugins/builtin/vic-power/demand-temperature-scenario";

const model = validatePeakArtifact(artifact)!;
const target = "2026-11-12", issue = demandIssue(target), now = Date.parse(issue.issueAt) + 1_000;
function weather(date: string): DemandForecast {
  return { schemaVersion: 2, model: "gfs_global", policy: "fixed-lead-48h", provenance: "as-issued", fetchedAt: new Date(now).toISOString(),
    availability: { basis: "documented-latency-assumption", availableAt: new Date(demandDayStart(date) - 19 * 3_600_000).toISOString(), evidence: "Synthetic test fixture, not observed data" },
    hours: Array.from({ length: 24 }, (_, hour) => ({ time: new Date(demandDayStart(date) + hour * 3_600_000).toISOString(), referenceAt: new Date(demandDayStart(date) + (hour - 48) * 3_600_000).toISOString(), temperature: 20, humidity: 50 })) };
}
function inputs(): TemperatureInputs {
  return { forecast: weather(target), recentForecasts: new Map(Array.from({ length: model.biasCorrection.days }, (_, i) => { const date = shiftDemandDate(target, -2-i); return [date, weather(date)]; })),
    history: Array.from({ length: 40 }, (_, i) => ({ date: shiftDemandDate(target, -1-i), peak: 6000, complete: true, validIntervals: 288, invalidIntervals: 0, duplicateIntervals: 0, conflictingIntervals: 0 })) };
}
test("zero temperature change reproduces the fitted peak exactly", () => {
  const data = inputs();
  expect(temperaturePeakScenario(model, target, data, now, 0)).toEqual(peakDemand(model, target, data.forecast, data.history, now, data.recentForecasts));
});
test("temperature scenario uses fitted features and retains all other inputs and correction", () => {
  const data = inputs(), unchanged = JSON.stringify(data.forecast);
  const base = temperaturePeakScenario(model, target, data, now, 0), scenario = temperaturePeakScenario(model, target, data, now, 5);
  expect(base.status).toBe("ready"); expect(scenario.status).toBe("ready");
  if (base.status !== "ready" || scenario.status !== "ready") throw new Error("Fixture did not produce a usable peak");
  const altered = { ...data.forecast, hours: data.forecast.hours.map(hour => ({ ...hour, temperature: hour.temperature + 5 })) };
  const features = buildDemandFeatures(target, altered, data.history);
  if (features.status !== "ready") throw new Error(features.reason);
  expect(scenario.peakMw).toBeCloseTo(evaluatePeakModel(model, [...features.values, base.baselineMw]) + base.correctionMw, 8);
  expect(scenario.correctionMw).toBe(base.correctionMw);
  expect(scenario.calculation!.demandMw).toBe(base.calculation!.demandMw);
  expect(scenario.calculation!.calendarMw).toBe(base.calculation!.calendarMw);
  expect(scenario.calculation!.weatherMw).not.toBe(base.calculation!.weatherMw);
  expect(JSON.stringify(data.forecast)).toBe(unchanged);
});
test("invalid changes, incomplete inputs, future issues and expired targets remain unavailable", () => {
  for (const delta of [NaN, Infinity, -9, 9]) expect(temperaturePeakScenario(model, target, inputs(), now, delta).status).toBe("unavailable");
  const incomplete = inputs(); incomplete.forecast.hours.pop();
  expect(temperaturePeakScenario(model, target, incomplete, now, 2).status).toBe("unavailable");
  expect(temperaturePeakScenario(model, target, inputs(), Date.parse(issue.issueAt)-1, 2).status).toBe("pending");
  expect(temperaturePeakScenario(model, target, inputs(), issue.end, 2).status).toBe("expired");
});
test("input retrieval has a deadline even if the transport ignores abort", async () => {
  await expect(fetchTemperatureInputs(target, model, now, () => new Promise(() => {}), 5)).rejects.toThrow("Temperature inputs timed out");
});

test("hourly scenario retains the prior weekday shape and reaches each fitted peak", () => {
  const data = inputs();
  const start = demandDayStart(shiftDemandDate(target, -7));
  data.observations = Array.from({ length: 288 }, (_, i) => ({ endAt: start + (i + 1) * 300_000, demand: 4000 + Math.floor(i / 12) * 50 }));
  const rows = temperatureHourlyProfile(target, data, 6000, 6500);
  expect(rows).toHaveLength(24);
  expect(Math.max(...rows.map(row => row.baselineMw))).toBe(6000);
  expect(Math.max(...rows.map(row => row.scenarioMw))).toBe(6500);
  expect(rows[0]!.time.getTime()).toBe(demandDayStart(target));
  for (const row of rows) expect(row.scenarioMw / row.baselineMw).toBeCloseTo(6500 / 6000, 10);
  expect(temperatureHourlyProfile(target, data, 6000, 6000).every(row => row.baselineMw === row.scenarioMw)).toBe(true);
  data.observations.pop();
  expect(temperatureHourlyProfile(target, data, 6000, 6500)).toHaveLength(0);
});
