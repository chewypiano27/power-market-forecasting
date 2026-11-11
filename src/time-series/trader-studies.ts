/**
 * Studies that read whole bars (high, low, close and volume) rather than one
 * value per observation: session and anchored VWAP, average true range, and
 * the volume traded at each price over a set of bars.
 */

export interface StudyBar {
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VolumeProfileRow {
  low: number;
  high: number;
  volume: number;
  /** Inside the value area around the point of control. */
  valueArea: boolean;
}

export interface VolumeProfile {
  /** Equal price bands from the lowest low to the highest high, lowest first. */
  rows: VolumeProfileRow[];
  /** The row with the most volume. */
  pocIndex: number;
  /** Middle of the point-of-control row. */
  poc: number;
  maxVolume: number;
  totalVolume: number;
}

/**
 * Volume at price over `bars`: each bar spreads its volume evenly over its
 * high-low range, and a bar with no range puts it all at its close. The value
 * area starts at the point of control and takes the busier neighbouring row
 * (the upper one on a tie) until it holds `valueAreaShare` of the volume.
 */
export function volumeProfile(
  bars: readonly StudyBar[],
  rowCount: number,
  valueAreaShare = 0.7,
): VolumeProfile | null {
  const usable = bars.filter((bar) => (
    Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close)
    && Number.isFinite(bar.volume) && bar.volume > 0
  ));
  if (usable.length === 0 || rowCount < 1) return null;
  const low = Math.min(...usable.map((bar) => Math.min(bar.low, bar.close)));
  const high = Math.max(...usable.map((bar) => Math.max(bar.high, bar.close)));
  const count = high > low ? Math.floor(rowCount) : 1;
  const step = (high - low) / count;
  const volumes = new Array<number>(count).fill(0);
  const rowOf = (price: number) => step > 0 ? Math.min(count - 1, Math.max(0, Math.floor((price - low) / step))) : 0;

  for (const bar of usable) {
    const barLow = Math.max(low, Math.min(bar.low, bar.high));
    const barHigh = Math.min(high, Math.max(bar.low, bar.high));
    if (!(barHigh > barLow)) {
      volumes[rowOf(bar.close)]! += bar.volume;
      continue;
    }
    for (let row = rowOf(barLow); row <= rowOf(barHigh); row += 1) {
      const overlap = Math.min(low + (row + 1) * step, barHigh) - Math.max(low + row * step, barLow);
      if (overlap > 0) volumes[row]! += bar.volume * overlap / (barHigh - barLow);
    }
  }

  const totalVolume = volumes.reduce((sum, volume) => sum + volume, 0);
  let pocIndex = 0;
  volumes.forEach((volume, row) => {
    if (volume > volumes[pocIndex]!) pocIndex = row;
  });
  const target = totalVolume * Math.min(1, Math.max(0, valueAreaShare));
  let bottom = pocIndex;
  let top = pocIndex;
  let inside = volumes[pocIndex]!;
  // A small tolerance keeps rounding from adding a row past the target.
  while (inside < target - totalVolume * 1e-9 && (bottom > 0 || top < count - 1)) {
    const below = bottom > 0 ? volumes[bottom - 1]! : -1;
    const above = top < count - 1 ? volumes[top + 1]! : -1;
    if (above >= below) inside += volumes[++top]!;
    else inside += volumes[--bottom]!;
  }

  return {
    rows: volumes.map((volume, row) => ({
      low: low + row * step,
      high: row === count - 1 ? high : low + (row + 1) * step,
      volume,
      valueArea: row >= bottom && row <= top,
    })),
    pocIndex,
    poc: low + (pocIndex + 0.5) * step,
    maxVolume: volumes[pocIndex]!,
    totalVolume,
  };
}
