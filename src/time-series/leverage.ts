/** A daily objective a fund can have: 3 (TQQQ), -3 (SQQQ), 1.5 (UVXY), -0.5. */
export function isLeverageFactor(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 && Math.abs(value) <= 5;
}
