import { expect, test } from "bun:test";
import artifact from "../src/plugins/builtin/vic-power/demand-peak-artifact.json";
import { validatePeakArtifact } from "../src/plugins/builtin/vic-power/demand-peak";

test("peak model training dates match the audited 382-day fit window", () => {
  const model = validatePeakArtifact(artifact);
  expect(model?.trainingStart).toBe("2024-03-14");
  expect(model?.trainingEnd).toBe("2025-03-30");
  expect((Date.parse(`${model!.trainingEnd}T00:00:00Z`) - Date.parse(`${model!.trainingStart}T00:00:00Z`)) / 86_400_000 + 1).toBe(382);
});

test("peak model artifact rejects an invalid training window", () => {
  expect(validatePeakArtifact({ ...artifact, trainingStart: "2025-04-01" })).toBeNull();
  expect(validatePeakArtifact({ ...artifact, trainingStart: "not-a-date" })).toBeNull();
});
