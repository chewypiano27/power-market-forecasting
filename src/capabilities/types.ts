import type { ChartViewportSpec, SeriesStyle, SeriesTransform } from "../time-series/types";

export interface CapabilitySchema<T = unknown> {
  parse(value: unknown): T;
}

export interface ChartSeriesCatalogItem {
  seriesId: string;
  label: string;
  description?: string;
  detail?: string;
  style?: SeriesStyle;
  transform?: SeriesTransform;
}

export interface ChartSeriesCatalogRequest {
  query?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface ChartSeriesResolveRequest {
  seriesId: string;
  viewport: ChartViewportSpec;
  signal?: AbortSignal;
}

export const recordSchema: CapabilitySchema<Record<string, unknown>> = {
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  },
};
