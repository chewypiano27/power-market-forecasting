import { csvFields } from "./csv";
import { fetchNemwebDispatch } from "./nemweb-dispatch";
import { httpFetch, type HttpFetchTransport } from "../../../utils/http-transport";
import { victorianCalendarAnnotation } from "./victoria-calendar";
import { hourlyWeatherScore, weatherRisk } from "./weather-risk";
import { dispatchTime } from "./analytics";
import type { TraderDay, VicMarketPoint, WeatherRiskHour } from "./model";

export const VIC_REGION_ID = "VIC1";
export const MELBOURNE_COORDINATES = { latitude: -37.8136, longitude: 144.9631 } as const;
export const AEMO_PRICE_DEMAND_COLUMNS = ["REGION", "SETTLEMENTDATE", "TOTALDEMAND", "RRP", "PERIODTYPE"] as const;

const AEMO_DASHBOARD_BASE = "https://visualisations.aemo.com.au/aemo/apps/api/report";
const AEMO_NEMWEB_NOTICE_DIRECTORY = "https://nemweb.com.au/Reports/CURRENT/Market_Notice/";
const BOM_MELBOURNE_PRECIS = "https://reg.bom.gov.au/fwo/IDV10753.xml";
const MONTHLY_REFERENCE_HIGH = [26.8, 26.8, 24.9, 21.4, 17.8, 15.2, 14.5, 15.7, 18.0, 20.1, 22.7, 24.7] as const;

export interface AemoPriceDemandRow {
  region: string;
  settlementDate: string;
  totalDemand: number;
  rrp: number;
  periodType: string;
}

export interface InterconnectorFlow {
  name: string;
  value: number;
  exportLimit: number;
  importLimit: number;
}

export interface RegionalMarketSnapshot {
  regionId: string;
  settlementDate: string;
  price: number;
  totalDemand: number;
  netInterchange: number | null;
  scheduledGeneration: number | null;
  semiScheduledGeneration: number | null;
  priceStatus: string;
  interconnectorFlows: InterconnectorFlow[];
  fcas: Record<string, number>;
}

export interface RegionalPricePoint {
  regionId: "VIC1" | "NSW1" | "SA1";
  timestamp: string;
  price: number;
  demand: number;
}

export interface PowerNewsItem {
  id: string;
  title: string;
  source: "AEMO Market Notice";
  publishedAt: string;
  category?: string;
  summary?: string;
  url?: string;
}

export interface MelbourneWeatherSummary {
  currentTemperature: number | null;
  currentHumidity: number | null;
  todayHigh: number;
  todayLow: number;
  todayDate: string;
}

export interface VicPowerSnapshot {
  market: VicMarketPoint[];
  regionalMarket: RegionalPricePoint[];
  calendar: TraderDay[];
  latest: AemoPriceDemandRow;
  regions: RegionalMarketSnapshot[];
  news: PowerNewsItem[];
  weather: MelbourneWeatherSummary;
  fetchedAt: string;
  aemoFile: string;
  weatherModel: string;
  marketWarnings?: string[];
}

function demoTimestamp(date: string, minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function createVicPowerDemoSnapshot(): VicPowerSnapshot {
  const date = "2026-02-12";
  const market = Array.from({ length: 169 }, (_, index): VicMarketPoint => {
    const minutes = 6 * 60 + index * 5;
    const hour = minutes / 60;
    const morning = Math.exp(-Math.pow((hour - 8.2) / 2.4, 2));
    const evening = Math.exp(-Math.pow((hour - 18.1) / 2.2, 2));
    const demand = 4_450 + 620 * morning + 2_150 * evening;
    const price = 38 + 28 * morning + 95 * evening + Math.max(0, demand - 5_850) * 0.24;
    return { hour: Math.floor(hour), timestamp: demoTimestamp(date, minutes), demand, price };
  });
  const latestPoint = market.at(-1)!;
  const regionalMarket = market.flatMap((point, index): RegionalPricePoint[] => {
    const hour = point.hour + (Number(point.timestamp?.slice(14, 16) ?? 0) / 60);
    const active = Math.exp(-Math.pow((hour - 10.5) / 1.8, 2)) + Math.exp(-Math.pow((hour - 15.2) / 2.2, 2));
    const stress = Math.exp(-Math.pow((hour - 18.0) / 1.2, 2));
    const nswSpread = 9 + 11 * Math.sin(index / 9) + 95 * stress - 7 * active;
    const saSpread = -7 + 14 * Math.cos(index / 11) - 42 * stress + 5 * active;
    return [
      { regionId: "VIC1", timestamp: point.timestamp!, price: point.price, demand: point.demand },
      { regionId: "NSW1", timestamp: point.timestamp!, price: point.price + nswSpread, demand: 8_700 + point.demand * 0.12 },
      { regionId: "SA1", timestamp: point.timestamp!, price: point.price + saSpread, demand: 1_350 + point.demand * 0.03 },
    ];
  });
  const highs = [41, 39, 33, 28, 35, 42, 37, 31, 27, 24, 30, 36, 40, 32, 26, 29];
  const calendar = highs.map((high, dayIndex): TraderDay => {
    const dayDate = new Date(2026, 1, 12 + dayIndex);
    const stamp = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
    const low = Math.max(16, high - 15);
    const deviation = high - MONTHLY_REFERENCE_HIGH[1];
    const hours = Array.from({ length: 24 }, (_, hour): WeatherRiskHour => ({
      time: `${stamp}T${String(hour).padStart(2, "0")}:00`,
      temperature: low + (high - low) * Math.max(0, Math.sin(Math.PI * (hour - 6) / 15)),
      humidity: 62 - Math.max(0, high - 26),
      cloudCover: 18,
      windSpeed: hour >= 15 && hour <= 20 ? 28 : 16,
      windSpeed100m: 35,
      solarRadiation: hour >= 7 && hour <= 18 ? 650 : 0,
      precipitation: 0,
      score: Math.round(Math.max(0, high - 28) * (hour >= 15 && hour <= 20 ? 4 : 1)),
    }));
    for (const hour of hours) hour.score = hourlyWeatherScore(hour);
    const risk = weatherRisk(hours, high, low, MONTHLY_REFERENCE_HIGH[1]);
    const { riskScore, volatility } = risk;
    return {
      date: stamp,
      day: dayDate.getDate(),
      high,
      low,
      deviation,
      volatility,
      riskScore,
      riskWindow: risk.window,
      drivers: risk.drivers,
      rawRiskScore: risk.rawScore,
      note: `Score ${riskScore} · ${risk.window}`,
      reasons: [
        `${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}°C against the February reference high`,
        `${high - low}° intraday range increases ramp risk`,
        `Peak weather-load window ${risk.window}`,
        ...(high >= 40 ? ["Extreme heat scenario for presentation-mode stress testing"] : []),
      ],
      hours,
    };
  });
  const fcas = { RAISEREGRRP: 18.4, LOWERREGRRP: 3.2 };
  const regions: RegionalMarketSnapshot[] = [
    { regionId: "VIC1", settlementDate: latestPoint.timestamp!, price: latestPoint.price, totalDemand: latestPoint.demand, netInterchange: -620, scheduledGeneration: 4_720, semiScheduledGeneration: 1_460, priceStatus: "FIRM", interconnectorFlows: [], fcas },
    { regionId: "NSW1", settlementDate: latestPoint.timestamp!, price: latestPoint.price + 118, totalDemand: 9_230, netInterchange: 310, scheduledGeneration: 8_500, semiScheduledGeneration: 2_100, priceStatus: "FIRM", interconnectorFlows: [], fcas: {} },
    { regionId: "SA1", settlementDate: latestPoint.timestamp!, price: latestPoint.price - 22, totalDemand: 1_540, netInterchange: 420, scheduledGeneration: 970, semiScheduledGeneration: 1_290, priceStatus: "FIRM", interconnectorFlows: [], fcas: {} },
    { regionId: "TAS1", settlementDate: latestPoint.timestamp!, price: latestPoint.price + 34, totalDemand: 1_180, netInterchange: -260, scheduledGeneration: 1_320, semiScheduledGeneration: 240, priceStatus: "FIRM", interconnectorFlows: [], fcas: {} },
    { regionId: "QLD1", settlementDate: latestPoint.timestamp!, price: latestPoint.price + 54, totalDemand: 8_940, netInterchange: -140, scheduledGeneration: 8_250, semiScheduledGeneration: 2_480, priceStatus: "FIRM", interconnectorFlows: [], fcas: {} },
  ];
  for (const region of regions) {
    const latest = regionalMarket.findLast((point) => point.regionId === region.regionId);
    if (latest) { region.price = latest.price; region.totalDemand = latest.demand; }
  }
  return {
    market,
    regionalMarket,
    calendar,
    latest: { region: "VIC1", settlementDate: latestPoint.timestamp!, totalDemand: latestPoint.demand, rrp: latestPoint.price, periodType: "ACTUAL" },
    regions,
    news: [
      { id: "demo:aemo", source: "AEMO Market Notice", publishedAt: `${date}T14:05:00`, category: "INTER-REGIONAL TRANSFER", title: "Presentation scenario: VIC–NSW transfer capability reduced", summary: "Bundled demo notice used to explain how a constraint can preserve a regional price separation." },
    ],
    weather: { currentTemperature: 37.4, currentHumidity: 31, todayHigh: 41, todayLow: 24, todayDate: date },
    fetchedAt: `${latestPoint.timestamp}+10:00`,
    aemoFile: "Bundled presentation snapshot",
    weatherModel: "Bundled deterministic demo",
  };
}


export function parseAemoPriceDemandCsv(csv: string, regionId = VIC_REGION_ID): AemoPriceDemandRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("AEMO returned an empty price and demand file.");
  const header = csvFields(lines[0]!).map((column) => column.toUpperCase());
  const missing = AEMO_PRICE_DEMAND_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`AEMO price and demand columns changed; missing ${missing.join(", ")}.`);
  const index = Object.fromEntries(header.map((column, position) => [column, position]));
  return lines.slice(1).flatMap((line) => {
    const fields = csvFields(line);
    const region = fields[index.REGION!] ?? "";
    const totalDemand = finiteInput(fields[index.TOTALDEMAND!]);
    const rrp = finiteInput(fields[index.RRP!]);
    if (region !== regionId || totalDemand === null || rrp === null) return [];
    return [{
      region,
      settlementDate: (fields[index.SETTLEMENTDATE!] ?? "").replaceAll("/", "-"),
      totalDemand,
      rrp,
      periodType: fields[index.PERIODTYPE!] ?? "",
    }];
  });
}

async function responseJson<T>(url: string, fetcher: HttpFetchTransport, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${new URL(url).hostname} data request failed (HTTP ${response.status}). Refresh to retry.`);
  return JSON.parse(body) as T;
}

interface AemoSummaryRow {
  SETTLEMENTDATE?: unknown;
  REGIONID?: unknown;
  PRICE?: unknown;
  PRICE_STATUS?: unknown;
  TOTALDEMAND?: unknown;
  NETINTERCHANGE?: unknown;
  SCHEDULEDGENERATION?: unknown;
  SEMISCHEDULEDGENERATION?: unknown;
  INTERCONNECTORFLOWS?: unknown;
}

interface AemoNoticeRow {
  NOTICEID?: unknown;
  EFFECTIVEDATE?: unknown;
  EXTERNALREFERENCE?: unknown;
  TYPEID?: unknown;
  REASON?: unknown;
}

interface AemoPriceRow extends Record<string, unknown> {
  REGIONID?: unknown;
  RRP?: unknown;
}

interface AemoSummaryPayload {
  ELEC_NEM_SUMMARY?: unknown;
  ELEC_NEM_SUMMARY_MARKET_NOTICE?: unknown;
  ELEC_NEM_SUMMARY_PRICES?: unknown;
}

interface AemoFiveMinuteRow {
  SETTLEMENTDATE?: unknown;
  REGIONID?: unknown;
  RRP?: unknown;
  TOTALDEMAND?: unknown;
  PERIODTYPE?: unknown;
}

interface AemoFiveMinutePayload {
  "5MIN"?: unknown;
}

function noticeField(body: string, field: string): string {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`^${escaped}\\s*:\\s*(.*?)\\s*$`, "im"))?.[1]?.trim() ?? "";
}

function normalizeAemoNoticeDate(value: string): string {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return value;
  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}T${hour!.padStart(2, "0")}:${minute}:${second}+10:00`;
}

function parseAemoMarketNotice(body: string, filename: string): PowerNewsItem | null {
  const noticeId = noticeField(body, "Notice ID") || filename.match(/\.R(\d+)$/i)?.[1] || "notice";
  const title = noticeField(body, "External Reference") || `AEMO market notice ${noticeId}`;
  const category = noticeField(body, "Notice Type Description") || "Market notice";
  const publishedAt = normalizeAemoNoticeDate(noticeField(body, "Creation Date"));
  const summary = body.match(/^Reason\s*:\s*([\s\S]*?)(?:^[-]{10,}\s*$|^END OF REPORT\s*$)/im)?.[1]
    ?.replace(/AEMO ELECTRICITY MARKET NOTICE\.?/gi, "")
    .replace(/Issued by Australian Electricity Market Operator Ltd at .*$/gim, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
  return { id: `aemo:${noticeId}`, title: title.replace(/\s+/g, " ").trim(), source: "AEMO Market Notice", publishedAt, category, summary: summary.slice(0, 700) };
}

async function fetchAemoNemwebNotices(fetcher: HttpFetchTransport): Promise<PowerNewsItem[]> {
  try {
    const response = await fetcher(AEMO_NEMWEB_NOTICE_DIRECTORY);
    if (!response.ok) return [];
    const listing = await response.text();
    const filenames = [...listing.matchAll(/href=["']([^"']+\.R\d+)["']/gi)]
      .map(match => decodeURIComponent(match[1]!).split("/").pop()!)
      .filter(name => /^NEMITWEB1_MKTNOTICE_\d{8}\.R\d+$/i.test(name))
      .sort((left, right) => Number(right.match(/\.R(\d+)$/i)?.[1]) - Number(left.match(/\.R(\d+)$/i)?.[1]))
      .slice(0, 12);
    const notices = await Promise.all(filenames.map(async filename => {
      try {
        const file = await fetcher(new URL(filename, AEMO_NEMWEB_NOTICE_DIRECTORY).toString());
        return file.ok ? parseAemoMarketNotice(await file.text(), filename) : null;
      } catch { return null; }
    }));
    return notices.filter((notice): notice is PowerNewsItem => notice !== null);
  } catch { return []; }
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteInput(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFlows(value: unknown): InterconnectorFlow[] {
  if (typeof value !== "string") return [];
  try {
    const rows = JSON.parse(value) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      name: String(row.name ?? ""),
      value: number(row.value),
      exportLimit: number(row.exportlimit),
      importLimit: number(row.importlimit),
    })).filter((row) => row.name);
  } catch {
    return [];
  }
}

async function fetchAemoLive(fetcher: HttpFetchTransport, now: Date): Promise<{
  regions: RegionalMarketSnapshot[];
  market: VicMarketPoint[];
  regionalMarket: RegionalPricePoint[];
  latest: AemoPriceDemandRow;
  notices: PowerNewsItem[];
  sourceUrl: string;
  warnings: string[];
}> {
  let summaryError: unknown;
  let sourceUrl = `${AEMO_DASHBOARD_BASE}/ELEC_NEM_SUMMARY`;
  const warnings: string[] = [];
  let [summary, fiveMinute] = await Promise.all([
    responseJson<AemoSummaryPayload>(sourceUrl, fetcher).catch(error => { summaryError = error; return {} as AemoSummaryPayload; }),
    responseJson<AemoFiveMinutePayload>(`${AEMO_DASHBOARD_BASE}/5MIN`, fetcher, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeScale: ["5MIN"] }),
    }).catch(() => ({ "5MIN": [] })),
  ]);
  const payloadRows = Array.isArray(summary?.ELEC_NEM_SUMMARY) ? summary.ELEC_NEM_SUMMARY as AemoSummaryRow[] : [];
  const payloadPrices = Array.isArray(summary?.ELEC_NEM_SUMMARY_PRICES) ? summary.ELEC_NEM_SUMMARY_PRICES as AemoPriceRow[] : [];
  const vicPrice = payloadPrices.find(row => row && row.REGIONID === VIC_REGION_ID)?.RRP;
  if (!summaryError && !payloadRows.some(row => row && row.REGIONID === VIC_REGION_ID
    && finiteInput(row.PRICE ?? vicPrice) !== null && finiteInput(row.TOTALDEMAND) !== null
    && Number.isFinite(dispatchTime(String(row.SETTLEMENTDATE ?? "")))
    && dispatchTime(String(row.SETTLEMENTDATE)) <= now.getTime() + 5 * 60_000)) {
    summaryError = new Error("AEMO live summary returned no valid VIC1 record.");
  }
  if (summaryError) {
    const published = (Array.isArray(fiveMinute?.["5MIN"]) ? fiveMinute["5MIN"] as AemoFiveMinuteRow[] : [])
      .filter(row => row && row.PERIODTYPE === "ACTUAL" && Number.isFinite(dispatchTime(String(row.SETTLEMENTDATE ?? "")))
        && dispatchTime(String(row.SETTLEMENTDATE)) <= now.getTime() && finiteInput(row.RRP) !== null && finiteInput(row.TOTALDEMAND) !== null);
    const latest = new Map<string, AemoFiveMinuteRow>();
    for (const row of published) {
      const region = String(row.REGIONID ?? "");
      const before = latest.get(region);
      if (!before || dispatchTime(String(row.SETTLEMENTDATE)) > dispatchTime(String(before.SETTLEMENTDATE))) latest.set(region, row);
    }
    if (!latest.has(VIC_REGION_ID)) {
      try {
        const dispatch = await fetchNemwebDispatch(fetcher, now);
        return { ...dispatch, notices: await fetchAemoNemwebNotices(fetcher),
          warnings: ["AEMO dashboard unavailable. Using published five-minute dispatch reports from NEMWeb."] };
      } catch { return fetchAemoPublishedFiles(fetcher, now, summaryError); }
    }
    fiveMinute = { "5MIN": published };
    summary = { ELEC_NEM_SUMMARY: [...latest.values()].map(row => ({ ...row, PRICE: row.RRP, PRICE_STATUS: "ACTUAL" })) };
    sourceUrl = `${AEMO_DASHBOARD_BASE}/5MIN`;
    warnings.push("AEMO summary unavailable. Using published dispatch observations; notices and interchange are unavailable.");
  }
  const priceRows = Array.isArray(summary.ELEC_NEM_SUMMARY_PRICES)
    ? summary.ELEC_NEM_SUMMARY_PRICES as AemoPriceRow[]
    : [];
  const fcasByRegion = new Map(priceRows.filter(row => row && typeof row === "object").map((row) => [String(row.REGIONID ?? ""), row]));
  const summaryRows = Array.isArray(summary.ELEC_NEM_SUMMARY) ? summary.ELEC_NEM_SUMMARY as AemoSummaryRow[] : [];
  const regions = summaryRows.flatMap((row): RegionalMarketSnapshot[] => {
    if (!row || typeof row !== "object") return [];
    const regionId = String(row.REGIONID ?? "");
    if (!regionId) return [];
    const prices = fcasByRegion.get(regionId) ?? {};
    const price = finiteInput(row.PRICE ?? prices.RRP);
    const totalDemand = finiteInput(row.TOTALDEMAND);
    const settlementDate = String(row.SETTLEMENTDATE ?? "");
    if (price === null || totalDemand === null || (!Number.isFinite(dispatchTime(settlementDate)) || dispatchTime(settlementDate) > now.getTime() + 5 * 60_000)) return [];
    const fcas = Object.fromEntries(Object.entries(prices)
      .filter(([key, value]) => key.endsWith("RRP") && key !== "RRP" && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Number(value)]));
    return [{
      regionId,
      settlementDate,
      price,
      totalDemand,
      netInterchange: finiteInput(row.NETINTERCHANGE),
      scheduledGeneration: finiteInput(row.SCHEDULEDGENERATION),
      semiScheduledGeneration: finiteInput(row.SEMISCHEDULEDGENERATION),
      priceStatus: String(row.PRICE_STATUS ?? ""),
      interconnectorFlows: parseFlows(row.INTERCONNECTORFLOWS),
      fcas,
    }];
  });
  const vic = regions.find((row) => row.regionId === VIC_REGION_ID);
  if (!vic) throw new Error("AEMO live summary returned no VIC1 record.");
  const fiveMinuteRows = Array.isArray(fiveMinute?.["5MIN"]) ? fiveMinute["5MIN"] as AemoFiveMinuteRow[] : [];
  const regionalMarket = fiveMinuteRows.flatMap((row): RegionalPricePoint[] => {
    if (!row || typeof row !== "object") return [];
    const regionId = String(row.REGIONID ?? "");
    if (!["VIC1", "NSW1", "SA1"].includes(regionId) || row.PERIODTYPE !== "ACTUAL") return [];
    const price = finiteInput(row.RRP);
    const demand = finiteInput(row.TOTALDEMAND);
    const timestamp = String(row.SETTLEMENTDATE ?? "");
    if (!Number.isFinite(dispatchTime(timestamp)) || dispatchTime(timestamp) > now.getTime() + 5 * 60_000 || price === null || demand === null) return [];
    return [{ regionId: regionId as RegionalPricePoint["regionId"], timestamp, price, demand }];
  }).sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.regionId.localeCompare(right.regionId));
  // The summary and rolling-history endpoints can publish at different times.
  // Upsert current summary observations so the chart, headline and footer agree.
  for (const region of regions.filter((row) => ["VIC1", "NSW1", "SA1"].includes(row.regionId))) {
    const existing = regionalMarket.findIndex((row) => row.regionId === region.regionId && dispatchTime(row.timestamp) === dispatchTime(region.settlementDate));
    const point: RegionalPricePoint = { regionId: region.regionId as RegionalPricePoint["regionId"], timestamp: region.settlementDate, price: region.price, demand: region.totalDemand };
    if (existing >= 0) regionalMarket[existing] = point;
    else regionalMarket.push(point);
  }
  regionalMarket.sort((left, right) => dispatchTime(left.timestamp) - dispatchTime(right.timestamp) || left.regionId.localeCompare(right.regionId));
  const market = regionalMarket.flatMap((row): VicMarketPoint[] => row.regionId === VIC_REGION_ID && dispatchTime(row.timestamp) <= dispatchTime(vic.settlementDate) ? [{
    hour: Number(row.timestamp.slice(11, 13)),
    timestamp: row.timestamp,
    price: row.price,
    demand: row.demand,
  }] : []);
  const latest: AemoPriceDemandRow = {
    region: VIC_REGION_ID,
    settlementDate: vic.settlementDate,
    totalDemand: vic.totalDemand,
    rrp: vic.price,
    periodType: "ACTUAL",
  };
  const noticesRaw = Array.isArray(summary.ELEC_NEM_SUMMARY_MARKET_NOTICE)
    ? summary.ELEC_NEM_SUMMARY_MARKET_NOTICE as AemoNoticeRow[]
    : [];
  const notices = noticesRaw.map((notice): PowerNewsItem => ({
    id: `aemo:${String(notice.NOTICEID ?? notice.EFFECTIVEDATE ?? "notice")}`,
    title: String(notice.EXTERNALREFERENCE ?? "AEMO market notice").replace(/\s+/g, " ").trim(),
    source: "AEMO Market Notice",
    publishedAt: String(notice.EFFECTIVEDATE ?? ""),
    category: String(notice.TYPEID ?? "Market notice"),
    summary: String(notice.REASON ?? "").replace(/AEMO ELECTRICITY MARKET NOTICE\.?/gi, "").replace(/\s+/g, " ").trim(),
  }));
  return { regions, market, regionalMarket, latest, notices, sourceUrl, warnings };
}

/** Public files are an independent source; their original timestamps determine freshness. */
async function fetchAemoPublishedFiles(fetcher: HttpFetchTransport, now: Date, primaryError: unknown) {
  const nemDay = new Date(now.getTime() + 10 * 3_600_000).toISOString().slice(0, 10);
  const previousDay = new Date(now.getTime() - 2 * 86_400_000 + 10 * 3_600_000).toISOString().slice(0, 10);
  const months = [...new Set([nemDay.slice(0, 7), previousDay.slice(0, 7)])].sort();
  const [points, notices] = await Promise.all([
    Promise.all((["VIC1", "NSW1", "SA1"] as const).map(async regionId => {
    const rows = (await Promise.all(months.map(async month => {
      const url = `https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${month.replace("-", "")}_${regionId}.csv`;
      try {
        const response = await fetcher(url);
        if (!response.ok) return [];
        return parseAemoPriceDemandCsv(await response.text(), regionId);
      } catch { return []; }
    }))).flat();
    return rows.flatMap((row): RegionalPricePoint[] => {
      const time = dispatchTime(row.settlementDate);
      return row.periodType === "TRADE" && Number.isFinite(time) && time <= now.getTime() && time >= now.getTime() - 2 * 86_400_000
        ? [{regionId,timestamp:row.settlementDate.replace(" ","T"),price:row.rrp,demand:row.totalDemand}] : [];
    });
    })),
    fetchAemoNemwebNotices(fetcher),
  ]);
  const regionalMarket = [...new Map(points.flat().map(row => [`${row.regionId}:${row.timestamp}`, row])).values()]
    .sort((a,b) => dispatchTime(a.timestamp)-dispatchTime(b.timestamp) || a.regionId.localeCompare(b.regionId));
  const regions: RegionalMarketSnapshot[] = ["VIC1", "NSW1", "SA1"].flatMap(regionId => {
    const row = regionalMarket.findLast(point => point.regionId === regionId);
    return row ? [{regionId,settlementDate:row.timestamp,price:row.price,totalDemand:row.demand,netInterchange:null,
      scheduledGeneration:null,semiScheduledGeneration:null,priceStatus:"TRADE",interconnectorFlows:[],fcas:{}}] : [];
  });
  const vic = regions.find(row => row.regionId === VIC_REGION_ID);
  if (!vic) throw primaryError;
  const market: VicMarketPoint[] = regionalMarket.filter(row => row.regionId === VIC_REGION_ID).map(row => ({hour:Number(row.timestamp.slice(11,13)),timestamp:row.timestamp,price:row.price,demand:row.demand}));
  return {regions,market,regionalMarket,latest:{region:VIC_REGION_ID,settlementDate:vic.settlementDate,totalDemand:vic.totalDemand,rrp:vic.price,periodType:"TRADE"},
    notices,sourceUrl:`https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${nemDay.slice(0,7).replace("-", "")}_VIC1.csv`,
    warnings:[`AEMO live feeds unavailable. Using published price and demand files; interchange is unavailable.${notices.length ? " Market notices are loaded from NEMWeb." : " Market notices are unavailable."}`]};
}

interface OpenMeteoHourly {
  time?: unknown;
  temperature_2m?: unknown;
  relative_humidity_2m?: unknown;
  cloud_cover?: unknown;
  wind_speed_10m?: unknown;
  wind_speed_100m?: unknown;
  shortwave_radiation?: unknown;
  precipitation?: unknown;
}

interface OpenMeteoCurrent {
  temperature_2m?: unknown;
  relative_humidity_2m?: unknown;
}

interface OpenMeteoForecast {
  hourly?: OpenMeteoHourly;
  current?: OpenMeteoCurrent;
}

interface BomDailyRange {
  date: string;
  high?: number;
  low?: number;
}

function xmlAttribute(attributes: string, name: string): string {
  return new RegExp(`${name}=["']([^"']+)["']`, "i").exec(attributes)?.[1] ?? "";
}

function xmlElementNumber(body: string, type: string): number | undefined {
  const match = new RegExp(`<element\\b[^>]*type=["']${type}["'][^>]*>([^<]+)<\\/element>`, "i").exec(body);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

async function fetchBomMelbourneRanges(fetcher: HttpFetchTransport): Promise<BomDailyRange[]> {
  const response = await fetcher(BOM_MELBOURNE_PRECIS, { headers: { Accept: "application/xml,text/xml" } });
  const xml = await response.text();
  if (!response.ok) throw new Error(`BOM précis failed (${response.status}).`);
  const area = /<area\b[^>]*aac=["']VIC_PT042["'][^>]*>([\s\S]*?)<\/area>/i.exec(xml)?.[1];
  if (!area) throw new Error("BOM précis did not include Melbourne (VIC_PT042).");
  return [...area.matchAll(/<forecast-period\b([^>]*)>([\s\S]*?)<\/forecast-period>/gi)].flatMap((match) => {
    const date = xmlAttribute(match[1] ?? "", "start-time-local").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [{
      date,
      high: xmlElementNumber(match[2] ?? "", "air_temperature_maximum"),
      low: xmlElementNumber(match[2] ?? "", "air_temperature_minimum"),
    }];
  });
}

function weatherForecastUrl(): string {
  const query = new URLSearchParams({
    latitude: String(MELBOURNE_COORDINATES.latitude),
    longitude: String(MELBOURNE_COORDINATES.longitude),
    timezone: "Australia/Melbourne",
    forecast_days: "16",
    current: "temperature_2m,relative_humidity_2m",
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "cloud_cover",
      "wind_speed_10m",
      "wind_speed_100m",
      "shortwave_radiation",
      "precipitation",
    ].join(","),
  });
  return `https://api.open-meteo.com/v1/forecast?${query}`;
}

function dayAheadWeatherUrl(): string {
  const query = new URLSearchParams({
    latitude: String(MELBOURNE_COORDINATES.latitude),
    longitude: String(MELBOURNE_COORDINATES.longitude),
    timezone: "Australia/Melbourne",
    forecast_days: "1",
    hourly: "temperature_2m_previous_day1",
  });
  return `https://previous-runs-api.open-meteo.com/v1/forecast?${query}`;
}

async function fetchDayAheadTodayRange(fetcher: HttpFetchTransport): Promise<BomDailyRange | null> {
  const payload = await responseJson<{ hourly?: { time?: unknown; temperature_2m_previous_day1?: unknown } }>(dayAheadWeatherUrl(), fetcher);
  const times = Array.isArray(payload.hourly?.time) ? payload.hourly.time : [];
  const temperatures = Array.isArray(payload.hourly?.temperature_2m_previous_day1) ? payload.hourly.temperature_2m_previous_day1 : [];
  const rows = times.flatMap((time, index) => {
    const temperature = finiteInput(temperatures[index]);
    return typeof time === "string" && temperature !== null ? [{ time, temperature }] : [];
  });
  if (!rows.length) return null;
  return {
    date: rows[0]!.time.slice(0, 10),
    high: Math.round(Math.max(...rows.map((row) => row.temperature))),
    low: Math.round(Math.min(...rows.map((row) => row.temperature))),
  };
}

function values(payload: OpenMeteoHourly, key: keyof OpenMeteoHourly): unknown[] {
  const candidate = payload[key];
  return Array.isArray(candidate) ? candidate : [];
}

async function fetchWeatherCalendar(fetcher: HttpFetchTransport): Promise<{
  days: TraderDay[];
  model: string;
  summary: MelbourneWeatherSummary;
}> {
  const [parsed, bomRanges, dayAheadToday] = await Promise.all([
    responseJson<OpenMeteoForecast>(weatherForecastUrl(), fetcher),
    fetchBomMelbourneRanges(fetcher).catch(() => []),
    fetchDayAheadTodayRange(fetcher).catch(() => null),
  ]);
  const hourly = parsed.hourly ?? {};
  const times = values(hourly, "time");
  const temperatures = values(hourly, "temperature_2m");
  const humidity = values(hourly, "relative_humidity_2m");
  const cloud = values(hourly, "cloud_cover");
  const wind = values(hourly, "wind_speed_10m");
  const wind100 = values(hourly, "wind_speed_100m");
  const solar = values(hourly, "shortwave_radiation");
  const precipitation = values(hourly, "precipitation");
  const groups = new Map<string, WeatherRiskHour[]>();
  times.forEach((rawTime, index) => {
    if (typeof rawTime !== "string") return;
    const temperature = finiteInput(temperatures[index]);
    if (temperature === null || !Number.isFinite(Date.parse(`${rawTime}Z`))) return;
    const hourHumidity = number(humidity[index]);
    const hourWind = number(wind[index]);
    const hourCloud = number(cloud[index]);
    const hourPrecipitation = number(precipitation[index]);
    const row: WeatherRiskHour = {
      time: rawTime,
      temperature,
      humidity: hourHumidity,
      cloudCover: hourCloud,
      windSpeed: hourWind,
      windSpeed100m: number(wind100[index]),
      solarRadiation: number(solar[index]),
      precipitation: hourPrecipitation,
      score: 0,
    };
    row.score = hourlyWeatherScore(row);
    const date = rawTime.slice(0, 10);
    groups.set(date, [...groups.get(date) ?? [], row]);
  });
  const openMeteoDays = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, hours]) => {
    const temperaturesForDay = hours.map((hour) => hour.temperature);
    const high = Math.round(Math.max(...temperaturesForDay));
    const low = Math.round(Math.min(...temperaturesForDay));
    const month = Number(date.slice(5, 7));
    const normalHigh = MONTHLY_REFERENCE_HIGH[month - 1] ?? 24;
    const deviation = high - normalHigh;
    const dailyRange = high - low;
    const risk = weatherRisk(hours, high, low, normalHigh);
    const { maxWind, rain, maxRamp, riskScore, volatility } = risk;
    const window = { label: risk.window };
    const calendar = victorianCalendarAnnotation(date);
    const reasons = [
      `${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}°C against the ${new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", { month: "long" })} reference high`,
      `${dailyRange.toFixed(0)}° intraday range; steepest hourly ramp ${maxRamp.toFixed(1)}°`,
      `Peak weather-load window ${window.label}`,
      ...(maxWind >= 30 ? [`Hourly wind reaches ${Math.round(maxWind)} km/h`] : []),
      ...(rain >= 5 ? [`${rain.toFixed(1)} mm forecast precipitation`] : []),
      ...(calendar.label ? [calendar.label] : []),
    ];
    const note = volatility === "high"
      ? `Score ${riskScore} · ${window.label}`
      : volatility === "amber" ? `Score ${riskScore} · watch ${window.label}` : `Score ${riskScore} · stable`;
    return {
      date,
      day: Number(date.slice(8, 10)),
      high,
      low,
      deviation,
      volatility,
      note,
      riskScore,
      riskWindow: window.label,
      drivers: risk.drivers,
      rawRiskScore: risk.rawScore,
      reasons,
      hours,
    };
  });
  const bomByDate = new Map(bomRanges.map((range) => [range.date, range]));
  if (dayAheadToday) bomByDate.set(dayAheadToday.date, dayAheadToday);
  const days = openMeteoDays.map((day) => {
    const bom = day.date ? bomByDate.get(day.date) : undefined;
    if (!bom || (bom.high === undefined && bom.low === undefined)) return day;
    const high = bom.high ?? day.high;
    const low = bom.low ?? day.low;
    const month = day.date ? Number(day.date.slice(5, 7)) : 10;
    const deviation = high - (MONTHLY_REFERENCE_HIGH[month - 1] ?? 24);
    const risk = weatherRisk(day.hours, high, low, MONTHLY_REFERENCE_HIGH[month - 1] ?? 24);
    const { riskScore, volatility } = risk;
    const reasons = [...day.reasons ?? []];
    const rangeSource = dayAheadToday?.date === day.date ? "day-ahead forecast issued yesterday" : "BOM précis";
    reasons[0] = `${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}°C against the ${new Date(`${day.date}T12:00:00`).toLocaleDateString("en-AU", { month: "long" })} reference high (${rangeSource})`;
    const note = volatility === "high"
      ? `Score ${riskScore} · ${day.riskWindow ?? "elevated"}`
      : volatility === "amber" ? `Score ${riskScore} · watch ${day.riskWindow ?? "intraday"}` : `Score ${riskScore} · stable`;
    reasons[1] = `${high - low}° intraday range; steepest hourly ramp ${risk.maxRamp.toFixed(1)}°`;
    return { ...day, high, low, deviation, riskScore, volatility, drivers: risk.drivers, rawRiskScore: risk.rawScore, reasons, note };
  });
  if (!days.length) throw new Error("Open-Meteo returned no hourly Melbourne forecast.");
  const today = days[0]!;
  return {
    days,
    model: dayAheadToday ? "Day-ahead reference + BOM précis + Open-Meteo hourly" : bomRanges.length ? "BOM précis + Open-Meteo hourly" : "Open-Meteo Best Match",
    summary: {
      currentTemperature: finiteInput(parsed.current?.temperature_2m),
      currentHumidity: finiteInput(parsed.current?.relative_humidity_2m),
      todayHigh: today.high,
      todayLow: today.low,
      todayDate: today.date ?? "",
    },
  };
}

export async function fetchVicPowerSnapshot(options: {
  fetcher?: HttpFetchTransport;
  now?: Date;
  requestTimeoutMs?: number;
} = {}): Promise<VicPowerSnapshot> {
  const transport = options.fetcher ?? httpFetch;
  const timeoutMs = options.requestTimeoutMs ?? 20_000;
  const fetcher: HttpFetchTransport = async (url, init) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        transport(url, { ...init, signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`${new URL(url).hostname} did not respond within ${timeoutMs / 1000}s. Check your connection and refresh.`));
            controller.abort();
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const [aemo, weather] = await Promise.all([
    fetchAemoLive(fetcher, options.now ?? new Date()),
    fetchWeatherCalendar(fetcher),
  ]);
  return {
    market: aemo.market,
    regionalMarket: aemo.regionalMarket,
    calendar: weather.days,
    latest: aemo.latest,
    regions: aemo.regions,
    news: aemo.notices.slice(0, 8),
    weather: weather.summary,
    fetchedAt: new Date().toISOString(),
    aemoFile: aemo.sourceUrl,
    marketWarnings: aemo.warnings,
    weatherModel: weather.model,
  };
}
