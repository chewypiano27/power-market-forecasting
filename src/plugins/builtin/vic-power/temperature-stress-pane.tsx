import { useCallback, useEffect, useState } from "react";
import { Button, PaneStatusBody, SliderField, StatGrid } from "../../../components";
import { useAsyncResource } from "../../../public/react";
import { Box, ScrollBox, Text } from "../../../ui";
import { t } from "../../../i18n";
import { useThemeColors } from "../../../theme/theme-context";
import { FILL_REST } from "../../../components/ui/fill";
import { latestPeakTarget, peakModel } from "./demand-peak-service";
import { fetchTemperatureInputs, temperaturePeakScenario } from "./demand-temperature-scenario";
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
  if (baseline?.status !== "ready" || scenario?.status !== "ready") return <PaneStatusBody loading={inputs.loading} error={inputs.error ?? (scenario && scenario.status !== "ready" ? scenario.reason : null)} empty subject="Temperature sensitivity" emptyTitle="Demand model inputs unavailable" retry={{ onRetry: inputs.reload }} />;
  const format = (mw: number) => `${Math.round(mw).toLocaleString("en-AU")} MW`;
  const change = scenario.peakMw - baseline.peakMw;
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
    <DemandPeakDrivers forecast={scenario} />
    <Box marginTop={1}><Text fg={colors.textDim} wrapText>{t("Changes every forecast hour by the selected temperature amount. Other model inputs stay fixed.")}</Text></Box>
  </ScrollBox>;
}
