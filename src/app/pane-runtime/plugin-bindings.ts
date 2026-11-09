import type { Dispatch } from "react";
import {
  applyPaneSettingFieldValue as applyPaneSettingFieldValueShared,
  createPaneTemplateOrThrow,
} from "../../components/command-bar/workflow/ops";

import { openFormModal } from "../../components/form-modal";
import { t } from "../../i18n";
import { getPanelFocusTarget } from "../../core/state/app/layout";
import { getVisiblePaneCycleOrder } from "../../components/layout/pane/cycle-order";
import {
  collectDisabledPaneIds,
} from "../../components/layout/shell/visible-layout";
import { applyPluginToggles } from "../../plugins/ownership";
import type { LoadedExternalPlugin } from "../../plugins/loader";
import {
  isPaneInLayout,
  removePane,
} from "../../layout/pane-manager";
import type { PluginRegistry } from "../../plugins/registry";
import { PluginOffError, notifyPluginOff } from "../../plugins/plugin-off";

import {
  resolveTickerForPane,
  type AppAction,
  type AppState,
} from "../../state/app/context";
import type {
  LayoutConfig,
  PaneInstanceConfig,
} from "../../types/config";
import { findPaneInstance } from "../../types/config";

import type { PaneDef, PaneSettingField, PaneTemplateCreateOptions, PaneTemplateInstanceConfig } from "../../types/plugin";

import { isDialogOpen } from "../../ui/dialog-stack";

// Registry callbacks are rebound on renders. Request ownership must survive
// that rebinding, while separate source panes retain independent navigation.

interface BindAppPanePluginRegistryOptions {
  activatePane: (paneId: string) => void;
  buildPaneInstance: (paneType: string, options?: {
    title?: string;
    binding?: PaneInstanceConfig["binding"];
    params?: Record<string, string>;
    settings?: Record<string, unknown>;
    instanceId?: string;
  }) => PaneInstanceConfig | null;
  createPaneFromTemplate: (templateId: string, options?: PaneTemplateCreateOptions) => Promise<void>;

  detachedPaneId: string | null;
  dispatch: Dispatch<AppAction>;
  externalPlugins: readonly LoadedExternalPlugin[];
  focusVisiblePane: (paneId: string, layout?: LayoutConfig) => void;
  isDetachedWindow: boolean;
  openPaneSettings: (paneId?: string, options?: { fieldKey?: string }) => Promise<void>;

  persistConfig: (nextConfig: AppState["config"]) => void;
  persistLayout: (layout: LayoutConfig, options?: { pushHistory?: boolean }) => void;
  placePaneInstance: (
    instance: PaneInstanceConfig,
    paneDef: PaneDef,
    options?: PaneTemplateInstanceConfig,
  ) => void;

  pluginRegistry: PluginRegistry;

  resolvePaneTarget: (paneId: string, layout?: LayoutConfig) => string | null;

  showPane: (paneId: string) => void;
  state: AppState;
  stateRef: { current: AppState };

}

export function bindAppPanePluginRegistry({
  activatePane,
  buildPaneInstance,
  createPaneFromTemplate,

  detachedPaneId,
  dispatch,
  externalPlugins,
  focusVisiblePane,
  isDetachedWindow,
  openPaneSettings,

  persistConfig,
  persistLayout,
  placePaneInstance,

  pluginRegistry,

  resolvePaneTarget,

  showPane,
  state,
  stateRef,

}: BindAppPanePluginRegistryOptions): void {
  // Switching plugins never edits the layout: the shell hides a switched-off
  // plugin's panes where they are and shows them again when it comes back.
  // Only focus moves, off a pane that just went hidden.
  const setPluginsEnabled = (changes: Readonly<Record<string, boolean>>) => {
    const current = stateRef.current;
    // Setting a state, not flipping it, so a second "Turn on" from an older
    // toast cannot switch the plugin back off.
    const disabledPlugins = applyPluginToggles(current.config.disabledPlugins ?? [], changes);
    if (!disabledPlugins) return;
    const focused = current.focusedPaneId ? findPaneInstance(current.config.layout, current.focusedPaneId) : undefined;
    const focusHidden = !!focused && collectDisabledPaneIds(pluginRegistry, disabledPlugins).has(focused.paneId);
    dispatch(focusHidden
      ? {
        type: "SET_DISABLED_PLUGINS",
        disabledPlugins,
        focusedPaneId: getVisiblePaneCycleOrder(current.config.layout, pluginRegistry, disabledPlugins)[0] ?? null,
      }
      : { type: "SET_DISABLED_PLUGINS", disabledPlugins });
    const nextConfig = { ...current.config, disabledPlugins };
    persistConfig(nextConfig);
    pluginRegistry.events.emit("config:changed", { config: nextConfig });
  };
  const setPluginEnabled = (pluginId: string, enabled: boolean) => setPluginsEnabled({ [pluginId]: enabled });

  pluginRegistry.bindHost({
    setPluginEnabled,
    setPluginsEnabled,

    switchPanel: (panel) => {
      if (isDetachedWindow) return;
      const paneId = getPanelFocusTarget(stateRef.current.config.layout, panel);
      if (paneId) dispatch({ type: "FOCUS_PANE", paneId });
    },

    // The bar would open over a dialog without its keys, so it waits for none to be open.
    openCommandBar: (query) => {
      if (isDetachedWindow || isDialogOpen()) return;
      dispatch({ type: "SET_COMMAND_BAR", open: true, query });
    },
    runCommandBarQuery: (query) => {
      if (isDetachedWindow || isDialogOpen()) return;
      dispatch({ type: "SET_COMMAND_BAR", open: true, query, launch: { kind: "run-query", query } });
    },
    // Forms submit through the main window's state, so a detached window says where to go.
    openPluginCommandWorkflow: (commandId) => {
      if (isDetachedWindow) {
        pluginRegistry.notify({ body: t("Open this from the main window."), type: "info" });
        return;
      }
      const command = pluginRegistry.commands.get(commandId);
      if (!command?.wizard || command.wizard.length === 0) {
        // Nothing to fill in: the bar opens, as it always has for such a command.
        if (!isDialogOpen()) dispatch({ type: "SET_COMMAND_BAR", open: true, query: "" });
        return;
      }
      openFormModal({ kind: "plugin-command", commandId });
    },
    openBuiltInWorkflow: (actionId) => {
      if (isDetachedWindow) {
        pluginRegistry.notify({ body: t("Open this from the main window."), type: "info" });
        return;
      }
      openFormModal({ kind: "builtin", actionId });
    },
    getLayout: () => stateRef.current.config.layout,
    updateLayout: (layout) => {
      if (isDetachedWindow) return;
      persistLayout(layout);
    },
    openPaneSettings: (paneId, options) => { void openPaneSettings(paneId, options); },
    showPane: (paneId) => {
      if (isDetachedWindow) return;
      showPane(paneId);
    },
    createPaneFromTemplateAsync: async (templateId, options) => {
      if (isDetachedWindow) return;
      await createPaneTemplateOrThrow(templateId, options, {

        pluginRegistry,
        dispatch,
        getState: () => stateRef.current,
        buildPaneInstance,
        placePaneInstance,
      });
    },
    createPaneFromTemplate: (templateId, options) => {
      if (isDetachedWindow) return;
      void createPaneFromTemplate(templateId, options);
    },
    applyPaneSettingValue: async (paneId, field: PaneSettingField, value) => {
      await applyPaneSettingFieldValueShared(paneId, field, value, {

        pluginRegistry,
        dispatch,
        getState: () => stateRef.current,
        persistLayout,
      });
    },
    hidePane: (paneId) => {
      if (isDetachedWindow) return;
      const instanceId = resolvePaneTarget(paneId);
      const layout = stateRef.current.config.layout;
      if (!instanceId || !isPaneInLayout(layout, instanceId)) return;
      persistLayout(removePane(layout, instanceId));
    },
    focusPane: (paneId, layout) => {
      if (isDetachedWindow) {
        if (paneId === detachedPaneId) {
          dispatch({ type: "FOCUS_PANE", paneId });
        }
        return;
      }
      const instanceId = resolvePaneTarget(paneId);
      if (!instanceId || !isPaneInLayout(stateRef.current.config.layout, instanceId)) {
        showPane(paneId);
        return;
      }
      // In the layout but hidden with its plugin, as the research pane that
      // follows a list is while Ticker Research is off.
      const paneType = findPaneInstance(stateRef.current.config.layout, instanceId)?.paneId;
      const owner = paneType ? pluginRegistry.getDisabledPaneOwner(paneType, stateRef.current.config.disabledPlugins) : null;
      if (owner) {
        const what = resolveTickerForPane(stateRef.current, instanceId) ?? pluginRegistry.panes.get(paneType!)?.name ?? paneType!;
        notifyPluginOff(pluginRegistry, new PluginOffError(owner, what), () => pluginRegistry.focusPane(paneId, layout));
        return;
      }

      focusVisiblePane(instanceId, layout);
    },
    // Ticker links in panes and menus, and DES from the command bar, open the
    // research pane (or the pane asked for) through these two.

  });
}
