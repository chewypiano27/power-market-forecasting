import { useAppLanguage } from "../../../i18n/react";
import { t, tf } from "../../../i18n";
import { SectionHeading } from "../../../components/ui/display";
import { useThemeColors } from "../../../theme/theme-context";
import { Box, Text, TextAttributes } from "../../../ui";
import type { RiskDriver } from "./weather-risk";

const EXPLANATIONS: Record<string, string> = {
  deviation: "Difference from the monthly reference high.",
  range: "Daily temperature range above 8°C.",
  wind: "Hourly wind above 25 km/h.",
  humidity: "Hourly humidity above 80%.",
  rain: "Forecast rainfall accumulated over the day.",
  ramp: "Temperature changes above 2°C between consecutive hours.",
  window: "The strongest continuous three-hour weather load.",
};
const DRIVER_ORDER = ["deviation", "range", "wind", "humidity", "rain", "ramp", "window"];

/** Shares describe contributions to a heuristic score, not event probabilities. */
export function scoreDriverShares(drivers: readonly RiskDriver[]) {
  const active = drivers.filter(driver => Number.isFinite(driver.points) && driver.points > 0)
    .toSorted((a, b) => b.points - a.points);
  const total = active.reduce((sum, driver) => sum + driver.points, 0);
  return { total, entries: active.map(driver => ({ ...driver, share: driver.points / total })) };
}

export function ScoreDrivers({ drivers, score }: { drivers: readonly RiskDriver[]; score: number | undefined }) {
  useAppLanguage();
  const colors = useThemeColors();
  const { total, entries } = scoreDriverShares(drivers);
  const palette = [colors.warning, colors.borderFocused, colors.positive, colors.negative, colors.textDim, colors.textBright, colors.textMuted];
  const colorFor = (id: string) => palette[Math.max(0, DRIVER_ORDER.indexOf(id))]!;
  const points = (value: number) => tf("{value} pts", { value: value.toFixed(1) });
  const largest = entries[0];
  return <Box flexDirection="column" marginTop={1} style={{ gap: "var(--power-space-sm)" }} data-power-role="score-drivers">
    <SectionHeading title="Score drivers" />
    {!drivers.length ? <Text fg={colors.textDim} wrapText>{t("Score breakdown unavailable.")}</Text> : <>
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" style={{ gap: "var(--power-space-sm)" }}>
        <Text fg={colors.textDim}>{t("Sum of drivers")}</Text>
        <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{points(total)}</Text>
        <Text fg={colors.textDim}>→</Text>
        <Text fg={colors.textDim}>{t("Displayed score")}</Text>
        <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{score === undefined ? "—" : `${score} / 100`}</Text>
      </Box>
      <Text fg={colors.textMuted} wrapText>{t(total > 100
        ? "The score is capped at 100. The shares below use the uncapped total."
        : "The raw total is rounded to give the displayed score.")}</Text>
      {largest ? <>
        <Text fg={colors.textBright} wrapText>{tf("Largest driver: {driver} · {share}% of the raw total", {
          driver: t(largest.label), share: (largest.share * 100).toFixed(1),
        })}</Text>
        <Box flexDirection="row" width="100%" height={1} overflow="hidden" role="img"
          aria-label={t("Share of raw score; matching colours identify the drivers below.")}
          style={{ borderRadius: "var(--power-radius-sm)", gap: 2 }}>
          {entries.map(driver => <Box key={driver.id} flexGrow={driver.share} flexBasis={0} minWidth={0}
            backgroundColor={colorFor(driver.id)} title={`${t(driver.label)} · ${points(driver.points)} · ${(driver.share * 100).toFixed(1)}%`} />)}
        </Box>
        {entries.map((driver, index) => <Box key={driver.id} flexDirection="column"
          style={{ borderLeft: `3px solid ${colorFor(driver.id)}`, paddingInlineStart: "var(--power-space-sm)" }}>
          <Box flexDirection="row" flexWrap="wrap" style={{ gap: "var(--power-space-sm)" }}>
            <Text fg={colors.textDim}>{`${index + 1}.`}</Text>
            <Box flexGrow={1} minWidth={0}><Text fg={colors.textBright} attributes={TextAttributes.BOLD} wrapText>{t(driver.label)}</Text></Box>
            <Text fg={colors.textBright}>{`+${points(driver.points)}`}</Text>
            <Text fg={colors.textDim}>{tf("{share}% of raw total", { share: (driver.share * 100).toFixed(1) })}</Text>
          </Box>
          <Text fg={colors.textDim} wrapText>{t(EXPLANATIONS[driver.id] ?? driver.label)}</Text>
        </Box>)}
      </> : <Text fg={colors.textDim} wrapText>{t("No contributing weather drivers.")}</Text>}
      <Text fg={colors.textMuted} wrapText>{t("Weather stress indicator.")}</Text>
    </>}
  </Box>;
}
