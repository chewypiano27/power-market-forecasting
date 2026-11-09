import type { PaneRuntimeState } from "../../core/state/app/state";

import type { PaneImageCapture } from "../../shares/pane-image";

import type { AppConfig, LayoutConfig } from "../../types/config";

import type { AppNotificationDelivery, AppNotificationRequest, PaneSettingField, PaneTemplateCreateOptions } from "../../types/plugin";
import type { TickerRecord } from "../../types/ticker";

export type WindowEditMode = "move" | "resize";

/**
 * What the app does on behalf of plugins and the host UI. The registry starts
 * with the no-op defaults below; the app, its shell and each window bind the
 * real actions with `PluginRegistry.bindHost` as they mount.
 */
export interface PluginHostActions {
  getTicker(symbol: string): TickerRecord | null;
  getConfig(): AppConfig;
  /** Focus the leftmost or rightmost docked pane. */
  switchPanel(panel: "left" | "right"): void;
  openCommandBar(query?: string): void;
  /** Submits `query` in the command bar as if typed and entered, as a key bound to it does. Not on the plugin API. */
  runCommandBarQuery(query: string): void;
  openPluginCommandWorkflow(commandId: string): void;
  /** Opens one of the app's own forms, such as `new-portfolio`, or Add Broker in the Brokers pane. Not on the plugin API. */
  openBuiltInWorkflow(actionId: string): void;
  /** `options.fieldKey` starts the cursor on that setting, as a setting picked in the command bar does. */
  openPaneSettings(paneId?: string, options?: { fieldKey?: string }): void;
  /**
   * A picture of a pane (the focused one when omitted) as it looks now, its
   * footer reading as a dated status line. Not on the plugin API.
   */
  capturePaneImage(paneId?: string): Promise<PaneImageCapture>;
  openWindowMode(paneId?: string, mode?: WindowEditMode): void;
  /** The shell's fullscreen toggle for a pane; false when there is nothing to fill the window with. */
  togglePaneFullscreen(paneId: string): boolean;
  /** The shell's Move to New Layout for a pane; false when it did nothing. Not on the plugin API. */
  movePaneToNewLayout(paneId: string): boolean;
  /** Returns a pane Move to New Layout moved to where it came from; false when it did nothing. Not on the plugin API. */
  movePaneBack(paneId: string): boolean;
  showPane(paneId: string): void;
  createPaneFromTemplate(templateId: string, options?: PaneTemplateCreateOptions): void;
  createPaneFromTemplateAsync(templateId: string, options?: PaneTemplateCreateOptions): Promise<void>;
  hidePane(paneId: string): void;
  focusPane(paneId: string, layout?: LayoutConfig): void;
  navigateTicker(symbol: string, options?: { sourcePaneId?: string | null }): void;

  getLayout(): LayoutConfig;
  updateLayout(layout: LayoutConfig): void;
  getTermSize(): { width: number; height: number };

  notify(notification: AppNotificationRequest): AppNotificationDelivery | void;
  /** Switches a plugin on or off the way the Plugins pane does. Not on the plugin API. */
  setPluginEnabled(pluginId: string, enabled: boolean): void;
  /**
   * Switches several plugins on or off as one change: one config write and
   * one save. A switched-off plugin's panes are hidden, never removed, so
   * switching it back on shows them where they were. Not on the plugin API.
   */
  setPluginsEnabled(changes: Readonly<Record<string, boolean>>): void;
  getPaneRuntimeState(paneId: string): PaneRuntimeState | null;
  updatePaneRuntimeState(paneId: string, patch: Partial<PaneRuntimeState>): void;
  applyPaneSettingValue(paneId: string, field: PaneSettingField, value: unknown): Promise<void>;
  getPluginConfigValue<T = unknown>(pluginId: string, key: string): T | null;
  setPluginConfigValue(pluginId: string, key: string, value: unknown): Promise<void>;
  setPluginConfigValues(pluginId: string, values: Record<string, unknown>): Promise<void>;
  deletePluginConfigValue(pluginId: string, key: string): Promise<void>;
}

/**
 * Stand-ins for actions nothing has bound. Pass `current` so the default
 * plugin config lookup reads whatever config the host binds later.
 */
export function createDefaultHostActions(current?: () => Pick<PluginHostActions, "getConfig">): PluginHostActions {
  const defaults: PluginHostActions = {
    getTicker: () => null,
    getConfig: () => { throw new Error("getConfig is not bound"); },
    switchPanel: () => {},
    openCommandBar: () => {},
    runCommandBarQuery: () => {},
    openPluginCommandWorkflow: () => {},
    openBuiltInWorkflow: () => {},
    openPaneSettings: () => {},
    capturePaneImage: async () => { throw new Error("Pictures of panes are not available here."); },
    openWindowMode: () => {},
    togglePaneFullscreen: () => false,
    movePaneToNewLayout: () => false,
    movePaneBack: () => false,
    showPane: () => {},
    createPaneFromTemplate: () => {},
    createPaneFromTemplateAsync: async () => {},
    hidePane: () => {},
    focusPane: () => {},
    navigateTicker: () => {},
    getLayout: () => ({ dockRoot: null, instances: [], floating: [], detached: [] }),
    updateLayout: () => {},
    getTermSize: () => ({ width: 120, height: 40 }),
    notify: () => {},
    setPluginEnabled: () => {},
    setPluginsEnabled: () => {},
    getPaneRuntimeState: () => null,
    updatePaneRuntimeState: () => {},
    applyPaneSettingValue: async () => {},
    getPluginConfigValue: <T = unknown>(pluginId: string, key: string): T | null => (
      ((current?.() ?? defaults).getConfig().pluginConfig[pluginId]?.[key] as T | undefined) ?? null
    ),
    setPluginConfigValue: async () => {},
    setPluginConfigValues: async () => {},
    deletePluginConfigValue: async () => {},
  };
  return defaults;
}

export const HOST_ACTION_NAMES = Object.keys(createDefaultHostActions()) as ReadonlyArray<keyof PluginHostActions>;
