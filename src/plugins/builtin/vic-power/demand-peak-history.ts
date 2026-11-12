import { shiftDemandDate } from "./demand-features";
import type { PeakArtifact } from "./demand-peak";
export interface PeakHistory {
  schemaVersion: 1; evaluationSha256: string; sourceManifestHash: string;
  fromDate: string; through: string; days: number; maeMw: number; rmseMw: number; biasMw: number; baselineMaeMw: number;
  bandCoverage: number; bandTarget: number; rows: Array<[string, number, number, number]>;
}
/** Tie the held-out comparison to the candidate and reconcile all displayed error metrics. */
export function validatePeakHistory(value: unknown, model: PeakArtifact | null): PeakHistory {
  const data = value as PeakHistory;
  if (!model || !data || data.schemaVersion !== 1 || data.evaluationSha256 !== model.evaluationSha256 || data.sourceManifestHash !== model.sourceManifestHash
    || !Array.isArray(data.rows) || !data.rows.length || data.rows.length !== data.days || data.fromDate !== data.rows[0]?.[0]
    || data.through !== data.rows.at(-1)?.[0] || data.through !== model.testEnd || data.fromDate <= model.calibrationEnd
    || !Number.isFinite(data.bandCoverage) || data.bandCoverage < 0 || data.bandCoverage > 1 || data.bandTarget !== .8) throw new Error("Peak history does not match the candidate");
  let absolute = 0, squared = 0, bias = 0, baseline = 0, previous = "";
  for (const row of data.rows) {
    if (!Array.isArray(row) || row.length !== 4 || typeof row[0] !== "string" || shiftDemandDate(row[0], 0) !== row[0]
      || (previous && row[0] !== shiftDemandDate(previous, 1)) || row.slice(1).some(value => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) throw new Error("Invalid held-out peak row");
    previous = row[0];
    const error = row[1] - row[2]; absolute += Math.abs(error); squared += error ** 2; bias += error; baseline += Math.abs(row[3] - row[2]);
  }
  const pairs = [[data.maeMw, absolute / data.days], [data.rmseMw, Math.sqrt(squared / data.days)], [data.biasMw, bias / data.days], [data.baselineMaeMw, baseline / data.days]];
  if (pairs.some(([value, expected]) => !Number.isFinite(value) || Math.abs(value! - expected!) > 1e-5)) throw new Error("Peak history metrics do not reconcile");
  return data;
}
