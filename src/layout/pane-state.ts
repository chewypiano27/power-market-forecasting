import type { PaneRuntimeState } from "../core/state/app/state";

export function getPluginPaneStateValue<T>(
  paneState: PaneRuntimeState | undefined,
  pluginId: string,
  key: string,
  fallback: T,
): T {
  return (paneState?.pluginState?.[pluginId]?.[key] as T | undefined) ?? fallback;
}
