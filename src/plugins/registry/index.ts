import type { ReactNode } from "react";

import type { AppPersistencePort } from "../../core/app-service-ports";

import { resolvePaneInstance } from "../../types/config";
import type { ContextMenuContext, ContextMenuItem } from "../../types/context-menu";

import type { CommandDef, WorkstationPlugin, WorkstationPluginContext, WorkstationSlots, KeyboardShortcut, PaneDef, PaneTemplateDef } from "../../types/plugin";
import { debugLog } from "../../utils/debug-log";

import { EventBus } from "../event-bus";

import { isReservedBuiltinPluginId } from "../ownership";
import { createPluginPersistence } from "../plugin-persistence";

import { withPluginRender, type PluginRuntimeAccess } from "../runtime";
import { resolveRegistryContextMenuItems } from "./context-menu";
import { RegistryContributions } from "./contributions";
import { createDefaultHostActions, HOST_ACTION_NAMES, type PluginHostActions } from "./host-actions";
import {
  resolveRegistryPaneQuickSettings,
  resolveRegistryPaneSettings,
  type ResolvedRegistryPaneQuickSetting,
  type ResolvedRegistryPaneSettings,
} from "./pane-settings";

import { createPluginSetupCommand, isPluginConfigured } from "./setup-command";
import {
  bindSharedRegistry,
  releaseSharedRegistry,
} from "./shared";
import { RegistrySlots } from "./slots";

export type { WindowEditMode } from "./host-actions";

/** A switched-off plugin, named for a "Turn on" offer. */
export interface DisabledPluginOwner {
  id: string;
  name: string;
}
export { getSharedRegistry } from "./shared";

/**
 * Every host action is also a member of the registry (`registry.showPane(id)`)
 * that calls whatever the app bound last, so one passed around keeps working
 * after the app rebinds it.
 */
export interface PluginRegistry extends PluginHostActions {}

export class PluginRegistry implements PluginRuntimeAccess {
  private readonly defaultHostActions = createDefaultHostActions(() => this);
  private readonly hostActions: PluginHostActions = { ...this.defaultHostActions };
  private slots = new RegistrySlots();
  private readonly contributions: RegistryContributions;
  private plugins = new Map<string, WorkstationPlugin>();

  readonly events: EventBus;
  readonly persistence: AppPersistencePort;

  constructor(
    persistence: AppPersistencePort,
  ) {
    for (const name of HOST_ACTION_NAMES) {
      Object.assign(this, {
        [name]: (...args: unknown[]) => (this.hostActions[name] as (...args: unknown[]) => unknown)(...args),
      });

    }
    this.persistence = persistence;
    this.events = new EventBus();
    this.contributions = new RegistryContributions({
      wrapComponent: (pluginId, component) => withPluginRender(this.stateNamespace(pluginId), this, component),
    });

    bindSharedRegistry(this);
  }

  /**
   * Binds the given host actions and leaves the others as they are. The
   * returned function puts the defaults back for any of them still bound, so
   * a shell or window that unmounts does not undo what mounted after it.
   */
  bindHost(actions: Partial<PluginHostActions>): () => void {
    const bound = Object.entries(actions).filter(([, action]) => action !== undefined);
    Object.assign(this.hostActions, Object.fromEntries(bound));
    return () => {
      for (const [name, action] of bound) {
        const key = name as keyof PluginHostActions;
        if (this.hostActions[key] === action) Object.assign(this.hostActions, { [key]: this.defaultHostActions[key] });
      }
    };
  }

  get panes(): ReadonlyMap<string, PaneDef> { return this.contributions.panesMap; }
  get paneTemplates(): ReadonlyMap<string, PaneTemplateDef> { return this.contributions.paneTemplatesMap; }
  get commands(): ReadonlyMap<string, CommandDef> { return this.contributions.commandsMap; }
  get shortcuts(): ReadonlyMap<string, KeyboardShortcut> { return this.contributions.shortcutsMap; }
  get allPlugins(): ReadonlyMap<string, WorkstationPlugin> { return this.plugins; }

  getContextMenuItems(context: ContextMenuContext): ContextMenuItem[] {
    return resolveRegistryContextMenuItems({
      context,
      disabledPlugins: new Set(this.getConfig().disabledPlugins ?? []),
      providers: this.contributions.contextMenuProvidersMap.entries(),
      onProviderError: (entry, error) => {
        this.registryLog.error("Context menu provider failed", {
          pluginId: entry.pluginId,
          providerId: entry.provider.id,
          context: context.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }

  getPluginPaneIds(pluginId: string): string[] {
    return this.contributions.panesMap.ids(pluginId);
  }

  renderSlot<K extends keyof WorkstationSlots>(
    name: K,
    props: WorkstationSlots[K],
    disabledPlugins: readonly string[] = this.getConfig().disabledPlugins,
  ): ReactNode {
    return this.slots.render(name, props, disabledPlugins);
  }

  /**
   * Where a plugin's saved state lives, which is its id unless it declares
   * otherwise. A plugin that was renamed keeps reading and writing the state
   * the user already has instead of starting again under the new id.
   */
  private stateNamespace(pluginId: string): string {
    return this.plugins.get(pluginId)?.stateId ?? pluginId;
  }

  getConfigState<T = unknown>(pluginId: string, key: string): T | null {
    return this.getPluginConfigValue<T>(this.stateNamespace(pluginId), key);
  }

  setConfigState(pluginId: string, key: string, value: unknown): Promise<void> {
    return this.setPluginConfigValue(this.stateNamespace(pluginId), key, value);
  }

  setConfigStates(pluginId: string, values: Record<string, unknown>): Promise<void> {
    return this.setPluginConfigValues(this.stateNamespace(pluginId), values);
  }

  /** False while a plugin with a `configSchema` is missing a required value. */
  isPluginConfigured(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return true;
    return isPluginConfigured(plugin, this.getConfig().pluginConfig[this.stateNamespace(pluginId)] ?? {});
  }

  private resolvePaneTarget(paneId: string): string | undefined {
    return resolvePaneInstance(this.getLayout(), paneId)?.instanceId;
  }

  resolvePaneSettings(paneId: string): ResolvedRegistryPaneSettings | null {
    return resolveRegistryPaneSettings({
      config: this.getConfig(),
      getConfigState: (pluginId, key) => this.getConfigState(pluginId, key),
      getPaneRuntimeState: this.getPaneRuntimeState,
      layout: this.getLayout(),
      paneDefs: this.contributions.panesMap,
      paneOwners: this.contributions.panesMap.owners,
      resolvePaneTarget: (targetPaneId) => this.resolvePaneTarget(targetPaneId),
      requestedPaneId: paneId,
    });
  }

  hasPaneSettings(paneId: string): boolean {
    return this.resolvePaneSettings(paneId) !== null;
  }

  resolvePaneQuickSettings(paneId: string): ResolvedRegistryPaneQuickSetting[] {
    return resolveRegistryPaneQuickSettings(this.resolvePaneSettings(paneId));
  }

  async togglePaneQuickSetting(paneId: string, key: string): Promise<void> {
    const quickSetting = this.resolvePaneQuickSettings(paneId).find((setting) => setting.key === key);
    if (!quickSetting) return;
    await this.applyPaneSettingValue(paneId, quickSetting.field, quickSetting.nextValue);
  }

  getCommandPluginId(commandId: string): string | undefined {
    return this.contributions.commandsMap.owners.get(commandId);
  }

  getPanePluginId(paneId: string): string | undefined {
    return this.contributions.panesMap.owners.get(paneId);
  }

  getPaneTemplatePluginId(templateId: string): string | undefined {
    return this.contributions.paneTemplatesMap.owners.get(templateId);
  }

  /**
   * The plugin that owns this pane type when it is switched off. A pane of a
   * switched-off plugin stays hidden, so callers offer to turn it on instead
   * of adding one.
   */
  getDisabledPaneOwner(
    paneType: string,
    disabledPlugins: readonly string[] = this.getConfig().disabledPlugins,
  ): DisabledPluginOwner | null {
    return this.disabledOwner(this.getPanePluginId(paneType), disabledPlugins);
  }

  /** The same for a template: its own plugin, or the one owning the pane it opens. */
  getDisabledPaneTemplateOwner(
    templateId: string,
    disabledPlugins: readonly string[] = this.getConfig().disabledPlugins,
  ): DisabledPluginOwner | null {
    const paneType = this.paneTemplates.get(templateId)?.paneId;
    return this.disabledOwner(this.getPaneTemplatePluginId(templateId), disabledPlugins)
      ?? (paneType ? this.getDisabledPaneOwner(paneType, disabledPlugins) : null);
  }

  private disabledOwner(pluginId: string | undefined, disabledPlugins: readonly string[]): DisabledPluginOwner | null {
    if (!pluginId || !disabledPlugins.includes(pluginId)) return null;
    return { id: pluginId, name: this.plugins.get(pluginId)?.name ?? pluginId };
  }

  getShortcutPluginId(shortcutId: string): string | undefined {
    return this.contributions.shortcutsMap.owners.get(shortcutId);
  }

  /**
   * The state parts of a plugin's context. `namespaceKey` is the plugin's id,
   * or the namespace a composed module keeps; both resolve the way a render
   * context's id does.
   */
  private createContext(pluginId: string): WorkstationPluginContext {
    const stateId = this.stateNamespace(pluginId);
    return { persistence: createPluginPersistence(
      this.persistence.pluginState, this.persistence.resources, `plugin:${stateId}`, stateId,
    ) };
  }

  private registryLog = debugLog.createLogger("registry");

  async register(plugin: WorkstationPlugin): Promise<void> {
    this.registryLog.info(`Registering plugin: ${plugin.id} v${plugin.version ?? "?"}`);
    if (isReservedBuiltinPluginId(plugin.id)) {
      throw new Error(`Plugin id is reserved by a built-in module: ${plugin.id}`);
    }
    if (this.plugins.has(plugin.id)) throw new Error(`Plugin already registered: ${plugin.id}`);
    this.plugins.set(plugin.id, plugin);
    try {
      if (plugin.panes) {
        for (const pane of plugin.panes) {
          this.contributions.registerPane(plugin.id, pane);
        }
      }

      if (plugin.paneTemplates) {
        for (const template of plugin.paneTemplates) {
          this.contributions.registerPaneTemplate(plugin.id, template);
        }
      }

      this.slots.register(plugin, (renderer) => withPluginRender(this.stateNamespace(plugin.id), this, renderer));

      const setupCommand = createPluginSetupCommand(plugin, {
        getValues: () => this.getConfig().pluginConfig[this.stateNamespace(plugin.id)] ?? {},
        setValues: (values) => this.setConfigStates(plugin.id, values),
        notify: (body, type) => this.notify({ body, type }),
      });
      if (setupCommand) this.contributions.registerCommand(plugin.id, setupCommand);

      if (plugin.setup) {
        await plugin.setup(this.createContext(plugin.id));
      }
    } catch (error) {
      try {
        this.removePlugin(plugin.id);
      } catch (cleanupError) {
        this.registryLog.error("Failed to clean up rejected plugin registration", {
          pluginId: plugin.id,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
      throw error;
    }

    this.events.emit("plugin:registered", { pluginId: plugin.id });
  }

  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    this.registryLog.info(`Unregistering plugin: ${pluginId}`);

    this.removePlugin(pluginId);
    this.events.emit("plugin:unregistered", { pluginId });
  }

  private removePlugin(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    let cleanupError: unknown;
    try { plugin.dispose?.(); } catch (error) { cleanupError = error; }
    try { this.slots.unregister(pluginId); } catch (error) { cleanupError ??= error; }
    try { this.contributions.unregister(pluginId); } catch (error) { cleanupError ??= error; }
    this.plugins.delete(pluginId);
    if (cleanupError) throw cleanupError;
  }

  destroy(): void {
    for (const pluginId of [...this.plugins.keys()].reverse()) {
      try {
        this.unregister(pluginId);
      } catch (error) {
        this.registryLog.error("Failed to unregister plugin during registry destroy", {
          pluginId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    releaseSharedRegistry(this);
  }
}
