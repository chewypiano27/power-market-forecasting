export const REALIZED_VOLATILITY_WINDOWS = [10, 20, 30, 60, 90, 180, 260] as const;

export const REALIZED_VOLATILITY_ESTIMATORS = [
  "close-to-close", "parkinson", "garman-klass", "rogers-satchell", "yang-zhang",
] as const;
export type RealizedVolatilityEstimator = typeof REALIZED_VOLATILITY_ESTIMATORS[number];

export function isRealizedVolatilityEstimator(value: unknown): value is RealizedVolatilityEstimator {
  return REALIZED_VOLATILITY_ESTIMATORS.some((estimator) => estimator === value);
}
