import { expect, test } from "bun:test";
import artifact from "../src/plugins/builtin/vic-power/demand-peak-artifact.json";
import { validatePeakArtifact } from "../src/plugins/builtin/vic-power/demand-peak";

test("malformed nested model fields return unavailable without throwing", () => {
  expect(validatePeakArtifact(artifact)).not.toBeNull();
  for (const patch of [
    { biasCorrection: null }, { means: null }, { scales: [0] },
    { weights: artifact.weights.map(() => NaN) }, { sourceContract: null },
    { trainingEnd: artifact.calibrationEnd }, { sourceManifestHash: "invalid" },
  ]) {
    expect(validatePeakArtifact({ ...artifact, ...patch })).toBeNull();
  }
});
