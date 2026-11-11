/**
 * Whole minutes, hours or days in an age, the one ladder every relative-time
 * label reads from. Null under a minute, which includes a time in the future.
 */
function elapsedUnits(ageMs: number): { count: number; unit: "m" | "h" | "d" } | null {
  if (!(ageMs >= 60_000)) return null;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return { count: minutes, unit: "m" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { count: hours, unit: "h" };
  return { count: Math.floor(hours / 24), unit: "d" };
}

/** Age of an epoch-ms timestamp: "just now", "5m ago", "3h ago", "2d ago"; `empty` when unset. */
export function formatRelativeAge(timestamp: number | undefined, now = Date.now(), empty = "never"): string {
  if (!timestamp) return empty;
  const elapsed = elapsedUnits(now - timestamp);
  return elapsed ? `${elapsed.count}${elapsed.unit} ago` : "just now";
}
