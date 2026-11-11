import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
} from "react";

import type { PluginRegistry } from "../../plugins/registry";
import type { AppAction, AppState } from "../../state/app/context";

import type { TickerFinancials } from "../../types/financials";
import type { TickerRecord } from "../../types/ticker";
import type { ThemePickerHandle } from "./theme-picker";

import { useCommandBarPluginCommandActions } from "./commands/plugin/actions";
import { useCommandBarPaneTemplateActions } from "./pane-templates/workflow";
import { useCommandBarDirectCommandRuntime } from "./commands/direct/runtime";
import { useCommandBarInlineConfirm } from "./routing/confirm";
import { useCommandBarPaneActions } from "./pane-actions";
import { useCommandBarWorkflowCoordinator } from "./workflow/coordinator";
import { useCommandBarRouteActions } from "./routing/actions";
import { useCommandBarLaunchRequest } from "./routing/launch-request";
import type { CommandBarRoute } from "./workflow/types";

interface UseCommandBarActionRuntimeOptions {
  activeCollectionId: string | null;
  activeFinancials: TickerFinancials | null;
  activeTickerData: TickerRecord | null;
  activeTickerSymbol: string | null;
  closeAll: (options?: { revertThemePreview?: boolean }) => void;
  config: AppState["config"];

  dispatch: Dispatch<AppAction>;
  focusedPaneId: string | null;
  persistConfig: (nextConfig: AppState["config"]) => void;
  pluginRegistry: PluginRegistry;
  pushRoute: (route: CommandBarRoute) => void;
  quitApp: () => void;
  rootThemeBaseIdRef: MutableRefObject<string | null>;
  setRootQuery: (query: string) => void;
  skipTickerSearchDebounceRef: MutableRefObject<boolean>;
  state: AppState;
  stateRef: MutableRefObject<AppState>;
  themePickerRef: MutableRefObject<ThemePickerHandle | null>;

  tickers: AppState["tickers"];
}

export function useCommandBarActionRuntime({
  activeCollectionId,
  activeFinancials,
  activeTickerData,
  activeTickerSymbol,
  closeAll,
  config,

  dispatch,
  focusedPaneId,
  persistConfig,
  pluginRegistry,
  pushRoute,
  quitApp,
  rootThemeBaseIdRef,
  setRootQuery,
  skipTickerSearchDebounceRef,
  state,
  stateRef,
  themePickerRef,

  tickers,
}: UseCommandBarActionRuntimeOptions) {
  const {
    duplicatePane,

    persistLayoutChange,
  } = useCommandBarPaneActions({
    dispatch,
    pluginRegistry,
    stateRef,
  });

  const openModeRoute = useCallback((
    screen: "ticker-search" | "layout",
    initialQuery = "",
    payload?: Record<string, unknown>,
  ) => {
    if (screen === "ticker-search" && initialQuery.trim()) {
      skipTickerSearchDebounceRef.current = true;
    }
    pushRoute({
      kind: "mode",
      screen,
      query: initialQuery,
      selectedIdx: 0,
      hoveredIdx: null,
      payload,
    });
  }, [pushRoute, skipTickerSearchDebounceRef]);

  const notify = useCallback((body: string, options?: { type?: "info" | "success" | "error"; duration?: number }) => {
    pluginRegistry.notify({ body, ...options });
  }, [pluginRegistry]);

  const {
    buildSharedWorkflowDeps,

    openBuiltInWorkflow,
    openForm,
  } = useCommandBarWorkflowCoordinator({
    closeAll,

    dispatch,
    notify,
    pluginRegistry,

  });

  const openInlineConfirm = useCommandBarInlineConfirm({ closeAll });

  const {
    buildLayoutItems,
    buildPaneSettingItems,
    buildWindowModeItems,

    openPaneSettings,

  } = useCommandBarRouteActions({
    activeCollectionId,
    activeFinancials,
    activeTickerData,
    activeTickerSymbol,
    closeAll,
    dispatch,
    duplicatePane,
    notify,

    openBuiltInWorkflow,
    openInlineConfirm,
    openModeRoute,
    persistConfig,
    persistLayoutChange,
    pluginRegistry,
    pushRoute,
    state,
    stateRef,
  });

  const {
    createPluginCommandItem,
    getAvailablePluginCommands,
    openPluginCommandWorkflow,
    pluginCommandItems,
    pluginCommandResultItems,
  } = useCommandBarPluginCommandActions({
    activeCollectionId,
    activeTickerSymbol,
    closeAll,
    config,
    notify,
    openForm,
    openInlineConfirm,
    pluginRegistry,
  });

  useCommandBarLaunchRequest({
    commandBarLaunchRequest: state.commandBarLaunchRequest,
    commandBarOpen: state.commandBarOpen,
    openModeRoute,
  });

  const {

    createPaneTemplateItem,
    getAvailablePaneShortcutTemplates,
    getAvailablePaneTemplates,
    nonShortcutPaneTemplateItems,
    openPaneTemplateWorkflow,
    paneShortcutItems,
  } = useCommandBarPaneTemplateActions({
    activeCollectionId,
    activeTickerSymbol,
    buildWorkflowDeps: buildSharedWorkflowDeps,
    closeAll,
    config,
    dispatch,

    focusedPaneId,
    notify,
    openForm,
    openModeRoute,
    pluginRegistry,
  });

  const {
    runDirectCommand,

  } = useCommandBarDirectCommandRuntime({
    activeCollectionId,
    activeTickerSymbol,
    buildSharedWorkflowDeps,
    closeAll,
    dispatch,

    notify,
    openBuiltInWorkflow,
    openInlineConfirm,
    openModeRoute,
    openPaneSettings,
    persistConfig,
    pluginRegistry,
    pushRoute,
    quitApp,
    rootThemeBaseIdRef,
    setRootQuery,
    themePickerRef,
  });

  return {

    buildLayoutItems,
    buildPaneSettingItems,

    buildWindowModeItems,

    createPaneTemplateItem,
    createPluginCommandItem,

    getAvailablePaneShortcutTemplates,
    getAvailablePaneTemplates,
    getAvailablePluginCommands,

    nonShortcutPaneTemplateItems,
    openInlineConfirm,
    openModeRoute,
    openPaneTemplateWorkflow,
    openPluginCommandWorkflow,
    paneShortcutItems,
    persistLayoutChange,
    pluginCommandItems,
    pluginCommandResultItems,

    runDirectCommand,

  };
}
