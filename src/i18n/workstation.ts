import { workstationDemand } from "./workstation-demand";
import { workstationMarket } from "./workstation-market";
import { workstationWeather } from "./workstation-weather";
import { workstationShell } from "./workstation-shell";

/** Market identifiers, units and original third-party notices retain their source text. */
export function workstationDictionary(language: "es" | "zh-CN"): Record<string, string> {
  const column = language === "es" ? 0 : 1;
  const copy: Record<string, readonly [string, string]> = { ...workstationMarket, ...workstationWeather, ...workstationShell, ...workstationDemand };
  return Object.fromEntries(Object.entries(copy).map(([key, values]) => [key, values[column]]));
}
