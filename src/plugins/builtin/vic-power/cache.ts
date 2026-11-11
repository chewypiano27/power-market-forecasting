import { createPluginCache } from "../../../data/plugin-cache";
import { fetchVicPowerSnapshot, type VicPowerSnapshot } from "./data";

const cache = createPluginCache<VicPowerSnapshot>({
  kind: "vic-power-market-weather",
  source: "aemo-open-meteo",
  schemaVersion: 6,
  policy: { staleMs: 5 * 60 * 1000, expireMs: 7 * 24 * 60 * 60 * 1000 },
});

export const attachVicPowerPersistence = cache.attach;
export const resetVicPowerPersistence = cache.reset;

export function getCachedVicPowerSnapshot() {
  return cache.get("vic1", { allowExpired: true });
}

export async function loadVicPowerSnapshot(force = false): Promise<VicPowerSnapshot> {
  return (await cache.load("vic1", fetchVicPowerSnapshot, { force })).data;
}
