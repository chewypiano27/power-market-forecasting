import { useCallback, useMemo } from "react";
import { Badge, CompositeChart, PaneStatusBody, StatGrid, scalarPoint, staticSeries, statGridRows, usePaneTabs, type StatItem } from "../../../components";
import { useAsyncResource, useAutoRefresh, usePluginPaneState } from "../../../public/react";
import { httpFetch } from "../../../utils/http-transport";
import type { PaneProps } from "../../../types/plugin";
import { Box, Text } from "../../../ui";
import { useThemeColors } from "../../../theme/theme-context";
import { t } from "../../../i18n";
import { fetchVicPowerMarketHistory, parseAemoPriceDemandCsv } from "./data";
import { decideBuySell, type BuySellHourlyPrice } from "./buy-sell-model";
import { victorianCalendarAnnotation } from "./victoria-calendar";
import { chartDate, dispatchTime, NEM_TIME_ZONE } from "./analytics";
import { FILL_REST } from "../../../components/ui/fill";

function nemDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function previousMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

function formatMarketTime(time: string | null | undefined): string {
  if (!time) return "—";
  const instant = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(time) ? time : `${time}+10:00`);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: NEM_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

function formatHitRateDelta(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}pp`;
}

type MarketAccumulator = { demand: number; price: number; count: number };

function hourAccumulator(groups: Map<string, MarketAccumulator>, timestamp: string, price: number, demand: number): void {
  const match = timestamp.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return;
  const [, year, month, day, hour, minute] = match;
  const intervalEnd = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const bucket = new Date(Math.floor((intervalEnd - 300_000) / 3_600_000) * 3_600_000);
  const time = `${bucket.getUTCFullYear()}-${String(bucket.getUTCMonth() + 1).padStart(2, "0")}-${String(bucket.getUTCDate()).padStart(2, "0")}T${String(bucket.getUTCHours()).padStart(2, "0")}:00:00`;
  const group = groups.get(time) ?? { demand: 0, price: 0, count: 0 };
  group.demand += demand;
  group.price += price;
  group.count += 1;
  groups.set(time, group);
}

function materializeHours(groups: Map<string, MarketAccumulator>, minimumIntervals = 12): BuySellHourlyPrice[] {
  return [...groups].filter(([, value]) => value.count >= minimumIntervals).map(([time, value]) => ({
    time, demand: value.demand / value.count, price: value.price / value.count,
  })).sort((a, b) => a.time.localeCompare(b.time));
}

function hourHistory(rows: ReturnType<typeof parseAemoPriceDemandCsv>): BuySellHourlyPrice[] {
  const groups = new Map<string, MarketAccumulator>();
  for (const row of rows) {
    if (row.periodType.toUpperCase() === "TRADE") hourAccumulator(groups, row.settlementDate, row.rrp, row.totalDemand);
  }
  return materializeHours(new Map([...groups].filter(([, value]) => value.count === 12)));
}

function liveHourHistory(points: Awaited<ReturnType<typeof fetchVicPowerMarketHistory>>, now: Date, completeOnly = false): BuySellHourlyPrice[] {
  const groups = new Map<string, MarketAccumulator>();
  const seen = new Set<string>();
  for (const point of points) {
    if (!point.timestamp || dispatchTime(point.timestamp) > now.getTime() || !Number.isFinite(point.price) || !Number.isFinite(point.demand)) continue;
    const key = point.timestamp;
    if (seen.has(key)) continue;
    seen.add(key);
    hourAccumulator(groups, point.timestamp, point.price, point.demand);
  }
  const latestBucket = [...groups.keys()].sort().at(-1);
  const minimumIntervals = completeOnly ? 12 : 1;
  const eligible = new Map([...groups].filter(([time, value]) => value.count >= minimumIntervals || (!completeOnly && time === latestBucket)));
  return materializeHours(eligible, 1);
}

function mergeMarketHours(base: readonly BuySellHourlyPrice[], live: readonly BuySellHourlyPrice[]): BuySellHourlyPrice[] {
  const hours = new Map(base.map((row) => [row.time, row]));
  for (const row of live) hours.set(row.time, row);
  return [...hours.values()].sort((a, b) => a.time.localeCompare(b.time));
}

function evaluateFollowOn(history: readonly BuySellHourlyPrice[]) {
  const from = "2026-11-01T00:00:00";
  const followOnHistory = history.filter((row) => row.time >= from);
  const lastAvailable = followOnHistory.at(-1)?.time.slice(0, 10);
  const days = new Map<string, { calls: number; correct: number }>();
  const cursor = new Date("2026-11-01T00:00:00Z");
  while (lastAvailable && cursor.toISOString().slice(0, 10) <= lastAvailable) {
    days.set(cursor.toISOString().slice(0, 10), { calls: 0, correct: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  let hours = 0;
  for (let index = 168; index < history.length; index += 1) {
    const actual = history[index]!;
    if (actual.time < from) continue;
    const day = days.get(actual.time.slice(0, 10));
    if (!day) continue;
    const prior = history.slice(index - 168, index);
    const decision = decideBuySell(prior, actual.time, victorianCalendarAnnotation(actual.time.slice(0, 10)));
    if (decision.status !== "ready") continue;
    hours += 1;
    if (decision.action !== "HOLD") {
      const move = actual.price - prior.at(-1)!.price;
      const side = decision.action === "BUY" ? 1 : -1;
      day.calls += 1;
      if ((side === 1 && move > 0) || (side === -1 && move < 0)) day.correct += 1;
    }
  }
  const series = [...days].map(([date, value]) => ({ time: `${date}T12:00:00`, ...value,
    hitRateDelta: value.calls ? value.correct / value.calls * 100 - 50 : null }));
  const calls = series.reduce((sum, day) => sum + day.calls, 0);
  const correct = series.reduce((sum, day) => sum + day.correct, 0);
  return { series, calls, correct, hours, hitRate: calls ? correct / calls : 0,
    through: followOnHistory.at(-1)?.time ?? null };
}

async function loadDecision() {
  const now = new Date();
  const nemNow = new Date(`${nemDate(now)}T12:00:00Z`);
  const months = [previousMonth(nemNow), new Date(Date.UTC(nemNow.getUTCFullYear(), nemNow.getUTCMonth(), 1))];
  const [rows, marketPoints] = await Promise.all([
    Promise.all(months.map(async (month) => {
      const key = `${month.getUTCFullYear()}${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
      const response = await httpFetch(`https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${key}_VIC1.csv`);
      if (!response.ok) throw new Error(`AEMO price and demand data request failed (HTTP ${response.status}).`);
      return parseAemoPriceDemandCsv(await response.text());
    })).then((files) => files.flat()),
    fetchVicPowerMarketHistory({ now }),
  ]);
  const currentMarketPoint = marketPoints.filter((point) => point.timestamp && dispatchTime(point.timestamp) <= now.getTime())
    .toSorted((a, b) => dispatchTime(a.timestamp!) - dispatchTime(b.timestamp!)).at(-1);
  if (!currentMarketPoint?.timestamp || now.getTime() - dispatchTime(currentMarketPoint.timestamp) > 15 * 60_000) {
    throw new Error("AEMO has not published a recent VIC1 dispatch. No stale signal is shown.");
  }
  const baseHistory = hourHistory(rows).filter((row) => Date.parse(`${row.time}+10:00`) <= now.getTime());
  const history = mergeMarketHours(baseHistory, liveHourHistory(marketPoints, now));
  if (history.length < 168) throw new Error("Eight complete days of hourly VIC price and demand history are not available yet.");
  const last = history.at(-1)!;
  const target = new Date(Date.parse(`${last.time}Z`) + 3_600_000);
  const targetHour = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}T${String(target.getUTCHours()).padStart(2, "0")}:00:00`;
  const holiday = victorianCalendarAnnotation(targetHour.slice(0, 10));
  const completeLive = liveHourHistory(marketPoints, now, true);
  const evaluationHistory = mergeMarketHours(baseHistory, completeLive);
  return { decision: decideBuySell(history.slice(-168), targetHour, holiday), evaluation: evaluateFollowOn(evaluationHistory), recent: history.slice(-24),
    liveTimestamp: currentMarketPoint.timestamp };
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
  const dataThrough = resource.data?.liveTimestamp ?? null;
  const actualSeries = useMemo(() => {
    const rows = resource.data?.recent ?? [];
    const points = rows.flatMap((row, index) => {
      const previous = rows[index - 1];
      const gap = previous && Date.parse(`${row.time}+10:00`) - Date.parse(`${previous.time}+10:00`) > 3_600_000;
      const gapStart = previous ? new Date(chartDate(previous.time).getTime() + 3_600_000) : null;
      return [...(gap && gapStart ? [scalarPoint(gapStart, null)] : []), scalarPoint(chartDate(row.time), row.price)];
    });
    return staticSeries(points, {
      id: "vic1-hourly-rrp", label: "VIC1 hourly price", color: colors.warning, calendarSpaced: true,
    });
  }, [colors.warning, resource.data?.recent]);
  const liveSeries = [
    { ...actualSeries, panelId: "price", unit: "$/MWh", unitGroup: "power-price" },
    { ...staticSeries(decision ? [scalarPoint(chartDate(decision.targetHour), decision.forecastPrice)] : [], {
      id: "vic1-price-estimate", label: "One-hour estimate", color: actionColor, style: "points", calendarSpaced: true,
    }), panelId: "price", unit: "$/MWh", unitGroup: "power-price" },
  ];
  const dailyHitRate = useMemo(() => staticSeries((evaluation?.series ?? []).map((day) => scalarPoint(chartDate(day.time), day.hitRateDelta)), {
    id: "daily-hit-rate", label: "Hit rate vs 50%", color: colors.positive, negativeColor: colors.negative, style: "columns", calendarSpaced: true,
  }), [colors.negative, colors.positive, evaluation?.series]);
  const evaluationSeries = [{ ...dailyHitRate, panelId: "hit-rate", unit: "pp", unitGroup: "percentage" }];
  const chartHeight = Math.max(8, height - tabRows - statGridRows(liveStats, width) - 4);
  if (view === "evaluation") {
    const evaluationStats: StatItem[] = [
      { label: "Hit rate", value: `${evaluation?.correct ?? 0}/${evaluation?.calls ?? 0} · ${((evaluation?.hitRate ?? 0) * 100).toFixed(0)}%` },
      { label: "Coverage", value: `${evaluation?.calls ?? 0}/${evaluation?.hours ?? 0} · ${((evaluation?.calls ?? 0) / Math.max(1, evaluation?.hours ?? 0) * 100).toFixed(0)}%` },
    ];
    const evaluationChartHeight = Math.max(8, height - tabRows - statGridRows(evaluationStats, width) - 3);
    return <Box width={width} height={height} flexDirection="column" {...FILL_REST}>
      {tabStrip}<StatGrid items={evaluationStats} width={width} />
      <CompositeChart series={evaluationSeries} panels={[{ id: "hit-rate", label: "Daily hit rate vs 50% · pp" }]} width={width}
        height={evaluationChartHeight} focused={focused} navigable={false} showLegend={false} showTimeAxis timeZone={NEM_TIME_ZONE}
        levels={{ seriesId: "daily-hit-rate", items: [
          { id: "coin-flip", value: 0, color: "#ffffff", dashed: true, editable: false, actionable: false },
        ] }}
        referenceLevels={{ seriesId: "daily-hit-rate", items: [
          { id: "negative-axis", value: -20, color: colors.negative, label: "−20pp", editable: false, actionable: false },
        ] }}
        axisValueColor={(value) => {
          const rounded = Math.round(value);
          return rounded < 0 ? "#ff4d4f" : rounded > 0 ? "#32c875" : "#ffffff";
        }}
        formatAxisValue={formatHitRateDelta}
        formatValue={formatHitRateDelta} />
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text fg={colors.text}>{t("Model fit through Oct 31, 2026 · evaluation through {date}").replace("{date}", evaluation?.through?.slice(0, 10) ?? "—")}</Text>
        <Text fg={colors.textDim}>{t("Each bar shows the day's directional hit rate relative to 50%; green is above, red below.")}</Text>
      </Box>
    </Box>;
  }
  if (!decision) return <Box width={width} height={height} flexDirection="column" {...FILL_REST}>
    {tabStrip}<PaneStatusBody loading={resource.loading} error={resource.error} empty subject="VIC1 buy or sell signal"
      emptyTitle="No paper-trade signal is available."
      emptyMessage={result?.status === "unavailable" ? result.reason : undefined}
      retry={{ onRetry: resource.reload, label: "Refresh", pending: resource.loading }} width={width} height={Math.max(0, height - tabRows)} />
  </Box>;
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
      <Text fg={colors.text}>{t("Latest AEMO interval: {time} AEST. Signal hour: {target} AEST.").replace("{time}", formatMarketTime(dataThrough)).replace("{target}", formatMarketTime(decision.targetHour))}</Text>
      <Text fg={colors.textDim}>{t("Ridge uses recent VIC price and demand, plus hour, weekday and holiday inputs.")}</Text>
    </Box>
  </Box>;
}
