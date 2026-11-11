import summary from "./demand-peak-history-summary.json";
import firstHalf from "./demand-peak-history-h1.json";
import secondHalf from "./demand-peak-history-h2.json";

export const peakHistoryCandidate = { ...summary, rows: [...firstHalf, ...secondHalf] };
