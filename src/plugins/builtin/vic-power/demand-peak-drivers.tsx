import { t } from "../../../i18n";
import { useAppLanguage } from "../../../i18n/react";
import { useThemeColors } from "../../../theme/theme-context";
import { Box, Text, TextAttributes } from "../../../ui";
import { peakCalculationSteps } from "./demand-peak-calculation";
import type { PeakResult } from "./demand-peak";

/** A compact arithmetic view of the existing model; bar lengths use MW, with a shared zero. */
export function DemandPeakDrivers({ forecast }: { forecast: Extract<PeakResult, { status: "ready" }> }) {
  useAppLanguage();
  const colors = useThemeColors(), calculation = peakCalculationSteps(forecast);
  const largest = Math.max(1, ...calculation.steps.map(step => Math.abs(step.mw)));
  const mw = (value: number) => `${value.toLocaleString("en-AU")} MW`;
  return <Box flexDirection="column" marginTop={1} data-power-role="peak-calculation">
    <Box flexDirection="row" flexWrap="wrap" style={{ gap: "var(--power-space-sm)" }}>
      <Text fg={colors.textDim}>{t(calculation.startLabel)}</Text><Text fg={colors.textBright}>{mw(calculation.startMw)}</Text>
      <Text fg={colors.textDim}>→</Text><Text fg={colors.textDim}>{t("Peak forecast")}</Text>
      <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{mw(calculation.peakMw)}</Text>
    </Box>
    {calculation.steps.map(step => <Box key={step.label} flexDirection="row" alignItems="center" height={1}>
      <Box width={19} flexShrink={0}><Text fg={colors.textDim}>{t(step.label)}</Text></Box>
      <Box flexDirection="row" flexGrow={1} minWidth={0} height={1} aria-hidden="true">
        <Box flexBasis="50%" flexDirection="row" justifyContent="flex-end" style={{ borderRight: `1px solid ${colors.textMuted}` }}>
          <Box width={`${step.mw < 0 ? -step.mw / largest * 100 : 0}%`} height={1} backgroundColor={colors.borderFocused} />
        </Box>
        <Box flexBasis="50%"><Box width={`${step.mw > 0 ? step.mw / largest * 100 : 0}%`} height={1} backgroundColor={colors.warning} /></Box>
      </Box>
      <Box width={13} flexShrink={0} alignItems="flex-end"><Text fg={colors.textBright}>{`${step.mw > 0 ? "+" : ""}${mw(step.mw)}`}</Text></Box>
    </Box>)}
  </Box>;
}
