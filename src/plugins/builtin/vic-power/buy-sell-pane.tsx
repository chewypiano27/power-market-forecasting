import { useCallback, useMemo } from "react";
import { Badge, CompositeChart, PaneStatusBody, StatGrid, scalarPoint, staticSeries, statGridRows, usePaneTabs, type StatItem } from "../../../components";
import { useAsyncResource, useAutoRefresh, usePluginPaneState } from "../../../public/react";
import { httpFetch } from "../../../utils/http-transport";
import type { PaneProps } from "../../../types/plugin";
import { Box, Text } from "../../../ui";
import { useThemeColors } from "../../../theme/theme-context";
import { t } from "../../../i18n";
import { parseAemoPriceDemandCsv } from "./data";
import { decideBuySell, type BuySellHourlyPrice } from "./buy-sell-model";
import { victorianCalendarAnnotation } from "./victoria-calendar";
import { chartDate, NEM_TIME_ZONE } from "./analytics";
import { FILL_REST } from "../../../components/ui/fill";

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

function evaluateFollowOn(history: readonly BuySellHourlyPrice[]) {
  const from = "2026-11-01T00:00:00";
  const through = "2026-11-16T00:00:00";
  const days = new Map<string, { calls: number; correct: number; returnPct: number; returnCount: number }>();
  for (let day = 1; day <= 15; day += 1) days.set(`2026-11-${String(day).padStart(2, "0")}`, { calls: 0, correct: 0, returnPct: 0, returnCount: 0 });
  for (let index = 168; index < history.length; index += 1) {
    const actual = history[index]!;
    if (actual.time < from || actual.time >= through) continue;
    const day = days.get(actual.time.slice(0, 10));
    if (!day) continue;
    const prior = history.slice(index - 168, index);
    const decision = decideBuySell(prior, actual.time, victorianCalendarAnnotation(actual.time.slice(0, 10)));
    if (decision.status === "ready" && decision.action !== "HOLD") {
      const move = actual.price - prior.at(-1)!.price;
      const side = decision.action === "BUY" ? 1 : -1;
      day.calls += 1;
      if ((side === 1 && move > 0) || (side === -1 && move < 0)) day.correct += 1;
      const entry = prior.at(-1)!.price;
      if (entry > 0) {
        day.returnPct += side * move / entry * 100;
        day.returnCount += 1;
      }
    }
  }
  const series = [...days].map(([date, value]) => ({ time: `${date}T12:00:00`, ...value,
    hitRate: value.calls ? value.correct / value.calls * 100 : null,
    meanReturnPct: value.returnCount ? value.returnPct / value.returnCount : null }));
  const calls = series.reduce((sum, day) => sum + day.calls, 0);
  const correct = series.reduce((sum, day) => sum + day.correct, 0);
  const returnCount = series.reduce((sum, day) => sum + day.returnCount, 0);
  const meanReturnPct = returnCount ? series.reduce((sum, day) => sum + day.returnPct, 0) / returnCount : 0;
  return { series, calls, correct, hitRate: calls ? correct / calls : 0, meanReturnPct, returnCount };
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
  return { decision: decideBuySell(history.slice(-168), targetHour, holiday), evaluation: evaluateFollowOn(history), recent: history.slice(-24) };
}

export function BuySellPane({ width, height, focused }: PaneProps) {
  const colors = useThemeColors();
  const [view, setView] = usePluginPaneState<"live" | "evaluation">("buy-sell-view", "live");
  const { strip: tabStrip, rows: tabRows } = usePaneTabs({
    tabs: [{ value: "live", label: "LIVE" }, { value: "evaluation", label: "MODEL EVALUATION" }],
    activeValue: view, onSelect: (value) => setView(value as "live" | "evaluation"), focused, compact: true,
  });
  const loader = useCallback(() => loadDecision(), []);
  const resource = useAsyncResource(loader);
  useAutoRefresh(resource.updatedAt, resource.load, { intervalMs: 5 * 60 * 1000 });
  const result = resource.data?.decision;
  const decision = result?.status === "ready" ? result : null;
  const actionColor = decision?.action === "BUY" ? colors.positive : decision?.action === "SELL" ? colors.negative : colors.textDim;
  const liveStats: StatItem[] = decision ? [
    { label: "Signal", value: decision.action, color: actionColor },
    { label: "Expected move", value: `${decision.expectedMove >= 0 ? "+" : "−"}$${Math.abs(decision.expectedMove).toFixed(2)}/MWh`, tone: decision.expectedMove >= 0 ? "positive" : "negative" },
    { label: "Entry price", value: `$${decision.entryMwHPrice.toFixed(2)}/MWh` },
    { label: "Price estimate", value: `$${decision.forecastPrice.toFixed(2)}/MWh` },
  ] : [];
  const evaluation = resource.data?.evaluation;
  const actualSeries = useMemo(() => staticSeries((resource.data?.recent ?? []).map((row) => scalarPoint(chartDate(row.time), row.price)), {
    id: "vic1-hourly-rrp", label: "VIC1 hourly price", color: colors.warning, calendarSpaced: true,
  }), [colors.warning, resource.data?.recent]);
  const liveSeries = [
    { ...actualSeries, panelId: "price", unit: "$/MWh", unitGroup: "power-price" },
    { ...staticSeries(decision ? [scalarPoint(chartDate(decision.targetHour), decision.forecastPrice)] : [], {
      id: "vic1-price-estimate", label: "One-hour estimate", color: actionColor, style: "points", calendarSpaced: true,
    }), panelId: "price", unit: "$/MWh", unitGroup: "power-price" },
  ];
  const dailyHitRate = useMemo(() => staticSeries((evaluation?.series ?? []).map((day) => scalarPoint(chartDate(day.time), day.hitRate)), {
    id: "daily-hit-rate", label: "Direction correct", color: colors.borderFocused, calendarSpaced: true,
  }), [colors.borderFocused, evaluation?.series]);
  const dailyPnl = useMemo(() => staticSeries((evaluation?.series ?? []).map((day) => scalarPoint(chartDate(day.time), day.meanReturnPct)), {
    id: "daily-return", label: "Mean return", color: colors.positive, negativeColor: colors.negative, style: "columns", calendarSpaced: true,
  }), [colors.negative, colors.positive, evaluation?.series]);
  const evaluationSeries = [
    { ...dailyHitRate, panelId: "hit-rate", unit: "%", unitGroup: "percentage" },
    { ...dailyPnl, panelId: "daily-return", unit: "%", unitGroup: "percentage" },
  ];
  const chartHeight = Math.max(8, height - tabRows - statGridRows(liveStats, width) - 4);
  if (!decision) return <Box width={width} height={height} flexDirection="column" {...FILL_REST}>
    {tabStrip}<PaneStatusBody loading={resource.loading} error={resource.error} empty subject="VIC1 buy or sell signal"
      emptyTitle="No paper-trade signal is available."
      retry={{ onRetry: resource.reload, label: "Refresh", pending: resource.loading }} width={width} height={Math.max(0, height - tabRows)} />
  </Box>;
  if (view === "evaluation") {
    const evaluationStats: StatItem[] = [
      { label: "Hit rate", value: `${evaluation?.correct ?? 0}/${evaluation?.calls ?? 0} · ${((evaluation?.hitRate ?? 0) * 100).toFixed(0)}%` },
      { label: "Mean return", value: `${(evaluation?.meanReturnPct ?? 0) >= 0 ? "+" : ""}${(evaluation?.meanReturnPct ?? 0).toFixed(2)}%`, tone: (evaluation?.meanReturnPct ?? 0) >= 0 ? "positive" : "negative" },
      { label: "Calls", value: `${evaluation?.calls ?? 0}/360 · ${((evaluation?.calls ?? 0) / 360 * 100).toFixed(0)}%` },
    ];
    const evaluationChartHeight = Math.max(8, height - tabRows - statGridRows(evaluationStats, width) - 3);
    return <Box width={width} height={height} flexDirection="column" {...FILL_REST}>
      {tabStrip}<StatGrid items={evaluationStats} width={width} />
      <CompositeChart series={evaluationSeries} panels={[{ id: "hit-rate", label: "Daily hit rate · %", height: 1 }, { id: "daily-return", label: "Mean call return · %", height: 1 }]} width={width}
        height={evaluationChartHeight} focused={focused} navigable={false} showLegend={false} showTimeAxis timeZone={NEM_TIME_ZONE}
        levels={{ seriesId: "daily-return", items: [{ id: "break-even", value: 0, color: colors.textDim, label: "0%", dashed: true, editable: false, actionable: false }] }}
        formatValue={(value) => `${value.toFixed(1)}%`} />
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text fg={colors.text}>{t("Model fit through Oct 31, 2026 · follow-on period Nov 1–15, 2026")}</Text>
        <Text fg={colors.textDim}>{t("Mean return is per called hour when entry price is positive; hit rate includes all calls.")}</Text>
      </Box>
    </Box>;
  }
  const reason = decision.action === "BUY"
    ? t("BUY because the estimated rise of {move}/MWh exceeds the +$5/MWh threshold.").replace("{move}", decision.expectedMove.toFixed(2))
    : decision.action === "SELL"
      ? t("SELL because the estimated fall of {move}/MWh exceeds the −$5/MWh threshold.").replace("{move}", Math.abs(decision.expectedMove).toFixed(2))
      : t("HOLD because the estimated move stays within the ±$5/MWh threshold.");
  return <Box width={width} height={height} flexDirection="column" {...FILL_REST}>
    {tabStrip}<StatGrid items={liveStats} width={width} />
    <CompositeChart series={liveSeries} panels={[{ id: "price", label: "VIC1 hourly electricity price · $/MWh" }]} width={width}
      height={chartHeight} focused={focused} navigable={false} showLegend showTimeAxis timeZone={NEM_TIME_ZONE}
      formatValue={(value) => `$${value.toFixed(2)}`} />
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="row" style={{ gap: "var(--power-space-sm)" }}><Badge label={decision.action} tone={decision.action === "BUY" ? "positive" : decision.action === "SELL" ? "negative" : "neutral"} variant="solid" /><Text fg={colors.text} wrapText>{reason}</Text></Box>
      <Text fg={colors.textDim}>{t("Ridge uses recent VIC price and demand, plus hour, weekday and holiday inputs.")}</Text>
    </Box>
  </Box>;
}
