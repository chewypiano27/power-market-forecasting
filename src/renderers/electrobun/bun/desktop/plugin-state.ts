import type { PluginRegistry } from "../../../../plugins/registry";
import type { DesktopPluginStateRequest, DesktopPluginStateSetEntry } from "../../shared/protocol";

interface PluginStateBackendStore {
  setMany(entries: DesktopPluginStateSetEntry[]): void;
  delete(pluginId: string, key: string): void;
}

function normalizePluginStateSetEntry(entry: unknown): DesktopPluginStateSetEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  if (typeof record.pluginId !== "string" || typeof record.key !== "string") return null;
  return {
    pluginId: record.pluginId,
    key: record.key,
    value: record.value,
    schemaVersion: typeof record.schemaVersion === "number" ? record.schemaVersion : undefined,
  };
}

export function handleDesktopPluginStateRequest(
  store: PluginStateBackendStore,
  request: DesktopPluginStateRequest,
): null {
  switch (request.method) {
    case "pluginState.setMany": {
      const entries = Array.isArray(request.payload.entries)
        ? request.payload.entries.flatMap((entry) => {
            const normalized = normalizePluginStateSetEntry(entry);
            return normalized ? [normalized] : [];
          })
        : [];
      store.setMany(entries);
      return null;
    }
    case "pluginState.delete": {
      const { pluginId, key } = request.payload;
      store.delete(pluginId, key);
      return null;
    }
    default: {
      const exhaustive: never = request;
      throw new Error(`Unknown plugin state method: ${String(exhaustive)}`);
    }
  }
}

function pluginStateIds(registry: PluginRegistry): string[] {
  const store = registry.persistence.pluginState as { pluginIds?: () => string[] };
  const storedIds = typeof store.pluginIds === "function" ? store.pluginIds() : [];
  return [...new Set([...registry.allPlugins.keys(), ...storedIds])];
}

export function loadDesktopPluginState(registry: PluginRegistry): Record<string, Record<string, unknown>> {
  const state: Record<string, Record<string, unknown>> = {};
  for (const pluginId of pluginStateIds(registry)) {
    const keys = registry.persistence.pluginState.keys(pluginId);
    if (keys.length === 0) continue;
    state[pluginId] = {};
    for (const key of keys) {
      const record = registry.persistence.pluginState.get(pluginId, key);
      if (record) state[pluginId]![key] = record.value;
    }
  }
  return state;
}
