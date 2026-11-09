import type { PluginRegistry } from "../../plugins/registry";
import { swapPanes } from "../../layout/pane-manager";
import type { LayoutConfig } from "../../types/config";

import type { OpenInlineConfirm } from "./routing/confirm";

import type { CommandBarPickerRoute } from "./workflow/types";

export function activatePickerSelectionAction({
  closeAll,

  layout,
  openInlineConfirm,
  persistLayoutChange,
  pluginRegistry,
  route,
  selectedId,
}: {
  closeAll: (options?: { revertThemePreview?: boolean }) => void;

  layout: LayoutConfig;
  openInlineConfirm: OpenInlineConfirm;
  persistLayoutChange: (nextLayout: LayoutConfig) => void;
  pluginRegistry: PluginRegistry;
  route: CommandBarPickerRoute;
  selectedId: string;
}): void {
  const option = route.options.find((entry) => entry.id === selectedId);
  if (!option || option.disabled) return;

  switch (route.pickerId) {
    case "layout-swap": {
      const sourcePaneId = String(route.payload?.sourcePaneId ?? "");
      if (!sourcePaneId) return;
      persistLayoutChange(swapPanes(layout, sourcePaneId, option.id));
      closeAll({ revertThemePreview: false });
      return;
    }
    default:
      return;
  }
}
