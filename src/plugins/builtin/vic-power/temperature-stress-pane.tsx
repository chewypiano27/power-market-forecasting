import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, CompositeChart, PaneStatusBody, SliderField, StatGrid, scalarPoint, staticSeries } from "../../../components";
import { useAsyncResource } from "../../../public/react";
import { Box, ScrollBox, Text } from "../../../ui";
import { t } from "../../../i18n";
import { useThemeColors } from "../../../theme/theme-context";
import { FILL_REST } from "../../../components/ui/fill";
import { latestPeakTarget, peakModel } from "./demand-peak-service";
import { fetchTemperatureInputs, temperaturePeakScenario, temperatureHourlyProfile } from "./demand-temperature-scenario";
import { NEM_TIME_ZONE } from "./analytics";
import { DemandPeakDrivers } from "./demand-peak-drivers";

export function TemperatureStressPane({ width, height, delta, onChange }: { width: number; height: number; delta: number; onChange: (value: number) => void }) {
  const colors = useThemeColors();
  const [target, setTarget] = useState(() => latestPeakTarget(Date.now()));
  useEffect(() => { const timer = setInterval(() => setTarget(latestPeakTarget(Date.now())), 30_000); return () => clearInterval(timer); }, []);
  const loader = useCallback(() => {
    if (!peakModel) return Promise.reject(new Error("Peak demand model unavailable"));
    return fetchTemperatureInputs(target, peakModel);
  }, [target]);
  const inputs = useAsyncResource(loader);
  const baseline = inputs.data && peakModel ? temperaturePeakScenario(peakModel, target, inputs.data, Date.now(), 0) : null;
  const scenario = inputs.data && peakModel ? temperaturePeakScenario(peakModel, target, inputs.data, Date.now(), delta) : null;
  const curve = useMemo(() => {
    const model = peakModel;
    if (!inputs.data || !model) return [];
    const now = Date.now();
    return Array.from({ length: 33 }, (_, index) => {
      const offset = -8 + index * 0.5;
      const result = temperaturePeakScenario(model, target, inputs.data!, now, offset);
      return { offset, peakMw: result.status === "ready" ? result.peakMw : null };
    });
  }, [inputs.data, target]);
  if (baseline?.status !== "ready" || scenario?.status !== "ready") return <PaneStatusBody loading={inputs.loading} error={inputs.error ?? (scenario && scenario.status !== "ready" ? scenario.reason : null)} empty subject="Temperature sensitivity" emptyTitle="Demand model inputs unavailable" retry={{ onRetry: inputs.reload }} />;
  const format = (mw: number) => `${Math.round(mw).toLocaleString("en-AU")} MW`;
  const change = scenario.peakMw - baseline.peakMw;
  // The chart's numeric x axis replaces these internal, evenly spaced date slots.
  const position = (offset: number) => new Date(Date.UTC(2000, 0, 1) + (offset + 8) * 2 * 86_400_000);
  const series = [
    staticSeries(curve.map(point => scalarPoint(position(point.offset), point.peakMw)), {
      id: "temperature-peak", label: "Fitted peak", color: colors.warning,
    }),
    staticSeries(curve.map(point => scalarPoint(position(point.offset), baseline.peakMw)), {
      id: "temperature-baseline", label: "Baseline", color: colors.textDim,
    }),
    staticSeries([scalarPoint(position(delta), scenario.peakMw)], {
      id: "temperature-selected", label: "Selected", color: colors.textBright, style: "points",
    }),
  ].map(entry => ({ ...entry, panelId: "temperature-demand", unit: "MW", unitGroup: "demand" }));
  const chartWidth = Math.max(20, width - 2);
  const chartHeight = Math.max(10, Math.min(14, Math.floor((height - 18) / 2)));
  const hourly = temperatureHourlyProfile(target, inputs.data!, baseline.peakMw, scenario.peakMw);
  const hourlySeries = [
    staticSeries(hourly.map(row => scalarPoint(row.time, row.baselineMw)), { id: "hourly-baseline", label: "Baseline demand", color: colors.warning, calendarSpaced: true }),
    staticSeries(hourly.map(row => scalarPoint(row.time, row.scenarioMw)), { id: "hourly-scenario", label: "Temperature scenario", color: colors.textBright, calendarSpaced: true }),
  ].map(entry => ({ ...entry, panelId: "hourly-demand", unit: "MW", unitGroup: "demand" }));
  return <ScrollBox width={width} height={height} flexDirection="column" {...FILL_REST} paddingX={1} paddingY={1}>
    <Box flexDirection="row" alignItems="flex-end" style={{ gap: "var(--power-space-sm)" }}>
      <Box flexGrow={1}><SliderField label="Forecast temperature change" value={delta} min={-8} max={8} step={0.5} formatValue={value => `${value >= 0 ? "+" : ""}${value.toFixed(1)}°C`} onChange={onChange} /></Box>
      <Button label="Reset assumption" variant="ghost" compact disabled={delta === 0} onPress={() => onChange(0)} />
    </Box>
    <StatGrid width={width} columns={width < 65 ? 1 : 2} items={[
      { label: "Forecast day", value: target, detail: "NEM AEST" },
      { label: "Baseline peak", value: format(baseline.peakMw) },
      { label: "Scenario peak", value: format(scenario.peakMw) },
      { label: "Peak demand change", value: `${change >= 0 ? "+" : ""}${format(change)}` },
    ]} />
    <Box marginTop={1} flexShrink={0} width={chartWidth} height={chartHeight}>
      <CompositeChart width={chartWidth} height={chartHeight} series={series}
        panels={[{ id: "temperature-demand", label: "Peak demand by temperature change" }]}
        navigable={false} showLegend showTimeAxis
        xAxis={{ ticks: [-8, -4, 0, 4, 8].map(value => ({ ratio: (value + 8) / 16,
          label: `${value > 0 ? "+" : ""}${value}°C` })),
          formatCursor: ratio => `${(-8 + ratio * 16).toFixed(1)}°C`,
          markers: [{ id: "selected-temperature", xRatio: (delta + 8) / 16,
            label: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}°C`, color: colors.borderFocused }] }}
        formatValue={format} formatAxisValue={value => Math.round(value).toLocaleString("en-AU")} />
    </Box>
    <Box marginTop={1} flexShrink={0} width={chartWidth} height={chartHeight}>
      <CompositeChart width={chartWidth} height={chartHeight} series={hourlySeries}
        panels={[{ id: "hourly-demand", label: "Hourly demand scenario" }]}
        navigable={false} showLegend showTimeAxis timeZone={NEM_TIME_ZONE}
        lineCueOverrides={new Map([["hourly-scenario", { id: "dotted" as const, dash: [1, 4.5], thickness: 2, glyph: "×", sample: "┈┈" }]])}
        emptyMessage="A complete same-weekday demand profile is unavailable."
        formatValue={format} formatAxisValue={value => Math.round(value).toLocaleString("en-AU")} />
    </Box>
    <Text fg={colors.textDim} wrapText>Same-weekday hourly shape scaled to each modelled daily peak.</Text>
    <DemandPeakDrivers forecast={scenario} />
    <Box marginTop={1}><Text fg={colors.textDim} wrapText>{t("Changes every forecast hour by the selected temperature amount. Other model inputs stay fixed.")}</Text></Box>
  </ScrollBox>;
}
