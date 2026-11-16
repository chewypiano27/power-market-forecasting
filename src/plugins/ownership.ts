/** Apply explicit plugin switches without aliases for plugins absent from this workstation. */
export function applyPluginToggles(
  disabledPlugins: readonly string[],
  changes: Readonly<Record<string, boolean>>,
): string[] | null {
  let next = [...disabledPlugins];
  for (const [pluginId, enabled] of Object.entries(changes)) {
    if (enabled) next = next.filter((entry) => entry !== pluginId);
    else if (!next.includes(pluginId)) next.push(pluginId);
  }
  return next.length === disabledPlugins.length
    && next.every((pluginId, index) => pluginId === disabledPlugins[index]) ? null : next;
}

/** Retain explicit ids in persisted settings, without retired financial-plugin groups. */
export function normalizeBuiltinDisabledPluginIds(pluginIds: readonly string[]): string[] {
  return [...new Set(pluginIds)];
}

export const expandBuiltinPluginGroups = normalizeBuiltinDisabledPluginIds;
export const encodeBuiltinDisabledPluginIds = normalizeBuiltinDisabledPluginIds;

/** Preserve each plugin's own state namespace when reading existing settings. */
export function normalizeBuiltinPluginStateMap(
  value: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value).map(([id, state]) => [id, { ...state }]));
}

function isPluginStateMap(value: unknown): value is Record<string, Record<string, unknown>> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every((entry) => !!entry && typeof entry === "object" && !Array.isArray(entry));
}

export function normalizeBuiltinPaneStatePluginOwners(
  paneState: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(paneState).map(([paneId, state]) => [paneId,
    isPluginStateMap(state.pluginState)
      ? { ...state, pluginState: normalizeBuiltinPluginStateMap(state.pluginState) }
      : state,
  ]));
}
