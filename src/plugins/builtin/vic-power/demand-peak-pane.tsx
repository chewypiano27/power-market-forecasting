import { peakJournalMetrics } from "./demand-peak-journal";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartTableHeader, DataTableView, PaneStatusBody, QueryBar, StatGrid, Badge, scalarPoint, staticSeries, statGridRows, useChartTableSelection, usePaneStatusFooter, type DataTableColumn } from "../../../components";
import { useAsyncResource, useAutoRefresh, usePluginPaneState } from "../../../public/react";
import { usePaneRefreshKey } from "../../../components/data-table/table-pane";
import { useAppLanguage } from "../../../i18n/react";
import { getUiLocale, t, tf } from "../../../i18n";
import { useThemeColors } from "../../../theme/theme-context";
import { Box, Text } from "../../../ui";
import { FILL_REST } from "../../../components/ui/fill";
import type { PaneProps } from "../../../types/plugin";
import { demandDayStart, demandIssue } from "./demand-features";
import { demandDisplay } from "./demand-display";
import { nextDemandTarget } from "./demand-service";
import { getPeakJournal, latestPeakTarget, loadPeakDemand, peakModel } from "./demand-peak-service";
import { validatePeakHistory } from "./demand-peak-history";
import { peakHistoryCandidate as candidate } from "./demand-peak-history-data";

let history: ReturnType<typeof validatePeakHistory> | null = null;
try { history = validatePeakHistory(candidate, peakModel); } catch { /* A mismatched ledger must not appear as candidate performance. */ }
type Row = [string, number, number | null, number];
const rowId = (row: Row) => row[0];
const rowDate = (row: Row) => new Date(demandDayStart(row[0]));
const mw = (value: number) => `${Math.round(value).toLocaleString("en-AU")} MW`;
const columns: DataTableColumn[] = [
  { id: "date", label: "NEM DAY (AEST)", width: 16, align: "left" },
  { id: "forecast", label: "FORECAST MW", width: 18, align: "right" },
  { id: "actual", label: "ACTUAL PEAK MW", width: 18, align: "right" },
  { id: "error", label: "ERROR MW", width: 16, align: "right" },
  { id: "baseline", label: "WEEKLY BASELINE MW", width: 22, flexGrow: 1, align: "right" },
];

export function DemandPeakPane({ width, height, focused }: Pick<PaneProps, "width" | "height" | "focused">) {
  useAppLanguage();
  const colors = useThemeColors();
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const [period, setPeriod] = usePluginPaneState("peak-history-period", "recent");
  const [targetChoice, setTargetChoice] = usePluginPaneState("peak-target", "latest");
  const [selectedId, setSelectedId] = usePluginPaneState<string | null>("peak-history-selection", null);
  const target = targetChoice === "next" ? nextDemandTarget(now) : latestPeakTarget(now);
  const loader = useCallback((force = false) => loadPeakDemand(target, force), [target]);
  const forecast = useAsyncResource(loader);
  useAutoRefresh(forecast.updatedAt, forecast.load, { intervalMs: 60_000 });
  usePaneRefreshKey(forecast.reload, { focused });
  const ready = forecast.data?.status === "ready" && forecast.data.targetDate === target ? forecast.data : null;
  const display = demandDisplay(null, target, target, forecast.loading, true);
  const liveStats = [
    { label: "Peak forecast", value: ready ? mw(ready.peakMw) : forecast.loading ? t("Loading") : t(forecast.data?.status === "pending" ? "Pending" : "Unavailable") },
    { label: "NEM day (AEST)", value: display.forecastDay },
    { label: "Weekly baseline", value: ready ? mw(ready.baselineMw) : "—" },
    { label: "Correction", value: ready ? `${ready.correctionMw >= 0 ? "+" : ""}${mw(ready.correctionMw)}` : "—", detail: ready ? tf("{days} completed days", { days: ready.correctionDays }) : undefined },
    { label: now < Date.parse(demandIssue(target).issueAt) ? `Scheduled (${display.issueZone})` : `Issued (${display.issueZone})`, value: display.issue },
  ];
  const journal = useMemo(() => getPeakJournal(), [forecast.updatedAt]);
  const tracking = period === "live";
  const liveMetrics = peakJournalMetrics(journal);
  usePaneStatusFooter({ registrationId: "vic-power:peak-preview", loading: forecast.loading,
    error: forecast.error ?? (forecast.data?.status === "unavailable" ? forecast.data.reason : null),
    info: [{ id: "peak-scope", parts: [{ text: tracking ? "Live tracking · first saved forecasts · NEM AEST" : "Historical comparison · Jan–Oct 2026 · NEM AEST", tone: "muted" }] }] });
  const rows: Row[] = useMemo(() => period === "live" ? journal.map(entry => [entry.targetDate, entry.peakMw, entry.actualMw ?? null, entry.baselineMw])
    : period === "all" ? history?.rows ?? [] : history?.rows.slice(-30) ?? [], [period, journal]);
  const tableColumns = tracking ? [columns[0]!, { id: "recorded", label: "FORECAST SAVED", width: 30, flexGrow: 1, align: "left" as const }, ...columns.slice(1, 4)] : columns;
  const selectedIndex = Math.max(0, rows.findIndex(row => row[0] === selectedId));
  const selection = useChartTableSelection({ rows, getId: rowId, getDate: rowDate, selectedId: rows[selectedIndex]?.[0] ?? null, onSelect: setSelectedId, focused });
  const series = useMemo(() => ([
    ["Forecast peak demand", 1, colors.warning], ["Actual daily peak MW", 2, colors.textBright], ["Same weekday last week", 3, colors.borderFocused],
  ] as const).map(([label, column, color]) => ({ ...staticSeries(rows.map(row => scalarPoint(rowDate(row), row[column])), {
    id: `peak:${column}`, label, color, calendarSpaced: true,
  }), panelId: "peak", unit: "MW", unitGroup: "demand" })), [rows, colors.warning, colors.textBright, colors.borderFocused]);
  if (!history) return <PaneStatusBody empty subject="Peak demand model" emptyTitle="Peak history unavailable." />;
  const tableHeight = Math.max(6, height - statGridRows(liveStats, width) - 3);
  const note = forecast.data && forecast.data.status !== "ready" ? forecast.data.reason : ready?.inputWarning ?? "Day-ahead issue: 18:00 AEST. Weather inputs use a fixed 48-hour lead.";
  return <Box width={width} height={height} flexDirection="column" {...FILL_REST}>
    <Box paddingX={1} flexShrink={0}>
      <Box flexDirection="row" alignItems="center" style={{ gap: "var(--power-space-sm)" }}>
        <Badge label="LOCAL CANDIDATE" tone="warning" /><Text fg={colors.textDim}>{t("Daily peak demand · MW")}</Text>
      </Box>
      <StatGrid items={liveStats} width={width} />
      <Text fg={forecast.data?.status === "unavailable" || ready?.inputWarning ? colors.warning : colors.textDim} wrapText>{t(note)}</Text>
    </Box>
    <DataTableView<Row> key={tracking ? "live" : "history"} focused={focused} rootWidth={width} rootHeight={tableHeight} emptyStateTitle={tracking ? "No saved forecasts for this model yet." : "No held-out peak forecasts available."} columns={tableColumns} items={rows} getItemKey={rowId} freezeFirstColumn sortColumnId="date" sortDirection="asc"
      resetScrollKey={period} selection={{ kind: "index", selectedIndex: rows.length ? selectedIndex : -1, onChange: index => setSelectedId(rows[index]?.[0] ?? null) }}
      renderCell={(row, column) => {
        const entry = tracking ? journal.find(entry => entry.targetDate === row[0]) : undefined;
        const error = row[2] === null ? null : row[1] - row[2];
        const value = column.id === "forecast" ? row[1] : column.id === "actual" ? row[2] : row[3];
        return { text: column.id === "date" ? row[0]
          : column.id === "recorded" && entry ? `${new Date(entry.recordedAt).toLocaleString(getUiLocale(), { timeZone: "Australia/Melbourne", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${t(entry.beforeTargetDay ? "Before day" : "Late")}`
          : column.id === "error" ? error === null ? "—" : `${error >= 0 ? "+" : ""}${Math.round(error).toLocaleString("en-AU")}`
          : value === null ? t("Pending") : Math.round(value).toLocaleString("en-AU"),
          color: column.id === "error" && error !== null && Math.abs(error) > history!.maeMw ? colors.warning : undefined };
      }}
      rootBefore={<ChartTableHeader width={width} height={tableHeight} tableRows={rows.length} tableColumns={tableColumns}
        query={<QueryBar width={width} filters={[
          { id: "peak-target", label: "Forecast target", value: targetChoice, defaultValue: "latest", options: [{ value: "latest", label: "Latest issued" }, { value: "next", label: "Tomorrow" }], onChange: setTargetChoice },
          { id: "peak-history", label: "Results", value: period, defaultValue: "recent", options: [{ value: "recent", label: "Last 30 test days" }, { value: "all", label: "All test days" }, { value: "live", label: "Live tracking" }], onChange: setPeriod },
        ]} />}
        figures={tracking ? [{ label: "Completed forecasts", value: String(liveMetrics.count) },
          { label: "Live MAE", value: liveMetrics.maeMw === null ? "—" : mw(liveMetrics.maeMw) },
          { label: "Weekly baseline MAE", value: liveMetrics.baselineMaeMw === null ? "—" : mw(liveMetrics.baselineMaeMw) },
          { label: "Mean error", value: liveMetrics.biasMw === null ? "—" : mw(liveMetrics.biasMw) }]
          : [{ label: "Test MAE", value: mw(history.maeMw) }, { label: "Weekly baseline MAE", value: mw(history.baselineMaeMw) }, { label: "Test RMSE", value: mw(history.rmseMw) }, { label: "Mean error", value: mw(history.biasMw) }, { label: "Test days", value: String(history.days), detail: "Jan–Oct 2026" }]}
        chart={{ series, panels: [{ id: "peak", label: "Held-out peak demand MW", height: 1 }], ...selection, timeZone: "Australia/Brisbane", remoteKind: "vic-peak-demand-preview", formatValue: value => mw(value) }} />} />
    <Box paddingX={1} flexShrink={0}><Text fg={colors.textDim} wrapText>{tracking ? t("Refresh keeps the first saved forecast unchanged. Late forecasts do not count toward live accuracy.") : tf("Error band withheld: {coverage}% test coverage against an {target}% target.", { coverage: Math.round(history.bandCoverage * 100), target: history.bandTarget * 100 })}</Text></Box>
  </Box>;
}
