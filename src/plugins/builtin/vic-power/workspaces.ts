import { cloneLayout, type AppConfig, type DockLayoutNode, type LayoutConfig, type SavedLayout } from "../../../types/config";

const PRESETS_VERSION = "workspace-presets-version";
const PANE_IDS = ["vic-market-glance", "vic-demand-price", "vic-spot-arbitrage"] as const;
const leaf = (paneId: string): DockLayoutNode => ({ kind: "pane", instanceId: `${paneId}:main` });

/** The five saved layouts use the host's existing Cmd/Ctrl+digit navigation. */
export function createWorkstationLayouts(): SavedLayout[] {
  const single = (paneId: string): LayoutConfig => ({
    instances: [{ paneId, instanceId: `${paneId}:main`, binding: { kind: "none" } }],
    dockRoot: leaf(paneId), floating: [], detached: [],
  });
  const names = ["Market Desk", "Weather & Load Risk", "Regional Spot"];
  const layouts: SavedLayout[] = PANE_IDS.map((paneId, index) => ({
    id: `vic1-workspace-${index + 1}`, name: names[index]!, layout: single(paneId), paneState: {},
    focusedPaneId: `${paneId}:main`,
  }));
  layouts.push({
    id: "vic1-workspace-4", name: "Trader View",
    layout: {
      instances: PANE_IDS.flatMap(paneId => single(paneId).instances),
      dockRoot: { kind: "split", axis: "horizontal", ratio: 0.5, first: leaf(PANE_IDS[0]),
        second: { kind: "split", axis: "vertical", ratio: 0.55,
          first: leaf(PANE_IDS[1]), second: leaf(PANE_IDS[2]) } },
      floating: [], detached: [],
    },
    paneState: {}, focusedPaneId: `${PANE_IDS[0]}:main`,
  });
  return [{ id: "vic1-workspace-demo", name: "Demo", layout: { dockRoot: null, instances: [], floating: [], detached: [] }, paneState: {}, focusedPaneId: null }, ...layouts];
}

/** Keep the blank demo workspace first and preserve the four populated workspaces; retain earlier layouts in the plugin's local archive. */
export function installWorkstationLayouts(config: AppConfig): AppConfig {
  if (config.pluginConfig["vic-power"]?.[PRESETS_VERSION] === 3) return config;
  const active = config.layouts[config.activeLayoutIndex];
  const presets = createWorkstationLayouts().map(preset => {
    const saved = config.layouts.find(layout => layout.id === preset.id);
    if (!saved) return preset;
    return saved === active ? { ...saved, layout: cloneLayout(config.layout) } : saved;
  });
  const ids = new Set(presets.map(layout => layout.id));
  const previous = config.layouts.filter(saved => !ids.has(saved.id)).map(saved => saved === active
    ? { ...saved, layout: cloneLayout(config.layout) } : saved);
  const existingArchive = config.pluginConfig["vic-power"]?.["archived-workspaces"];
  const activeLayoutIndex = 0;
  return {
    ...config,
    layouts: presets,
    layout: cloneLayout(presets[activeLayoutIndex]!.layout),
    activeLayoutIndex,
    keybindings: { ...config.keybindings, actions: { ...config.keybindings?.actions,
      "switch-layout": ["CmdOrCtrl+1", "CmdOrCtrl+2", "CmdOrCtrl+3", "CmdOrCtrl+4", "CmdOrCtrl+5"] } },
    pluginConfig: { ...config.pluginConfig,
      "vic-power": { ...config.pluginConfig["vic-power"], [PRESETS_VERSION]: 3,
        "archived-workspaces": [...(Array.isArray(existingArchive) ? existingArchive : []), ...previous] } },
  };
}
