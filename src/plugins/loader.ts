import type { WorkstationPlugin, PluginTarget } from "../types/plugin";
export interface LoadedExternalPlugin {
  plugin: WorkstationPlugin;
  path: string;
  /** Folder name under the plugins directory; what `update` and `remove` address. */
  directory?: string;
  /** The checked-out git commit, when the install is a git checkout. */
  commit?: string;
  /** `owner/repo` of the checkout's GitHub origin; usage counts trust only power-sh's. */
  repo?: string;
  /** A symlink to a local checkout (`power plugin link`) rather than a clone. */
  linked?: boolean;
  /**
   * The plugin's logo as a `data:` URL (plugin-icon.ts), for the desktop and
   * the web to draw beside what it contributes, such as its broker. The
   * terminal draws no images and leaves it unread.
   */
  icon?: string;
  error?: string;
  /**
   * The Vic1 the checkout declares it needs, when this one is older. The
   * plugin was not imported and `error` says so.
   */
  needsVic1?: string;
  /** Set when the plugin loaded but does not support the running renderer. */
  unsupportedTarget?: PluginTarget;
  /**
   * Loaded in a way this session cannot fully apply: new files under modules
   * it already imported, or an import Bun failed before a sibling plugin was
   * linked. Never registered; the next launch loads it.
   */
  needsRestart?: boolean;
}
