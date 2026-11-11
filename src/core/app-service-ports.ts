import type { PluginStateStore } from "../data/plugin-state-store";
import type { ResourceStore } from "../data/resource-store";
import type { SessionStore } from "../data/session-store";

import type { LoadedExternalPlugin } from "../plugins/loader";
import type { PluginRegistry } from "../plugins/registry";
import type { AppConfig } from "../types/config";

import type { WorkstationPlugin } from "../types/plugin";

export type AppPluginStateStorePort = Pick<
  PluginStateStore,
  "get" | "set" | "delete" | "keys" | "clear"
>;

export type AppResourceStorePort = Pick<ResourceStore, "get" | "list" | "set" | "delete">;
export type AppSessionStorePort = Pick<SessionStore, "get" | "set" | "delete">;

export interface AppPersistencePort {
  pluginState: AppPluginStateStorePort;
  resources: AppResourceStorePort;
  sessions: AppSessionStorePort;
  close(): void;
}

export interface AppRuntimeServices {
  persistence: AppPersistencePort;
  pluginRegistry: PluginRegistry;
  ready: Promise<void>;
  destroy(): void;
}

export interface AppServicesFactoryOptions {
  config: AppConfig;
  plugins: readonly WorkstationPlugin[];
  /**
   * The entries behind the external plugins in `plugins`. One of them failing
   * to register is recorded on its entry and shown in the marketplace; without
   * this list the runtime cannot tell it apart from a built-in, whose failure
   * is a bug that should stop startup.
   */
  externalPlugins?: readonly LoadedExternalPlugin[];
}

export type AppServicesFactory = (options: AppServicesFactoryOptions) => AppRuntimeServices;
