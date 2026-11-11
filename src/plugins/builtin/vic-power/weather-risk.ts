import type { WeatherRiskHour, Volatility } from "./model";

export interface RiskDriver { id: string; label: string; points: number }

export function riskRating(score: number): Volatility {
  return score >= 60 ? "high" : score >= 30 ? "amber" : "low";
}

/** Transparent screening weights, not fitted probabilities or a volatility forecast. */
export function hourlyWeatherScore(hour: Omit<WeatherRiskHour, "score">): number {
  const clockHour = Number(hour.time.slice(11, 13));
  return Math.round(Math.max(0, hour.temperature - 24) * 7
    + Math.max(0, 12 - hour.temperature) * 5
    + Math.max(0, hour.humidity - 75) * 0.35
    + Math.max(0, hour.windSpeed - 30) * 0.35
    + Math.min(10, hour.precipitation * 2)
    + (clockHour >= 16 && clockHour <= 20 ? 8 : 0));
}

export function weatherRisk(hours: readonly WeatherRiskHour[], high: number, low: number, normalHigh: number) {
  let windowHours: WeatherRiskHour[] = [];
  let windowScore = 0;
  for (let index = 0; index <= hours.length - 3; index += 1) {
    const candidate = hours.slice(index, index + 3);
    if (candidate.some((hour, offset) => offset > 0 && Date.parse(`${hour.time}Z`) - Date.parse(`${candidate[offset - 1]!.time}Z`) !== 3_600_000)) continue;
    const score = candidate.reduce((sum, hour) => sum + hour.score, 0) / 3;
    if (!windowHours.length || score > windowScore) { windowHours = candidate; windowScore = score; }
  }
  const first = windowHours[0];
  const last = windowHours.at(-1);
  const window = first && last ? `${first.time.slice(11, 16)}–${String((Number(last.time.slice(11, 13)) + 1) % 24).padStart(2, "0")}:00` : "—";
  const maxWind = Math.max(0, ...hours.map((hour) => hour.windSpeed));
  const maxHumidity = Math.max(0, ...hours.map((hour) => hour.humidity));
  const rain = hours.reduce((sum, hour) => sum + hour.precipitation, 0);
  const maxRamp = hours.slice(1).reduce((maximum, hour, index) => (
    Date.parse(`${hour.time}Z`) - Date.parse(`${hours[index]!.time}Z`) === 3_600_000
      ? Math.max(maximum, Math.abs(hour.temperature - hours[index]!.temperature)) : maximum
  ), 0);
  const drivers: RiskDriver[] = [
    { id: "deviation", label: "Temperature anomaly", points: Math.abs(high - normalHigh) * 8 },
    { id: "range", label: "Daily temperature range", points: Math.max(0, high - low - 8) * 2.5 },
    { id: "wind", label: "Wind", points: Math.max(0, maxWind - 25) * 0.7 },
    { id: "humidity", label: "Humidity", points: Math.max(0, maxHumidity - 80) * 0.3 },
    { id: "rain", label: "Precipitation", points: Math.min(12, rain * 1.5) },
    { id: "ramp", label: "Hourly temperature ramp", points: Math.max(0, maxRamp - 2) * 4 },
    { id: "window", label: "Peak three-hour weather load", points: windowScore * 0.35 },
  ];
  const rawScore = drivers.reduce((sum, driver) => sum + driver.points, 0);
  const riskScore = Math.min(100, Math.round(rawScore));
  return { drivers, rawScore, riskScore, volatility: riskRating(riskScore), window, maxWind, maxHumidity, rain, maxRamp };
}
