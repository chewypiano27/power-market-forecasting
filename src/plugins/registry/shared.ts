import type { PluginRegistry } from "./index";
let sharedRegistry: PluginRegistry | undefined;
export function getSharedRegistry(): PluginRegistry | undefined { return sharedRegistry; }
export function bindSharedRegistry(registry: PluginRegistry): void { sharedRegistry = registry; }
export function releaseSharedRegistry(registry: PluginRegistry): void {
  if (sharedRegistry === registry) sharedRegistry = undefined;
}
