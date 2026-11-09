import type { ChangeEvent } from "react";
import { useThemeColors } from "../../theme/theme-context";
import { Box, Text, TextAttributes, useUiCapabilities } from "../../ui";
import { NumberField } from "./fields";

export interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}

/** A continuous numeric input. The desktop draws a native range control in the kit's field frame. */
export function SliderField({ label, value, min, max, step, formatValue = String, onChange }: SliderFieldProps) {
  const colors = useThemeColors();
  const native = useUiCapabilities().nativePaneChrome;
  if (!native) {
    return <NumberField label={label} value={String(value)} min={min} max={max} step={step} allowNegative allowDecimal
      onChange={(next) => { const parsed = Number(next); if (Number.isFinite(parsed)) onChange(parsed); }} />;
  }
  return (
    <Box flexDirection="column" data-power-ui="slider-field" style={{ gap: "var(--power-space-xs)" }}>
      <Box flexDirection="row" flexWrap="wrap" style={{ gap: "var(--power-space-xs)" }}>
        <Text fg={colors.textDim} attributes={TextAttributes.BOLD} wrapText>{label}</Text>
        <Box flexGrow={1} />
        <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{formatValue(value)}</Text>
      </Box>
      <input className="power-slider-field" type="range" aria-label={label} value={value} min={min} max={max} step={step}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value))} />
    </Box>
  );
}
