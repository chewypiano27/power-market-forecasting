import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionRow,
  Badge,
  Button,
  Card,
  CompositeChart,
  KeyValueRow,
  PaneStatusBody,
  QueryBar,
  RatioBar,
  SectionHeading,
  SliderField,
  StatGrid,
  usePaneNoticeFooter,
  usePaneStatusFooter,
  usePaneTabs,
  usePaneFooter,
  usePaneMenuItems,
  scalarPoint,
  staticSeries,
  statGridRows,
  type StatItem,
} from "../../../components";
import { usePaneRefreshKey } from "../../../components/data-table/table-pane";
import { useAsyncResource, useAutoRefresh, useUpdatedAgo, usePaneVisible, usePluginConfigState, usePluginPaneState } from "../../../public/react";
import { useThemeColors } from "../../../theme/theme-context";
import { blendHex } from "../../../theme/color-utils";
import type { ResolvedSeries } from "../../../time-series/types";
import type { PaneProps } from "../../../types/plugin";
import { Box, ScrollBox, Text, TextAttributes } from "../../../ui";
import { getCachedVicPowerSnapshot, loadVicPowerSnapshot } from "./cache";
import { createVicPowerDemoSnapshot, type PowerNewsItem, type RegionalMarketSnapshot, type RegionalPricePoint } from "./data";
import { NEM_TIME_ZONE, WEATHER_TIME_ZONE, weatherChartDate, chartDate, dispatchTime, marketComparisons, marketIsFresh, regionalDispatches, separationWindows, SPOT_REGIONS } from "./analytics";
import { useAppDispatch, useAppStateRef, syncConfigActiveLayoutState } from "../../../state/app/context";
import { installWorkstationLayouts } from "./workspaces";
import type { SeparationWindow } from "./analytics";
import { vicMarketPoints, type TraderDay, type VicMarketPoint, type Volatility } from "./model";

import { bundledDemandModel, loadDemandProbability, nextDemandTarget } from "./demand-service";
import { DemandHistoryPane } from "./demand-history-pane";
import { demandDisplay, selectedDemandTarget } from "./demand-display";
import { FILL_REST } from "../../../components/ui/fill";

const TEMPERATURE_KEY = "temperature-deviation";
const MARKET_PANELS = [{ id: "demand", label: "Demand MW", height: 2 }, { id: "price", label: "Price $/MWh", height: 1 }];
const GLANCE_PANELS = [{ id: "price", label: "VIC1 RRP", height: 1 }];
const RISK_PANELS = [{ id: "temperature", label: "Melbourne temperature °C", height: 1 }, { id: "risk", label: "Hourly weather-load score", height: 1 }];
const SPOT_PANELS = [{ id: "regional-price", label: "Regional RRP $/MWh", height: 2 }, { id: "regional-spread", label: "VIC minus neighbour $/MWh", height: 1 }];
const LIVE_REFRESH_MS = 5 * 60 * 1000;
const signed = (value: number, digits = 0) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

function useTemperatureScenario(): [number, (value: number) => void] {
  return usePluginConfigState<number>(TEMPERATURE_KEY, 0);
}

function useWorkstationLayouts() {
  const dispatch = useAppDispatch();
  const stateRef = useAppStateRef();
  useEffect(() => {
    const state = stateRef.current;
    if (state.config.pluginConfig["vic-power"]?.["workspace-presets-version"] === 3) return;
    const config = syncConfigActiveLayoutState(state.config, state.paneState, state.focusedPaneId);
    dispatch({ type: "SET_CONFIG", config: installWorkstationLayouts(config) });
  }, [dispatch, stateRef]);
}

function useVicPowerData() {
  useWorkstationLayouts();
  const [demoMode, setDemoMode] = usePluginConfigState<boolean>("presentation-demo-mode", false);
  const loader = useCallback((force = false) => demoMode ? Promise.resolve(createVicPowerDemoSnapshot()) : loadVicPowerSnapshot(force), [demoMode]);
  const resource = useAsyncResource(loader, {
    initialData: () => demoMode ? createVicPowerDemoSnapshot() : getCachedVicPowerSnapshot()?.data ?? null,
  });
  useAutoRefresh(resource.updatedAt, resource.load, { intervalMs: LIVE_REFRESH_MS });
  usePaneMenuItems("vic-power:data-mode", () => [{
    id: "vic-power-demo", label: "Use demonstration snapshot", checked: demoMode,
    onSelect: () => setDemoMode(!demoMode),
  }], [demoMode, setDemoMode]);
  return { ...resource, demoMode, setDemoMode };
}

function useVicPowerPaneStatus(
  registrationId: string,
  resource: ReturnType<typeof useVicPowerData>,
  focused: boolean,
  context: "market" | "weather" | "history",
) {
  const refresh = useCallback(() => { void resource.reload(); }, [resource.reload]);
  usePaneRefreshKey(refresh, { focused });
  const fetchedAgo = useUpdatedAgo(resource.data ? Date.parse(resource.data.fetchedAt) : null);
  const info = useMemo(() => {
    if (context === "history") return [{id:"held-out-period",parts:[{text:"Held-out backtest · 1 Jan - 31 Oct 2026 · NEM AEST",tone:"muted" as const}]}];
    if (!resource.data) return [];
    if (context === "weather") {
      const end = resource.data.calendar.at(-1)?.date;
      return end ? [{ id: "through", parts: [
        ...(resource.demoMode ? [{ text: "DEMO SNAPSHOT · ", tone: "warning" as const }] : [{ text: `updated ${fetchedAgo ?? "—"} · `, tone: "muted" as const }]),
        { text: `forecast through ${new Date(`${end}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · Melbourne time`, tone: "muted" as const },
      ] }] : [];
    }
    const fresh = marketIsFresh(resource.data.latest.settlementDate, resource.data.fetchedAt, Date.now());
    const source = resource.demoMode ? "DEMO SNAPSHOT" : fresh ? "LIVE" : "STALE / CACHED";
    return [{ id: "settlement", parts: [
      { text: source, tone: resource.demoMode ? "warning" as const : fresh ? "positive" as const : "warning" as const },
      { text: ` · NEM AEST ${resource.data.latest.settlementDate.replace("T", " ")}`, tone: "muted" as const },
    ] }];
  }, [context, resource.data, resource.demoMode, fetchedAgo]);
  usePaneNoticeFooter({registrationId: `${registrationId}:market-source`, focused, title:"Market data source",
    notices:context === "market" ? resource.data?.marketWarnings ?? [] : []});
  usePaneStatusFooter({ registrationId, loading: context !== "history" && resource.loading, error: context === "history" ? null : resource.error, info });
}

function seriesForScenario(
  delta: number,
  colors: ReturnType<typeof useThemeColors>,
  suffix = "",
  baseline: readonly VicMarketPoint[] = [],
): ResolvedSeries[] {
  const day = new Date();
  day.setMinutes(0, 0, 0);
  const points = vicMarketPoints(delta, baseline);
  const dates = points.map(({ hour, timestamp }) => timestamp
    ? chartDate(timestamp)
    : new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour));
  const demand = staticSeries(points.map((point, index) => scalarPoint(dates[index]!, point.demand)), {
    id: `vic-demand${suffix}`, label: `VIC demand${suffix}`, color: colors.borderFocused, calendarSpaced: true,
  });
  const price = staticSeries(points.map((point, index) => scalarPoint(dates[index]!, point.price)), {
    id: `vic-price${suffix}`, label: `VIC price${suffix}`, color: colors.warning, calendarSpaced: true,
  });
  return [
    { ...demand, panelId: "demand", unit: "MW", unitGroup: "power-demand" },
    { ...price, panelId: "price", unit: "$/MWh", unitGroup: "power-price" },
  ];
}

function riskTone(risk: Volatility): "positive" | "warning" | "negative" {
  return risk === "low" ? "positive" : risk === "amber" ? "warning" : "negative";
}

function riskLabel(risk: Volatility): string {
  return risk === "low" ? "LOW" : risk === "amber" ? "AMBER" : "HIGH";
}

function marketGlanceSeries(points: readonly VicMarketPoint[], color: string): ResolvedSeries[] {
  const series = staticSeries(points.map((point) => scalarPoint(chartDate(point.timestamp!), point.price)), {
    id: "vic-live-rrp",
    label: "VIC1 RRP",
    color,
    calendarSpaced: true,
  });
  return [{ ...series, panelId: "price", unit: "$/MWh", unitGroup: "power-price" }];
}

function compactNewsTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value.slice(0, 16).replace("T", " ")
    : parsed.toLocaleString("en-AU", { timeZone: NEM_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function MarketNewsCard({ item }: { item: PowerNewsItem }) {
  const colors = useThemeColors();
  return (
    <Card width="100%">
      <Box flexDirection="row" style={{ gap: "var(--power-space-sm)" }}>
        <Badge label="AEMO" tone="warning" />
        <Text fg={colors.textDim}>{compactNewsTime(item.publishedAt)}</Text>
        {item.category ? <Text fg={colors.textMuted}>{item.category}</Text> : null}
      </Box>
      <Text fg={colors.textBright} attributes={TextAttributes.BOLD} wrapText>{item.title}</Text>
      {item.summary ? <Text fg={colors.textDim} wrapText>{item.summary.slice(0, 220)}</Text> : null}
    </Card>
  );
}

export function VicMarketGlancePane({ width, height, focused }: PaneProps) {
  const colors = useThemeColors();
  const live = useVicPowerData();
  useVicPowerPaneStatus("vic-power:glance", live, focused, "market");
  const { points, current, thirtyMinutesAgo, lunch } = useMemo(() => marketComparisons(live.data?.market ?? []), [live.data?.market]);
  const vic = live.data?.regions.find((region) => region.regionId === "VIC1");
  const comparison = lunch ?? thirtyMinutesAgo;
  const stats: StatItem[] = current ? [
    { id: "spot", label: "RRP $/MWh", value: current.price.toFixed(2), tone: "warning" },
    { id: "price-move", label: lunch ? "Since noon" : "30-min move", value: comparison ? `${signed(current.price - comparison.price, 2)} $/MWh` : "—", tone: comparison && current.price >= comparison.price ? "warning" : "positive" },
    { id: "demand", label: "VIC demand", value: `${Math.round(current.demand).toLocaleString()} MW` },
    { id: "demand-move", label: "30-min demand", value: thirtyMinutesAgo ? `${signed(current.demand - thirtyMinutesAgo.demand)} MW` : "—" },
    { id: "interchange", label: "Net interchange", value: vic?.netInterchange != null ? `${signed(vic.netInterchange)} MW` : "—" },
    { id: "weather", label: "Melbourne today", value: live.data ? `${live.data.weather.todayLow}° / ${live.data.weather.todayHigh}°` : "—" },
  ] : [];
  const series = useMemo(() => marketGlanceSeries(points.slice(-288), colors.warning), [colors.warning, points]);
  const chartPoints = points.slice(-288);
  const chartStart = chartPoints[0]?.timestamp ? chartDate(chartPoints[0].timestamp).getTime() : 0;
  const chartEnd = current?.timestamp ? chartDate(current.timestamp).getTime() : 0;
  // An authored xAxis uses the exact observed span without right-side padding.
  const markerSpan = chartEnd - chartStart;
  const markers = [
    ...(lunch ? [{ point: lunch, label: "Noon", color: colors.borderFocused }] : []),
    ...(thirtyMinutesAgo ? [{ point: thirtyMinutesAgo, label: "−30m", color: colors.textDim }] : []),
  ].flatMap(({ point, label, color }) => {
    const time = chartDate(point.timestamp!).getTime();
    return markerSpan > 0 && time >= chartStart ? [{ id: label, label, color, xRatio: (time - chartStart) / markerSpan }] : [];
  });
  const [newsOpen, setNewsOpen] = usePluginPaneState("market-news-open", true);
  const statRows = statGridRows(stats, width);
  const availableHeight = Math.max(8, height - statRows - 2);
  const newsHeight = newsOpen ? Math.min(Math.floor(height * 0.5), Math.max(5, availableHeight - 6)) : 0;
  const chartHeight = Math.max(6, availableHeight - newsHeight);
  if (!current) return <PaneStatusBody loading={live.loading} error={live.error} empty subject="VIC market data" emptyTitle="No market observations available." retry={{ onRetry: live.reload }} width={width} height={height} />;
  return (
    <Box width={width} height={height} flexDirection="column" position="relative">
      <StatGrid items={stats} width={width} />
      <Box>
        <CompositeChart series={series} panels={GLANCE_PANELS} width={width} height={chartHeight} focused={focused}
          navigable={false} xAxis={{ markers }} showLegend showTimeAxis timeZone={NEM_TIME_ZONE} formatValue={(value) => `${value.toFixed(2)}`} />
      </Box>
      <Box>
        <ActionRow label="AEMO market notices" expanded={newsOpen} onPress={() => setNewsOpen(!newsOpen)} width={width}>
          <Box flexGrow={1} />
          <Text fg={colors.textDim}>{live.data?.news.length ?? 0} updates</Text>
        </ActionRow>
        <Box height={newsHeight} flexShrink={0} overflow="hidden" style={{ transition: "height 180ms ease" }}>
          <ScrollBox width={width} height={newsHeight} flexDirection="column" paddingX={1} style={{ gap: "var(--power-space-sm)" }}>
            {(live.data?.news ?? []).map((item) => <MarketNewsCard key={item.id} item={item} />)}
            {!live.data?.news.length ? <Text fg={colors.textDim}>No market notices available.</Text> : null}
          </ScrollBox>
        </Box>
      </Box>
    </Box>
  );
}

function TraderDayCard({ day, selected, onPress, barWidth }: { day: TraderDay; selected: boolean; onPress: () => void; barWidth: number }) {
  const colors = useThemeColors();
  const accent = day.volatility === "low" ? colors.positive : day.volatility === "amber" ? colors.warning : colors.negative;
  return (
    <Card width="100%" accent={accent} selected={selected} onPress={onPress}>
      <Box flexDirection="row" flexWrap="wrap">
        <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{day.day}</Text>
        <Box flexGrow={1} />
        <Badge label={riskLabel(day.volatility)} tone={riskTone(day.volatility)} />
      </Box>
      <Text fg={colors.textBright}>{`${day.low}° / ${day.high}°`}</Text>
      <Box style={{ width: "100%", overflow: "hidden" }}>
        <RatioBar ratio={(day.riskScore ?? 0) / 100} width={barWidth} color={accent} track />
      </Box>
      <Text fg={colors.textDim}>{day.riskScore === undefined ? "—" : `${day.riskScore}/100`}</Text>
    </Card>
  );
}

function riskSeries(day: TraderDay, color: string): ResolvedSeries[] {
  const series = staticSeries((day.hours ?? []).map((hour) => scalarPoint(weatherChartDate(hour.time), hour.score)), {
    id: `weather-risk:${day.date ?? day.day}`,
    label: "Hourly risk",
    color,
    calendarSpaced: true,
  });
  const temperature = staticSeries((day.hours ?? []).map((hour) => scalarPoint(weatherChartDate(hour.time), hour.temperature)), {
    id: `weather-temperature:${day.date ?? day.day}`, label: "Temperature", color, calendarSpaced: true,
  });
  return [
    { ...temperature, panelId: "temperature", unit: "°C", unitGroup: "temperature" },
    { ...series, panelId: "risk", unit: "points", unitGroup: "weather-risk" },
  ];
}

function DayAheadDemand({ width, focused, selectedDate }: { width: number; focused: boolean; selectedDate: string | undefined }) {
  const visible = usePaneVisible();
  const [nextTarget, setTarget] = useState(() => nextDemandTarget(Date.now()));
  useEffect(() => {
    if (!visible) return;
    setTarget(nextDemandTarget(Date.now()));
    const timer = setInterval(() => setTarget(nextDemandTarget(Date.now())), 30_000);
    return () => clearInterval(timer);
  }, [visible]);
  const target = selectedDemandTarget(nextTarget, selectedDate);
  const selectedTarget = selectedDate ?? target;
  const forecastSelected = selectedTarget === target;
  const loader = useCallback((force = false) => loadDemandProbability(target, force), [target]);
  const probability = useAsyncResource(visible && forecastSelected ? loader : null);
  usePaneMenuItems("vic-power:refresh-demand", () => bundledDemandModel && forecastSelected ? [{ id: "refresh-demand", label: "Refresh demand forecast", onSelect: () => { void probability.reload(); } }] : [], [probability.reload, forecastSelected]);
  useAutoRefresh(probability.updatedAt, probability.load, { intervalMs: 60_000 });
  const result = probability.data;
  const display = demandDisplay(result, target, selectedTarget, probability.loading, !!bundledDemandModel);
  const current = display.current;
  const columns = width < 55 ? 1 : width < 110 ? 2 : 3;
  usePaneNoticeFooter({ registrationId: "vic-power:demand-probability-notice", focused,
    title: "Demand probability unavailable", notices: result?.status === "unavailable" && bundledDemandModel ? [result.reason] : current?.inputWarning ? [current.inputWarning] : [] });
  return <StatGrid width={width} columns={columns} items={[
    { label: display.eventLabel, value: display.value },
    { label: forecastSelected ? "NEM day (AEST)" : "Selected day", value: forecastSelected ? display.forecastDay : display.selectedDay },
    { label: forecastSelected ? `Issued (${display.issueZone})` : "Forecast NEM day", value: forecastSelected ? display.issue : display.forecastDay },
  ]} />;
}

export function VicDemandPricePane({ width, height, focused }: PaneProps) {
  const colors = useThemeColors();
  const live = useVicPowerData();
  const [view, setView] = usePluginPaneState<"outlook" | "stress" | "history">("weather-load-view", "outlook");
  const [delta, setDelta] = useTemperatureScenario();
  const days = useMemo(() => live.data?.calendar ?? [], [live.data?.calendar]);
  const [selectedDate, setSelectedDate] = usePluginPaneState<string>("selected-date", days[0]?.date ?? String(days[0]?.day ?? 1));
  const selected = days.find((day) => (day.date ?? String(day.day)) === selectedDate) ?? days[0];
  const calendarColumns = width < 44 ? 2 : width < 60 ? 3 : width < 100 ? 4 : 7;
  const leadingBlanks = days[0]?.date ? (new Date(`${days[0].date}T12:00:00`).getDay() + 6) % 7 : 6;
  const selectedColor = selected?.volatility === "low" ? colors.positive : selected?.volatility === "amber" ? colors.warning : colors.negative;
  const selectedRiskSeries = useMemo(() => selected ? riskSeries(selected, selectedColor) : [], [selected, selectedColor]);
  const { strip: tabStrip, rows: tabRows } = usePaneTabs({
    tabs: [{ value: "outlook", label: "16-DAY OUTLOOK" }, { value: "stress", label: "TEMPERATURE STRESS" }, { value: "history", label: "MODEL HISTORY" }],
    activeValue: view,
    onSelect: (value) => setView(value as "outlook" | "stress" | "history"),
    focused,
    compact: true,
  });
  useVicPowerPaneStatus("vic-power:demand-price", live, focused, view === "history" ? "history" : view === "stress" ? "market" : "weather");
  const selectedIndex = selected ? days.indexOf(selected) : -1;
  usePaneFooter("vic-power:calendar-days", () => ({ hints: view === "outlook" && selected ? [
    { id: "previous-day", key: "[", label: "previous day", disabled: selectedIndex <= 0,
      onPress: () => { const day = days[selectedIndex - 1]; if (day) setSelectedDate(day.date ?? String(day.day)); } },
    { id: "next-day", key: "]", label: "next day", disabled: selectedIndex >= days.length - 1,
      onPress: () => { const day = days[selectedIndex + 1]; if (day) setSelectedDate(day.date ?? String(day.day)); } },
  ] : [] }), [view, selected, selectedIndex, days, setSelectedDate]);

  if (view === "history") return <Box width={width} height={height} flexDirection="column" {...FILL_REST}>
    {tabStrip}<DemandHistoryPane width={width} height={Math.max(0,height-tabRows)} focused={focused} />
  </Box>;

  if (!selected || (view === "stress" && !live.data?.market.length)) return (
    <Box width={width} height={height} flexDirection="column">
      {tabStrip}
      <PaneStatusBody loading={live.loading} error={live.error} empty subject="Weather and load data" emptyTitle="No weather or market baseline available." retry={{ onRetry: live.reload }} />
    </Box>
  );

  if (view === "outlook") {
    return (
      <Box width={width} height={height} flexDirection="column" {...FILL_REST}>
        {tabStrip}
        {!live.demoMode && <DayAheadDemand width={width} focused={focused} selectedDate={selected.date} />}
        <ScrollBox width={width} height={Math.max(0, height - tabRows - (live.demoMode ? 0 : width < 55 ? 3 : width < 110 ? 2 : 1))} flexDirection="column" {...FILL_REST} paddingX={1} paddingY={1}>
          <Box flexDirection="row" flexWrap="wrap" style={{ gap: "var(--power-space-md)", marginBottom: "var(--power-space-sm)" }}>
            <Badge label="LOW <30" tone="positive" /><Badge label="AMBER 30–59" tone="warning" /><Badge label="HIGH ≥60" tone="negative" />
          </Box>
          <Box data-power-role="trader-calendar" style={{ display: "grid", gridTemplateColumns: `repeat(${calendarColumns}, minmax(0, 1fr))`, gap: "var(--power-space-sm)" }}>
            {calendarColumns === 7 ? ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => <Text key={day} fg={colors.textDim} attributes={TextAttributes.BOLD}>{day}</Text>) : null}
            {calendarColumns === 7 ? Array.from({ length: leadingBlanks }, (_, index) => <Box key={`blank:${index}`} />) : null}
            {days.map((day) => <TraderDayCard key={day.date ?? day.day} day={day} barWidth={Math.max(2, Math.min(8, Math.floor((width - 2) / calendarColumns) - 3))} selected={(day.date ?? String(day.day)) === (selected.date ?? String(selected.day))} onPress={() => setSelectedDate(day.date ?? String(day.day))} />)}
          </Box>
          <Box marginTop={1}>
            <SectionHeading title={selected.date
              ? new Date(`${selected.date}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long", month: "long", day: "numeric" })
              : `Day ${selected.day}`} />
            <KeyValueRow label="Forecast" value={`${selected.low}° / ${selected.high}°`} />
            <KeyValueRow label="Weather-load score" value={`${selected.riskScore ?? 0} / 100 · ${riskLabel(selected.volatility)}`} tone={riskTone(selected.volatility)} />
            <KeyValueRow label="Peak risk window" value={selected.riskWindow ?? "—"} tone={riskTone(selected.volatility)} />
            {(selected.hours?.length ?? 0) > 0 ? (
              <CompositeChart series={selectedRiskSeries} panels={RISK_PANELS} width={width - 2} height={12} focused={false}
                navigable={false} showLegend showTimeAxis timeZone={WEATHER_TIME_ZONE} formatValue={(value, entry) => `${value.toFixed(1)} ${entry.unit}`} />
            ) : null}
            <SectionHeading title="Score drivers" marginTop={1} />
            {(selected.drivers ?? []).filter((driver) => driver.points > 0).toSorted((a, b) => b.points - a.points).map((driver) => (
              <Box key={driver.id} flexDirection="row" alignItems="center" style={{ gap: "var(--power-space-sm)" }}>
                <Box flexGrow={1} minWidth={0}><Text fg={colors.textDim} wrapText>{driver.label}</Text></Box>
                <RatioBar ratio={driver.points / Math.max(100, selected.rawRiskScore ?? 100)} width={14} color={selectedColor} track />
                <Text fg={colors.text}>{`+${driver.points.toFixed(1)} pts`}</Text>
              </Box>
            ))}
            {(selected.rawRiskScore ?? 0) > 100 ? <KeyValueRow label="Raw score / displayed cap" value={`${selected.rawRiskScore!.toFixed(1)} / 100`} /> : null}
            <SectionHeading title="Weather context" marginTop={1} />
            {(selected.reasons ?? [selected.note]).map((reason) => <Text key={reason} fg={colors.textDim} wrapText>{`• ${reason}`}</Text>)}
            <Box marginTop={1}><Button label="Stress selected day" variant="ghost" compact onPress={() => setView("stress")} /></Box>
          </Box>
        </ScrollBox>
      </Box>
    );
  }

  const baseline = live.data?.market ?? [];
  const base = vicMarketPoints(0, baseline);
  const scenario = vicMarketPoints(delta, baseline);
  const series = [
    ...seriesForScenario(0, colors, " baseline", baseline).map((entry) => ({ ...entry, color: colors.textDim })),
    ...seriesForScenario(delta, colors, " scenario", baseline),
  ];
  const peakScenario = scenario.reduce((peak, point) => point.demand > peak.demand ? point : peak, scenario[0]!);
  const demandVariance = Math.max(...scenario.map((point) => point.demand)) - Math.max(...base.map((point) => point.demand));
  const priceVariance = Math.max(...scenario.map((point) => point.price)) - Math.max(...base.map((point) => point.price));
  const stats: StatItem[] = [
    { label: "Selected forecast", value: `${selected.low}° / ${selected.high}°` },
    { label: "Scenario maximum", value: `${(selected.high + delta).toFixed(1)}°C`, tone: Math.abs(delta) >= 5 ? "negative" : Math.abs(delta) >= 2 ? "warning" : undefined },
    { label: "Peak demand change", value: `${signed(demandVariance)} MW`, color: colors.borderFocused },
    { label: "Peak price change", value: `${signed(priceVariance, 2)} $/MWh`, tone: priceVariance >= 0 ? "warning" : "positive" },
    { label: "Scenario peak", value: `${Math.round(peakScenario.demand).toLocaleString()} MW`, detail: (peakScenario.timestamp?.slice(11, 16) ?? `${String(peakScenario.hour).padStart(2, "0")}:00`) + " AEST" },
    { label: "Risk window", value: selected.riskWindow ?? "—", detail: "Melbourne", tone: riskTone(selected.volatility) },
  ];
  const chartHeight = Math.max(6, height - tabRows - statGridRows(stats, width) - 4);
  return (
    <Box width={width} height={height} flexDirection="column">
      {tabStrip}
      <Box paddingX={1} paddingY={1} flexShrink={0}>
        <Box flexDirection="row" alignItems="flex-end" flexWrap="wrap" style={{ gap: "var(--power-space-sm)" }}>
          <Box flexGrow={1} minWidth={0}>
            <SliderField label="Selected-day maximum temperature" value={delta} min={-8} max={8} step={0.5}
              formatValue={(value) => `${(selected.high + value).toFixed(1)}°C (${signed(value, 1)}°)`} onChange={setDelta} />
          </Box>
          <Button label="Reset assumption" variant="ghost" compact disabled={delta === 0} onPress={() => setDelta(0)} />
        </Box>
      </Box>
      <StatGrid items={stats} width={width} />
      <CompositeChart wrapLegendLabels series={series} panels={MARKET_PANELS} width={width} height={chartHeight} focused={focused}
        navigable={false} showLegend showTimeAxis timeZone={NEM_TIME_ZONE} formatValue={(value, entry) => `${entry.unit === "$/MWh" ? value.toFixed(2) : Math.round(value)} ${entry.unit}`} />
      <Box paddingX={1}><Text fg={colors.textMuted} wrapText>Temperature change applied to the latest VIC demand and price shape.</Text></Box>
    </Box>
  );
}

function regionLabel(regionId: string): string {
  return ({ NSW1: "NSW", QLD1: "QLD", SA1: "SA", TAS1: "TAS", VIC1: "VIC" } as Record<string, string>)[regionId] ?? regionId;
}

function OpportunityRow({ vic, region }: { vic: RegionalMarketSnapshot; region: RegionalMarketSnapshot }) {
  const colors = useThemeColors();
  const spread = vic.price - region.price;
  const direction = spread >= 0 ? `${regionLabel(region.regionId)} lower than VIC` : `VIC lower than ${regionLabel(region.regionId)}`;
  const tone: "negative" | "warning" | "positive" = Math.abs(spread) >= 100 ? "negative" : Math.abs(spread) >= 30 ? "warning" : "positive";
  const toneColor = tone === "negative" ? colors.negative : tone === "warning" ? colors.warning : colors.positive;
  return (
    <Box style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr)", gap: "var(--power-space-md)", padding: "var(--power-space-xs) 0",
      borderBottom: `1px solid ${colors.border}` }}>
      <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{regionLabel(region.regionId)}</Text>
      <Text fg={toneColor} wrapText>{`${signed(spread, 2)}`}</Text>
      <Text fg={colors.text} wrapText>{`$${region.price.toFixed(2)}`}</Text>
      <Text fg={colors.textDim} wrapText>{direction}</Text>
    </Box>
  );
}

function addFiveMinutes(timestamp: string): string {
  const date = chartDate(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(11, 16);
  date.setUTCMinutes(date.getUTCMinutes() + 5);
  return new Date(date.getTime() + 10 * 3_600_000).toISOString().slice(11, 16);
}

function regionalSpotChart(
  points: readonly RegionalPricePoint[],
  colors: ReturnType<typeof useThemeColors>,
): { series: ResolvedSeries[]; windows: SeparationWindow[] } {
  const rows = regionalDispatches(points);
  const windows = separationWindows(rows);
  const arbitrageTimes = new Set(windows.flatMap((window) => window.timestamps));
  const regionColors: Record<RegionalPricePoint["regionId"], string> = {
    VIC1: colors.warning,
    NSW1: colors.borderFocused,
    SA1: colors.positive,
  };
  const series = SPOT_REGIONS.flatMap((region): ResolvedSeries[] => {
    const base = staticSeries(rows.map((point) => scalarPoint(chartDate(point.timestamp), point.prices[region] ?? null)), {
      id: `regional-price:${region}`,
      label: region.replace("1", ""),
      color: blendHex(regionColors[region], colors.bg, 0.48),
      calendarSpaced: true,
    });
    const highlight = staticSeries(rows.map((point) => scalarPoint(chartDate(point.timestamp), arbitrageTimes.has(point.timestamp) ? point.prices[region] ?? null : null)), {
      id: `regional-price:${region}:separation`,
      label: `${region.replace("1", "")} separation`,
      color: regionColors[region],
      calendarSpaced: true,
    });
    return [base, highlight].map((entry) => ({ ...entry, panelId: "regional-price", unit: "$/MWh", unitGroup: "regional-spot" }));
  });
  const spreads = (["NSW1", "SA1"] as const).map((region) => ({
    ...staticSeries(rows.map((row) => scalarPoint(chartDate(row.timestamp),
      row.prices.VIC1 === undefined || row.prices[region] === undefined ? null : row.prices.VIC1 - row.prices[region]!)), {
      id: `regional-spread:${region}`, label: `VIC − ${regionLabel(region)}`, color: regionColors[region], calendarSpaced: true,
    }),
    panelId: "regional-spread", unit: "$/MWh", unitGroup: "regional-spread",
  }));
  return { series: [...series, ...spreads], windows };
}

export function VicSpotArbitragePane({ width, height, focused }: PaneProps) {
  const colors = useThemeColors();
  const live = useVicPowerData();
  useVicPowerPaneStatus("vic-power:arbitrage", live, focused, "market");
  usePaneNoticeFooter({
    registrationId: "vic-power:arbitrage:method",
    focused,
    title: "Regional separation",
    notices: [
      "Bright windows mark a gross cross-region spread of at least $30/MWh for two consecutive dispatch intervals. Losses, constraints and available interconnector capacity are not modelled.",
    ],
  });
  const [focusedArbitrageStart, setFocusedArbitrageStart] = usePluginPaneState<string | null>("regional-arbitrage-focus", null);
  const vic = live.data?.regions.find((region) => region.regionId === "VIC1");
  const alignedRegions = (live.data?.regions ?? []).filter((region) => SPOT_REGIONS.includes(region.regionId as typeof SPOT_REGIONS[number]) && vic && dispatchTime(region.settlementDate) === dispatchTime(vic.settlementDate));
  const connected = alignedRegions.filter((region) => ["NSW1", "SA1"].includes(region.regionId))
    .sort((left, right) => Math.abs((vic?.price ?? 0) - right.price) - Math.abs((vic?.price ?? 0) - left.price));
  const cheapest = alignedRegions.reduce<RegionalMarketSnapshot | null>((best, region) => !best || region.price < best.price ? region : best, null);
  const widest = connected[0];
  const constraintNotice = (live.data?.news ?? []).find((item) => /constraint|inter-regional transfer|settlement residue/i.test(`${item.category} ${item.title} ${item.summary}`));
  const stats: StatItem[] = [
    { label: "VIC1 RRP", value: vic ? `$${vic.price.toFixed(2)}` : "—", tone: "warning" },
    { label: "Lowest matched RRP", value: cheapest ? `${regionLabel(cheapest.regionId)} $${cheapest.price.toFixed(2)}` : "—" },
    { label: "Widest spread", value: widest && vic ? `${regionLabel(widest.regionId)} ${signed(vic.price - widest.price, 0)}` : "—", detail: "$/MWh" },
    { label: "VIC net flow", value: vic?.netInterchange != null ? `${signed(vic.netInterchange)} MW` : "—" },
  ];
  const spotChart = useMemo(() => regionalSpotChart(live.data?.regionalMarket ?? [], colors), [colors, live.data?.regionalMarket]);
  const focusedArbitrageWindow = spotChart.windows.find((window) => window.start === focusedArbitrageStart) ?? null;
  const chartViewport = useMemo(() => {
    if (!focusedArbitrageWindow) return undefined;
    const start = chartDate(focusedArbitrageWindow.start);
    const end = chartDate(focusedArbitrageWindow.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
    start.setUTCMinutes(start.getUTCMinutes() - 10);
    end.setUTCMinutes(end.getUTCMinutes() + 15);
    return { start, end };
  }, [focusedArbitrageWindow]);
  // Reserve the current comparison table first; a short trader pane omits the history band.
  const chartHeight = Math.max(0, Math.min(26, Math.floor(height * 0.55), height - statGridRows(stats, width) - 9));
  if (!vic) return <PaneStatusBody loading={live.loading} error={live.error} empty subject="Regional prices" emptyTitle="No regional prices available." retry={{ onRetry: live.reload }} width={width} height={height} />;
  return (
    <Box width={width} height={height} flexDirection="column" position="relative">
      {chartHeight >= 6 ? <QueryBar width={width} filters={[{ id: "separation-window", label: "Window", value: focusedArbitrageStart ?? "session", defaultValue: "session",
        options: [{ value: "session", label: "Full session" }, ...spotChart.windows.map((window) => ({ value: window.start,
          label: `${window.start.slice(11, 16)}–${addFiveMinutes(window.end)} · avg $${window.averageDispersion.toFixed(0)} · max $${window.maximumDispersion.toFixed(0)}` }))],
        onChange: (value: string) => setFocusedArbitrageStart(value === "session" ? null : value),
      }]} /> : null}
      <StatGrid items={stats} width={width} />
      {chartHeight >= 6 && spotChart.series.some((entry) => entry.points.length > 1) ? (
        <>
          <Box>
            <CompositeChart series={spotChart.series} panels={SPOT_PANELS} width={width} height={chartHeight} focused={focused}
              legendSeries={spotChart.series.filter((entry) => !entry.id.endsWith(":separation"))}
              levels={{ seriesId: "regional-spread:NSW1", items: [{ id: "zero", value: 0, color: colors.textDim, label: "Parity", dashed: true, editable: false, actionable: false }] }}
              navigable viewport={chartViewport} viewportResetKey={focusedArbitrageWindow?.start ?? "full-session"}
              showLegend showTimeAxis timeZone={NEM_TIME_ZONE} formatValue={(value) => `$${value.toFixed(2)}`} />
          </Box>
          <Box paddingX={1} flexDirection="row" flexWrap="wrap" style={{ gap: "var(--power-space-sm)" }}>
            <Badge label="BRIGHT = PRICE SEPARATION" tone="warning" />
            {!spotChart.windows.length ? <Text fg={colors.textDim}>No sustained regional spread above $30/MWh in the loaded session.</Text> : null}
          </Box>
        </>
      ) : null}
      <ScrollBox flexGrow={1} minHeight={0} flexDirection="column" paddingX={1} paddingY={1} style={{ gap: "var(--power-space-sm)" }}>
        <SectionHeading title="REGIONAL SPREAD MONITOR" />
        <Box style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr)", gap: "var(--power-space-md)", paddingBottom: "var(--power-space-xs)",
          borderBottom: `1px solid ${colors.borderFocused}` }}>
          {['REGION', 'VIC SPREAD', 'RRP', 'RELATION'].map((label) => <Text key={label} fg={colors.textMuted} attributes={TextAttributes.BOLD} wrapText>{label}</Text>)}
        </Box>
        {connected.map((region) => <OpportunityRow key={region.regionId} vic={vic} region={region} />)}
        {connected.length < 2 ? <Text fg={colors.warning}>A matching dispatch price is unavailable for {connected.length ? "one neighbour" : "both neighbours"}.</Text> : null}
        {constraintNotice ? (
          <Box flexDirection="row" style={{ gap: "var(--power-space-sm)", padding: "var(--power-space-sm) 0" }}>
            <Badge label="CONSTRAINT" tone="warning" />
            <Text fg={colors.warning} wrapText>{constraintNotice.title}</Text>
          </Box>
        ) : null}
      </ScrollBox>
    </Box>
  );
}
