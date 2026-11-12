import type { PeakArtifact } from "./demand-peak";
import type { PeakJournalEntry } from "./demand-peak-journal";
import { shiftDemandDate } from "./demand-features";
import data from "./demand-peak-test-data.json";
export type PeakTestRow = [string, number, number | null, number];
/** Archived-input calculations remain separate from the first-saved forecast journal. */
export function peakTestRows(model: PeakArtifact | null, journal: readonly PeakJournalEntry[], comparisons: readonly PeakTestRow[] = []): PeakTestRow[] {
  if (!model || data.evaluationSha256 !== model.evaluationSha256 || data.sourceManifestHash !== model.sourceManifestHash
    || model.trainingEnd >= data.fromDate || model.calibrationEnd >= data.fromDate || model.testEnd >= data.fromDate) return [];
  const rows: PeakTestRow[] = [];
  for (const [i, row] of data.rows.entries()) {
    const [day, forecast, actual, weekly] = row;
    if (day !== shiftDemandDate(data.fromDate, i) || typeof forecast !== "number" || typeof actual !== "number" || typeof weekly !== "number"
      || ![forecast, actual, weekly].every(value => Number.isFinite(value) && value > 0)) return [];
    rows.push([day as string, forecast, actual, weekly]);
  }
  if (rows.at(-1)?.[0] !== data.through) return [];
  for (const row of comparisons) {
    if (row[0] > data.through && !rows.some(existing => existing[0] === row[0])) rows.push(row);
  }
  for (const entry of journal) {
    if (entry.targetDate < data.fromDate) continue;
    const index = rows.findIndex(row => row[0] === entry.targetDate);
    const row: PeakTestRow = [entry.targetDate, entry.peakMw, entry.actualMw ?? rows[index]?.[2] ?? null, entry.baselineMw];
    if (index < 0) rows.push(row); else rows[index] = row;
  }
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
}
export function peakTestMetrics(rows: readonly PeakTestRow[]) {
  const complete = rows.filter((row): row is [string, number, number, number] => row[2] !== null);
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return { count: complete.length, maeMw: mean(complete.map(row => Math.abs(row[1] - row[2]))),
    baselineMaeMw: mean(complete.map(row => Math.abs(row[3] - row[2]))), biasMw: mean(complete.map(row => row[1] - row[2])) };
}
