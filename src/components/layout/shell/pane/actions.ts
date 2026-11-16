import { useCallback, useState } from "react";
import type { DesktopWindowBridge } from "../../../../types/desktop-window";
import {
  applyDrop,
  floatPane,
  isPaneInLayout,
  removeFloatingPanes,
  removePane,
  tidyWindows,
  type ResolvedPane,
} from "../../../../layout/pane-manager";
import type { PluginRegistry } from "../../../../plugins/registry";
import type { LayoutConfig } from "../../../../types/config";
import { isPaneLockedInLayout } from "../../../../pane-settings";
import { fireAndForget } from "../../../../utils/fire-and-forget";
import { createOneShots } from "../../../../utils/one-shot";
import {
  exportPaneTableCsv,
  hasPaneTableExporter,
} from "../../../../state/pane-table-export-registry";

function notifyPaneLocked(pluginRegistry: PluginRegistry): void {
  pluginRegistry.notify({ body: "Pane is locked. Unlock it in pane settings.", type: "info" });
}

function removedFocusRestoreOptions(
  layout: LayoutConfig,
  currentFocusedPaneId: string | null,
  paneId: string | null,
): { focusedPaneId: string } | undefined {
  if (currentFocusedPaneId && isPaneInLayout(layout, currentFocusedPaneId)) return undefined;
  return paneId && isPaneInLayout(layout, paneId) ? { focusedPaneId: paneId } : undefined;
}

interface UseShellPaneActionsOptions {
  closePaneMenu: () => void;
  contentHeight: number;
  desktopWindowBridge?: DesktopWindowBridge;
  focusedPaneId: string | null;
  focusPane: (paneId: string) => void;
  paneMap: Map<string, ResolvedPane>;
  persistLayout: (nextLayout: LayoutConfig, options?: { pushHistory?: boolean; focusedPaneId?: string | null }) => void;
  previousFocusedPaneId: string | null;
  pluginRegistry: PluginRegistry;
  visibleLayout: LayoutConfig;
  width: number;
}

export function useShellPaneActions({
  closePaneMenu,
  contentHeight,
  desktopWindowBridge,
  focusedPaneId,
  focusPane,
  paneMap,
  persistLayout,
  previousFocusedPaneId,
  pluginRegistry,
  visibleLayout,
  width,
}: UseShellPaneActionsOptions) {
  // Actions with a side effect outside the layout (the clipboard, a file, a new
  // window) refuse a second trigger while one runs and for a moment after, from
  // a held key, a native menu accelerator or a double press alike.
  const [shots] = useState(createOneShots);
  const openPaneSettings = useCallback((paneId: string) => {
    pluginRegistry.openPaneSettings(paneId);
    closePaneMenu();
  }, [closePaneMenu, pluginRegistry]);

  const canExportPaneCsv = useCallback((paneId: string) => {
    const pane = paneMap.get(paneId);
    return pane?.def.tableExport === true && hasPaneTableExporter(paneId);
  }, [paneMap]);

  const exportPaneCsv = useCallback(async (paneId: string) => {
    closePaneMenu();
    const pane = paneMap.get(paneId);
    if (!pane) return;
    const shot = shots.get("export-csv");
    if (shot.refuses()) return;
    shot.start();
    try {
      await exportPaneTableCsv(
        paneId,
        pane.instance.title ?? pane.def.name,
        pluginRegistry.notify,
      );
    } finally {
      shot.end();
    }
  }, [closePaneMenu, paneMap, pluginRegistry, shots]);

  const exportFocusedPaneCsv = useCallback(() => {
    if (!focusedPaneId || !canExportPaneCsv(focusedPaneId)) return false;
    void exportPaneCsv(focusedPaneId);
    return true;
  }, [canExportPaneCsv, exportPaneCsv, focusedPaneId]);

  const closeFocusedPane = useCallback(() => {
    if (!focusedPaneId || !isPaneInLayout(visibleLayout, focusedPaneId)) return false;
    if (isPaneLockedInLayout(visibleLayout, focusedPaneId)) {
      notifyPaneLocked(pluginRegistry);
      // Handled, so the keypress never reaches the host's own close shortcut.
      return true;
    }
    const nextLayout = removePane(visibleLayout, focusedPaneId);
    persistLayout(nextLayout, removedFocusRestoreOptions(nextLayout, focusedPaneId, previousFocusedPaneId));
    return true;
  }, [focusedPaneId, persistLayout, pluginRegistry, previousFocusedPaneId, visibleLayout]);

  const closeAllFloatingPanes = useCallback(() => {
    if (visibleLayout.floating.length === 0) return false;
    const lockedIds = new Set(visibleLayout.floating
      .map((entry) => entry.instanceId)
      .filter((instanceId) => isPaneLockedInLayout(visibleLayout, instanceId)));
    if (lockedIds.size === visibleLayout.floating.length) {
      notifyPaneLocked(pluginRegistry);
      return true;
    }
    const nextLayout = removeFloatingPanes(visibleLayout, { keepInstanceIds: lockedIds });
    persistLayout(nextLayout, removedFocusRestoreOptions(nextLayout, focusedPaneId, previousFocusedPaneId));
    return true;
  }, [focusedPaneId, persistLayout, pluginRegistry, previousFocusedPaneId, visibleLayout]);

  const openFocusedPaneSettings = useCallback(() => {
    if (!focusedPaneId || !pluginRegistry.hasPaneSettings(focusedPaneId)) return false;
    openPaneSettings(focusedPaneId);
    return true;
  }, [focusedPaneId, openPaneSettings, pluginRegistry]);

  const toggleFocusedPaneFloating = useCallback(() => {
    if (!focusedPaneId) return false;
    const pane = paneMap.get(focusedPaneId);
    if (!pane) return false;
    const nextLayout = pane.floating
      ? applyDrop(visibleLayout, pane.instance.instanceId, { kind: "frame", edge: "right" })
      : floatPane(visibleLayout, pane.instance.instanceId, width, contentHeight, pane.def);
    persistLayout(nextLayout);
    focusPane(pane.instance.instanceId);
    return true;
  }, [contentHeight, focusPane, focusedPaneId, paneMap, persistLayout, visibleLayout, width]);

  const popOutFocusedPane = useCallback(() => {
    if (!focusedPaneId || desktopWindowBridge?.kind !== "main" || !desktopWindowBridge.popOutPane) return false;
    if (!isPaneInLayout(visibleLayout, focusedPaneId)) return false;
    const shot = shots.get("pop-out");
    if (shot.refuses()) return true;
    shot.start();
    const request = desktopWindowBridge.popOutPane(focusedPaneId);
    fireAndForget(request, "desktop.popOutPane");
    void Promise.resolve(request).then(() => undefined, () => undefined).finally(() => shot.end());
    return true;
  }, [desktopWindowBridge, focusedPaneId, shots, visibleLayout]);

  const gridlockVisiblePanes = useCallback(() => {
    tidyWindows({
      layout: visibleLayout,
      size: { width, height: contentHeight },
      paneTypes: pluginRegistry.panes,
      apply: persistLayout,
      notify: pluginRegistry.notify,
      // Back through the shell's save, which puts hidden panes back too.
      onRevert: () => persistLayout(visibleLayout),
    });
    return true;
  }, [contentHeight, persistLayout, pluginRegistry, visibleLayout, width]);

  const handleFloatingClose = useCallback((paneId: string) => {
    const nextLayout = removePane(visibleLayout, paneId);
    persistLayout(nextLayout, removedFocusRestoreOptions(nextLayout, focusedPaneId, previousFocusedPaneId));
  }, [focusedPaneId, persistLayout, previousFocusedPaneId, visibleLayout]);

  return {
    canExportPaneCsv,
    closeAllFloatingPanes,
    closeFocusedPane,
    exportFocusedPaneCsv,
    exportPaneCsv,
    gridlockVisiblePanes,
    handleFloatingClose,
    openFocusedPaneSettings,
    openPaneSettings,
    popOutFocusedPane,
    toggleFocusedPaneFloating,
  };
}
