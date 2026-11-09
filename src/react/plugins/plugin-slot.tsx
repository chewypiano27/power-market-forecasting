import { getSharedRegistry } from "../../plugins/registry";
import { useAppSelector } from "../../state/app/context";
import type { WorkstationSlots } from "../../types/plugin";

export function PluginSlot<K extends keyof WorkstationSlots>({
  name,
  props,
}: {
  name: K;
  props?: WorkstationSlots[K];
}) {
  // Subscribed so toggling a plugin shows or hides its slots right away.
  const disabledPlugins = useAppSelector((state) => state.config.disabledPlugins);
  const registry = getSharedRegistry();
  return registry?.renderSlot(name, props ?? ({} as WorkstationSlots[K]), disabledPlugins) ?? null;
}
