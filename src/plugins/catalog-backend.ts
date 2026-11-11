import type { WorkstationPlugin } from "../types/plugin";
import type { LoadedExternalPlugin } from "./loader";

import { uiBuiltinPlugins } from "./catalog-ui";
export function getDesktopBackendPlugins(): WorkstationPlugin[] {
  return [...uiBuiltinPlugins];
}
export interface DesktopBackendPlugins {
  plugins: WorkstationPlugin[];
  externalPlugins: LoadedExternalPlugin[];
  paneOwners: ReadonlyMap<string, string>;
}
export async function loadDesktopBackendPlugins(): Promise<DesktopBackendPlugins> {
  const paneOwners = new Map(uiBuiltinPlugins.flatMap(plugin =>
    (plugin.panes ?? []).map(pane => [pane.id, plugin.id] as const)));
  return { plugins: getDesktopBackendPlugins(), externalPlugins: [], paneOwners };
}
