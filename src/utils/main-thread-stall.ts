export interface StallEvent {
  blockedMs: number;
  /** The last measured section before the stall (perf-marks), if any. */
  lastMeasured?: string;
  /** How long before the stall was noticed that section ended. */
  lastMeasuredEndedMsAgo?: number;
}
