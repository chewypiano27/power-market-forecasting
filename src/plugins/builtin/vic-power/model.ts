export interface VicMarketPoint {
  hour: number;
  timestamp?: string;
  demand: number;
  price: number;
}

export type Volatility = "low" | "amber" | "high";

export interface WeatherRiskHour {
  time: string;
  temperature: number;
  humidity: number;
  cloudCover: number;
  windSpeed: number;
  windSpeed100m: number;
  solarRadiation: number;
  precipitation: number;
  score: number;
}

export interface TraderDay {
  date?: string;
  day: number;
  high: number;
  low: number;
  deviation: number;
  volatility: Volatility;
  note: string;
  riskScore?: number;
  riskWindow?: string;
  reasons?: string[];
  hours?: WeatherRiskHour[];
  drivers?: import("./weather-risk").RiskDriver[];
  rawRiskScore?: number;
}

export function vicMarketPoints(
  temperatureDelta: number,
  baseline: readonly VicMarketPoint[],
): VicMarketPoint[] {
  return baseline.map((point) => {
    const minute = point.timestamp ? Number(point.timestamp.slice(14, 16)) / 60 : 0;
    const heat = Math.exp(-Math.pow((point.hour + minute - 17) / 4.2, 2));
    const demand = point.demand + temperatureDelta * 84 * heat;
    const scarcityDelta = Math.max(0, demand - 4_850) - Math.max(0, point.demand - 4_850);
    const price = point.price + scarcityDelta * 0.10
      + Math.max(temperatureDelta, 0) * 7.5 * heat + Math.min(temperatureDelta, 0) * 2.3 * heat;
    return { ...point, demand, price };
  });
}
