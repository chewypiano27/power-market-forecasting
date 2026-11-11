import type { Dispatch } from "react";
import type { PluginRegistry } from "../../plugins/registry";
import { saveConfigImmediately } from "../../state/config-save-scheduler";
import type { AppAction, AppState } from "../../state/app/context";

export function bindPluginRegistryRuntimeAccess({ dispatch, pluginRegistry, stateRef }: {
  dispatch: Dispatch<AppAction>;
  pluginRegistry: PluginRegistry;
  stateRef: { current: AppState };
}) {
  const setPluginConfigValues = async (pluginId: string, values: Record<string, unknown>) => {
    const currentConfig = stateRef.current.config;
    const nextConfig = {
      ...currentConfig,
      pluginConfig: {
        ...currentConfig.pluginConfig,
        [pluginId]: {
          ...(currentConfig.pluginConfig[pluginId] ?? {}),
          ...values,
        },
      },
    };
    dispatch({ type: "SET_CONFIG", config: nextConfig });
    await saveConfigImmediately(nextConfig);
    pluginRegistry.events.emit("config:changed", { config: nextConfig });
  };

  pluginRegistry.bindHost({
    getConfig: () => stateRef.current.config,
    getPaneRuntimeState: (paneId) => stateRef.current.paneState[paneId] ?? null,
    updatePaneRuntimeState: (paneId, patch) => {
      dispatch({ type: "UPDATE_PANE_STATE", paneId, patch });
    },

    setPluginConfigValue: async (pluginId, key, value) => {
      await setPluginConfigValues(pluginId, { [key]: value });
    },
    setPluginConfigValues,
    deletePluginConfigValue: async (pluginId, key) => {
      const currentConfig = stateRef.current.config;
      const currentPluginConfig = currentConfig.pluginConfig[pluginId];
      if (!currentPluginConfig || !(key in currentPluginConfig)) return;

      const nextPluginConfig = { ...currentPluginConfig };
      delete nextPluginConfig[key];

      const nextAllPluginConfig = { ...currentConfig.pluginConfig };
      if (Object.keys(nextPluginConfig).length === 0) {
        delete nextAllPluginConfig[pluginId];
      } else {
        nextAllPluginConfig[pluginId] = nextPluginConfig;
      }

      const nextConfig = {
        ...currentConfig,
        pluginConfig: nextAllPluginConfig,
      };
      dispatch({ type: "SET_CONFIG", config: nextConfig });
      await saveConfigImmediately(nextConfig);
      pluginRegistry.events.emit("config:changed", { config: nextConfig });
    },

  });
}
