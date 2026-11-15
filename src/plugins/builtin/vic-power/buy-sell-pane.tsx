import { useCallback } from "react";
import { CompositeChart, PaneStatusBody, StatGrid, scalarPoint, staticSeries, type StatItem } from "../../../components";
import { useAsyncResource, useAutoRefresh } from "../../../public/react";
import { httpFetch } from "../../../utils/http-transport";
import type { PaneProps } from "../../../types/plugin";
import { Box, Text } from "../../../ui";
import { useThemeColors } from "../../../theme/theme-context";
import { t } from "../../../i18n";
import { parseAemoPriceDemandCsv } from "./data";
import { decideBuySell, type BuySellHourlyPrice } from "./buy-sell-model";
import { victorianCalendarAnnotation } from "./victoria-calendar";
import { chartDate, NEM_TIME_ZONE } from "./analytics";

function nemDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function previousMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

function hourHistory(rows: ReturnType<typeof parseAemoPriceDemandCsv>): BuySellHourlyPrice[] {
  const groups = new Map<string, { demand: number; price: number; count: number }>();
  for (const row of rows) {
    if (row.periodType.toUpperCase() !== "TRADE") continue;
    const match = row.settlementDate.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) continue;
    const [, year, month, day, hour, minute] = match;
    const intervalEnd = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    const bucket = new Date(Math.floor((intervalEnd - 300_000) / 3_600_000) * 3_600_000);
    const time = `${bucket.getUTCFullYear()}-${String(bucket.getUTCMonth() + 1).padStart(2, "0")}-${String(bucket.getUTCDate()).padStart(2, "0")}T${String(bucket.getUTCHours()).padStart(2, "0")}:00:00`;
    const group = groups.get(time) ?? { demand: 0, price: 0, count: 0 };
    group.demand += row.totalDemand;
    group.price += row.rrp;
    group.count += 1;
    groups.set(time, group);
  }
  return [...groups].filter(([, value]) => value.count === 12).map(([time, value]) => ({
    time, demand: value.demand / value.count, price: value.price / value.count,
  })).sort((a, b) => a.time.localeCompare(b.time));
}

async function loadDecision() {
  const now = new Date();
  const nemNow = new Date(`${nemDate(now)}T12:00:00Z`);
  const months = [previousMonth(nemNow), new Date(Date.UTC(nemNow.getUTCFullYear(), nemNow.getUTCMonth(), 1))];
  const rows = (await Promise.all(months.map(async (month) => {
    const key = `${month.getUTCFullYear()}${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
    const response = await httpFetch(`https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${key}_VIC1.csv`);
    if (!response.ok) throw new Error(`AEMO price and demand data request failed (HTTP ${response.status}).`);
    return parseAemoPriceDemandCsv(await response.text());
  }))).flat();
  const history = hourHistory(rows).filter((row) => Date.parse(`${row.time}+10:00`) <= now.getTime());
  if (history.length < 168) throw new Error("Eight complete days of hourly VIC price and demand history are not available yet.");
  const last = history.at(-1)!;
  const target = new Date(Date.parse(`${last.time}Z`) + 3_600_000);
  const targetHour = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}T${String(target.getUTCHours()).padStart(2, "0")}:00:00`;
  const holiday = victorianCalendarAnnotation(targetHour.slice(0, 10));
  return { decision: decideBuySell(history.slice(-168), targetHour, holiday), observations: history.length,
    recent: history.slice(-24) };
}

export function BuySellPane({ width, height }: PaneProps) {
  const colors = useThemeColors();
  const loader = useCallback(() => loadDecision(), []);
  const resource = useAsyncResource(loader);
  useAutoRefresh(resource.updatedAt, resource.load, { intervalMs: 5 * 60 * 1000 });
  const result = resource.data?.decision;
  if (!result || result.status !== "ready") return <PaneStatusBody loading={resource.loading} error={resource.error}
    empty subject="VIC1 buy or sell signal" emptyTitle="No paper-trade signal is available."
    retry={{ onRetry: resource.reload, label: "Refresh", pending: resource.loading }} width={width} height={height} />;
  const actionColor = result.action === "BUY" ? colors.positive : result.action === "SELL" ? colors.negative : colors.textDim;
  const stats: StatItem[] = [
    { label: "Paper decision", value: result.action, color: actionColor },
    { label: "Expected move", value: `${result.expectedMove >= 0 ? "+" : "−"}$${Math.abs(result.expectedMove).toFixed(2)}/MWh`, tone: result.expectedMove >= 0 ? "positive" : "negative" },
    { label: "Last completed hour", value: `$${result.entryMwHPrice.toFixed(2)}/MWh` },
    { label: "One-hour estimate", value: `$${result.forecastPrice.toFixed(2)}/MWh` },
  ];
  const recent = resource.data?.recent ?? [];
  const chartSeries = [
    { ...staticSeries(recent.map((row) => scalarPoint(chartDate(row.time), row.price)), {
      id: "vic1-hourly-rrp", label: "VIC1 hourly RRP", color: colors.warning, calendarSpaced: true,
    }), panelId: "price", unit: "$/MWh", unitGroup: "power-price" },
    { ...staticSeries([scalarPoint(chartDate(result.targetHour), result.forecastPrice)], {
      id: "vic1-price-estimate", label: "One-hour estimate", color: actionColor, style: "points", calendarSpaced: true,
    }), panelId: "price", unit: "$/MWh", unitGroup: "power-price" },
  ];
  const chartHeight = Math.max(8, Math.floor(height * 0.55));
  return <Box width={width} height={height} flexDirection="column">
    <StatGrid items={stats} width={width} />
    <CompositeChart series={chartSeries} panels={[{ id: "price", label: "VIC1 RRP $/MWh" }]} width={width}
      height={chartHeight} focused={false} navigable={false} showLegend showTimeAxis timeZone={NEM_TIME_ZONE}
      formatValue={(value) => `$${value.toFixed(2)}`} />
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text fg={colors.text}>{t("One-hour, 1 MWh paper-trade estimate · VIC1")}</Text>
      <Text fg={colors.textDim}>{t("BUY above +$5/MWh · SELL below −$5/MWh · otherwise HOLD")}</Text>
      <Text fg={colors.textDim}>{t("Ridge regression estimates the next price move from recent VIC price and demand, hour, weekday and holiday features.")}</Text>
      <Text fg={colors.textDim}>{t("Nov 1–15 follow-on check: 96 of 143 calls matched direction (67%); signal active for 40% of hours. Gross simulated result: A$1,384 before costs.")}</Text>
      <Text fg={colors.textDim}>{t("Model fit through Oct 31, 2026. Follow-on period: Nov 1–15, 2026.")}</Text>
      <Text fg={colors.warning}>{t("Exploratory result; model choice followed earlier period checks. No transaction costs, network limits or asset constraints included. No orders are placed.")}</Text>
      <Text fg={colors.textDim}>{t("Uses {count} complete hourly observations · no signal history is saved.").replace("{count}", String(resource.data?.observations ?? 0))}</Text>
    </Box>
  </Box>;
}
