import type { ReactNode } from "react";

import type { CommandBarSearchProvider, CommandDef, ContextMenuProviderDef, KeyboardShortcut, PaneDef, PaneTemplateDef } from "../../types/plugin";

export interface ContextMenuProviderEntry {
  pluginId: string;
  provider: ContextMenuProviderDef;
}

interface RegistryContributionsOptions {
  wrapComponent: <P>(pluginId: string, component: (props: P) => ReactNode) => (props: P) => ReactNode;
}

/** Registration and ownership change together, including explicit withdrawal. */
class OwnedContributions<T> extends Map<string, T> {
  readonly owners = new Map<string, string>();

  register(pluginId: string, id: string, value: T, replace = false): () => void {
    if (!replace && this.has(id)) throw new Error(`Duplicate plugin contribution id: ${id}`);
    this.set(id, value);
    this.owners.set(id, pluginId);
    return () => {
      if (this.get(id) !== value || this.owners.get(id) !== pluginId) return;
      this.delete(id);
      this.owners.delete(id);
    };
  }

  ids(pluginId: string): string[] {
    return [...this.owners].filter(([, owner]) => owner === pluginId).map(([id]) => id);
  }

  unregister(pluginId: string): void {
    for (const id of this.ids(pluginId)) {
      this.delete(id);
      this.owners.delete(id);
    }
  }
}

export class RegistryContributions {

  readonly panesMap = new OwnedContributions<PaneDef>();
  readonly paneTemplatesMap = new OwnedContributions<PaneTemplateDef>();
  readonly commandsMap = new OwnedContributions<CommandDef>();
  readonly commandBarSearchProvidersMap = new OwnedContributions<CommandBarSearchProvider>();
  readonly shortcutsMap = new OwnedContributions<KeyboardShortcut>();
  readonly contextMenuProvidersMap = new OwnedContributions<ContextMenuProviderEntry>();

  constructor(private readonly options: RegistryContributionsOptions) { }

  registerPane(pluginId: string, pane: PaneDef): void {
    this.panesMap.register(pluginId, pane.id, {
      ...pane,
      component: this.options.wrapComponent(pluginId, pane.component),
    });
  }

  registerPaneTemplate(pluginId: string, template: PaneTemplateDef, replace = false): () => void {
    const registered = template;
    return this.paneTemplatesMap.register(pluginId, template.id, registered, replace);
  }

  registerCommand(pluginId: string, command: CommandDef): void {
    this.commandsMap.register(pluginId, command.id, command);
  }

  unregister(pluginId: string): void {
    for (const collection of [
      this.panesMap, this.paneTemplatesMap, this.commandsMap, this.commandBarSearchProvidersMap, this.shortcutsMap, this.contextMenuProvidersMap,
    ]) collection.unregister(pluginId);
  }
}
