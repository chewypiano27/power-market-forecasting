export interface CachePolicy {
  staleMs: number;
  expireMs: number;
}

interface PersistedResourceMetadata {
  fetchedAt: number;
  staleAt: number;
  expiresAt: number;
  sourceKey: string;
  schemaVersion: number;
}

export interface PersistedResourceValue<T = unknown> extends PersistedResourceMetadata {
  value: T;
  provenance?: unknown | null;
  stale?: boolean;
  expired?: boolean;
}
