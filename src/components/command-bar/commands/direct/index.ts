import { applyLanguageFromConfig } from "../../../../i18n";
import { resolveLanguage } from "../../language-picker";
import type { Dispatch } from "react";
import { exportConfig, importConfig, resetAllData } from "../../../../data/config/store";
import type { PluginRegistry } from "../../../../plugins/registry";
import {
  applyTheme,
  clearTransientThemePreview,
} from "../../../../theme/colors";
import { clampFontSize, MIN_FONT_SIZE_PX } from "../../../../theme/font-scale";
import type { AppAction, AppState } from "../../../../state/app/context";
import type { Command } from "../registry";
import type { AppConfig } from "../../../../types/config";
import type { OpenInlineConfirm } from "../../routing/confirm";
import { isRouteCommandId, routeCommandIdToScreen } from "../../helpers";
import { parseWindowModeCommandArg } from "../../layout-items";
import type { CommandBarRoute } from "../../workflow/types";

type NotifyFn = (body: string, options?: { type?: "info" | "success" | "error" }) => void;

function getDefaultConfigBackupPath(): string {
  const home = typeof process !== "undefined" ? process.env.HOME : undefined;
  return `${home || "~"}/vic1-config-backup.json`;
}

export function runDirectCommandAction(options: {
  command: Command;
  arg: string;
  activeCollectionId: string | null;
  activeTickerSymbol: string | null;
  closeAll: (options?: { revertThemePreview?: boolean }) => void;
  /** The window's own minimize and maximize, as its title bar buttons run them. */
  controlWindow: (action: "minimize" | "toggle-maximize") => void;
  dispatch: Dispatch<AppAction>;

  getState: () => AppState;
  notify: NotifyFn;
  openBuiltInWorkflow: (actionId: string) => void;
  openInlineConfirm: OpenInlineConfirm;
  openModeRoute: (screen: "ticker-search" | "layout", initialQuery?: string) => void;
  openPaneSettings: (paneId: string | null) => void;
  pluginRegistry: PluginRegistry;
  persistConfig: (nextConfig: AppState["config"]) => void;
  pushRoute: (route: CommandBarRoute) => void;
  quitApp: () => void;

  setRootQuery: (query: string) => void;
  setRootThemeBaseId: (themeId: string | null) => void;
  cancelThemePreview: () => void;
}): void {
  const {
    activeCollectionId,
    activeTickerSymbol,
    arg,
    closeAll,
    command,
    controlWindow,
    dispatch,
    getState,
    notify,
    openInlineConfirm,
    openModeRoute,
    openPaneSettings,
    persistConfig,
    pluginRegistry,
    quitApp,
    setRootQuery,
    setRootThemeBaseId,
    cancelThemePreview,
  } = options;
  const state = getState();
  // DES is counted where the research pane opens (pinTicker, focusTicker).
  if (command.id !== "security-description") {

  }

  switch (command.id) {
    case "pane-settings":
      openPaneSettings(state.focusedPaneId);
      return;
    case "window-mode":
      closeAll({ revertThemePreview: false });
      pluginRegistry.openWindowMode(state.focusedPaneId ?? undefined, parseWindowModeCommandArg(arg) ?? "move");
      return;
    case "minimize-window":
    case "maximize-window":
      closeAll({ revertThemePreview: false });
      controlWindow(command.id === "minimize-window" ? "minimize" : "toggle-maximize");
      return;
    case "reset-all-data":
      openInlineConfirm({
        confirmId: "reset-all-data",
        title: "Reset All Data",
        body: [
          "This will permanently delete saved layouts, cached data, and settings.",
          "The app will quit and create a new workspace on next launch.",
        ],
        confirmLabel: "Reset Everything",
        cancelLabel: "Back",
        tone: "danger",
        onConfirm: async () => {
          await resetAllData(getState().config.dataDir);
          quitApp();
        },
      });
      return;
    case "export-config": {
      const exportPath = getDefaultConfigBackupPath();
      void exportConfig(state.config, exportPath)
        .then(() => {
          notify(`Config exported to ${exportPath}`, { type: "success" });
          closeAll({ revertThemePreview: false });
        })
        .catch((error) => {
          notify(error instanceof Error ? error.message : "Export failed.", { type: "error" });
        });
      return;
    }
    case "import-config": {
      const importPath = getDefaultConfigBackupPath();
      // An import replaces every layout, portfolio and setting at once, so it
      // is never one keystroke away.
      openInlineConfirm({
        confirmId: "import-config",
        title: "Import Config",
        body: [
          `This replaces your layouts, pane state and settings with the ones saved in ${importPath}.`,
          "What you have now is not kept unless you export it first.",
        ],
        confirmLabel: "Import",
        cancelLabel: "Back",
        tone: "danger",
        // A stray Enter keeps what is there.
        defaultAction: "cancel",
        onConfirm: async () => {
          try {
            const imported = await importConfig(getState().config.dataDir, importPath);
            cancelThemePreview();
            clearTransientThemePreview();
            dispatch({ type: "SET_CONFIG", config: imported });
            applyTheme(imported.theme);
            dispatch({ type: "SET_THEME", theme: imported.theme });
            notify(`Imported config from ${importPath}.`, { type: "success" });
          } catch (error) {
            notify(error instanceof Error ? error.message : "Import failed.", { type: "error" });
          }
        },
      });
      return;
    }
    case "toggle-presentation-mode": {
      const { presentationMode, ...rest } = state.config;
      const nextConfig: AppConfig = presentationMode ? rest : { ...rest, presentationMode: true };
      dispatch({ type: "SET_CONFIG", config: nextConfig });
      persistConfig(nextConfig);
      closeAll({ revertThemePreview: false });
      return;
    }
    case "font-size-increase":
    case "font-size-decrease": {
      const delta = command.id === "font-size-increase" ? 1 : -1;
      const current = clampFontSize(state.config.fontSize);
      const next = clampFontSize(current + delta);
      if (next === current) {
        notify(`Font size already at ${next === MIN_FONT_SIZE_PX ? "minimum" : "maximum"} (${next}px)`, { type: "info" });
        closeAll({ revertThemePreview: false });
        return;
      }
      const nextConfig = { ...state.config, fontSize: next };
      dispatch({ type: "SET_CONFIG", config: nextConfig });
      persistConfig(nextConfig);
      notify(`Font size: ${next}px`, { type: "success" });
      closeAll({ revertThemePreview: false });
      return;
    }
    case "language": {
      if (!arg.trim()) {
        setRootQuery("LANG ");
        return;
      }
      const language = resolveLanguage(arg);
      if (!language) {
        notify("Choose a language from the list.", { type: "info" });
        setRootQuery(`LANG ${arg}`);
        return;
      }
      const nextConfig = { ...state.config, language };
      applyLanguageFromConfig(nextConfig);
      dispatch({ type: "SET_LANGUAGE", language });
      persistConfig(nextConfig);
      closeAll({ revertThemePreview: false });
      return;
    }
    case "theme":
      setRootThemeBaseId(getState().config.theme);
      setRootQuery(arg ? `TH ${arg}` : "TH ");
      return;
    default:
      if (isRouteCommandId(command.id)) {
        const screen = routeCommandIdToScreen(command.id);
        if (screen) openModeRoute(screen, arg);
        return;
      }
      command.execute?.(dispatch, { activeTicker: activeTickerSymbol, activeCollectionId });
      closeAll({ revertThemePreview: false });
  }
}
