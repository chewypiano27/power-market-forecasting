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
