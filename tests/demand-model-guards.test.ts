import { expect, test } from "bun:test";
import { buildDemandFeatures, DEMAND_FEATURES, dailyDemand, demandDayStart, demandIssue, INTERVAL_MS, shiftDemandDate, type DemandDay, type DemandForecast } from "../src/plugins/builtin/vic-power/demand-features";
import { meanPeakCorrection, PEAK_FEATURES, validatePeakArtifact } from "../src/plugins/builtin/vic-power/demand-peak";
import artifact from "../src/plugins/builtin/vic-power/demand-peak-artifact.json";

const model = validatePeakArtifact(artifact)!;
const target = "2026-11-12";

function forecast(date: string): DemandForecast {
  const issue = demandIssue(date);
  return {
    schemaVersion: 2,
    model: "gfs_global",
    policy: "fixed-lead-48h",
    provenance: "as-issued",
    fetchedAt: new Date(issue.issueAt).toISOString(),
    availability: {
      basis: "documented-latency-assumption",
      availableAt: new Date(demandDayStart(date) - 19 * 3_600_000).toISOString(),
      evidence: "Synthetic fixture for model guard tests",
    },
    hours: Array.from({ length: 24 }, (_, hour) => {
      const time = demandDayStart(date) + hour * 3_600_000;
      return {
        time: new Date(time).toISOString(),
        referenceAt: new Date(time - 48 * 3_600_000).toISOString(),
        temperature: 20,
        humidity: 50,
      };
    }),
  };
}

function history(date: string, count = 7): DemandDay[] {
  return Array.from({ length: count }, (_, index) => ({
    date: shiftDemandDate(date, -2 - index), peak: 6000, validIntervals: 288,
    invalidIntervals: 0, duplicateIntervals: 0, conflictingIntervals: 0, complete: true,
  }));
}

test("peak artifact extends the shared demand feature contract with the weekday peak", () => {
  const features = buildDemandFeatures(target, forecast(target), history(target));
  expect(features.status).toBe("ready");
  if (features.status !== "ready") throw new Error(features.reason);
  expect(features.values).toHaveLength(DEMAND_FEATURES.length);
  expect(PEAK_FEATURES).toEqual([...DEMAND_FEATURES, "sameWeekdayPeak"]);
  expect(artifact.featureNames).toEqual(PEAK_FEATURES);
});

test("the forecast issue is fixed at 18:00 AEST on the previous NEM day", () => {
  const issue = demandIssue(target);
  expect(new Date(issue.issueAt).toISOString()).toBe("2026-11-11T08:00:00.000Z");
  expect(issue.end - issue.start).toBe(86_400_000);
});

test("features require as-issued 48-hour weather and seven complete earlier market days", () => {
  const valid = forecast(target), recent = history(target);
  expect(buildDemandFeatures(target, valid, recent).status).toBe("ready");
  expect(buildDemandFeatures(target, { ...valid, provenance: "hindcast" }, recent).status).toBe("unavailable");
  expect(buildDemandFeatures(target, { ...valid, availability: { ...valid.availability, availableAt: new Date(Date.parse(demandIssue(target).issueAt) + 1).toISOString() } }, recent).status).toBe("unavailable");
  expect(buildDemandFeatures(target, { ...valid, hours: valid.hours.slice(1) }, recent).status).toBe("unavailable");
  expect(buildDemandFeatures(target, valid, history(target, 6)).status).toBe("unavailable");
  expect(buildDemandFeatures(target, valid, [{ ...recent[0]!, complete: false }, ...recent.slice(1)]).status).toBe("unavailable");
});

test("daily demand needs every unique five-minute interval and rejects conflicts", () => {
  const start = demandDayStart(target);
  const complete = Array.from({ length: 288 }, (_, index) => ({ endAt: start + (index + 1) * INTERVAL_MS, demand: 5000 + index }));
  expect(dailyDemand(complete)[0]).toMatchObject({ date: target, peak: 5287, complete: true, validIntervals: 288 });
  expect(dailyDemand(complete.slice(1))[0]).toMatchObject({ complete: false, validIntervals: 287 });
  expect(dailyDemand([...complete, complete[0]!])[0]).toMatchObject({ complete: true, duplicateIntervals: 1 });
  expect(dailyDemand([...complete, { ...complete[0]!, demand: 9000 }])[0]).toMatchObject({ complete: false, conflictingIntervals: 1 });
});

test("rolling correction uses only the configured completed dates before the target", () => {
  const errors = Array.from({ length: model.biasCorrection.days }, (_, index) => ({
    targetDate: shiftDemandDate(target, -2 - index), actualMw: 6010, basePeakMw: 6000,
  }));
  expect(meanPeakCorrection(model, target, errors)).toBe(10);
  expect(() => meanPeakCorrection(model, target, errors.slice(1))).toThrow("Completed forecast errors are unavailable");
});
