import { useCallback, type Dispatch, type MutableRefObject } from "react";
import type { PluginRegistry } from "../../../plugins/registry";
import { useAppGetState, type AppAction, type AppState } from "../../../state/app/context";
import { t } from "../../../i18n";
import type { TickerFinancials } from "../../../types/financials";
import type { TickerRecord } from "../../../types/ticker";

import {
  buildLayoutResultItems,
  buildWindowModeResultItems,
} from "../layout-items";
import type { ResultItem } from "../list/model";
import { buildPaneSettingResultItems } from "../pane-settings";
import type { CommandBarRoute } from "../workflow/types";
import type { OpenInlineConfirm } from "./confirm";

type CloseAll = (options?: { revertThemePreview?: boolean }) => void;
type Notify = (body: string, options?: { type?: "info" | "success" | "error"; duration?: number }) => void;
type OpenModeRoute = (
  screen: "ticker-search" | "layout",
  initialQuery?: string,
  payload?: Record<string, unknown>,
) => void;

interface UseCommandBarRouteActionsOptions {
  activeCollectionId: string | null;
  activeFinancials: TickerFinancials | null;
  activeTickerData: TickerRecord | null;
  activeTickerSymbol: string | null;
  closeAll: CloseAll;
  dispatch: Dispatch<AppAction>;
  duplicatePane: (paneId: string) => void;
  notify: Notify;

  openBuiltInWorkflow: (actionId: string) => void;
  openInlineConfirm: OpenInlineConfirm;
  openModeRoute: OpenModeRoute;
  persistConfig: (nextConfig: AppState["config"]) => void;
  persistLayoutChange: (layout: AppState["config"]["layout"]) => void;
  pluginRegistry: PluginRegistry;
  pushRoute: (route: CommandBarRoute) => void;
  state: AppState;
  stateRef: MutableRefObject<AppState>;
}

export function useCommandBarRouteActions({
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
}: UseCommandBarRouteActionsOptions) {
  const getState = useAppGetState();
  const buildWindowModeItems = useCallback((arg: string): ResultItem[] => buildWindowModeResultItems({
    arg,
    closeAll,
    focusedPaneId: state.focusedPaneId,
    pluginRegistry,
  }), [closeAll, pluginRegistry, state.focusedPaneId]);

  const buildLayoutItems = useCallback((
    query: string,
    options?: { confirmDangerousActions?: boolean },
  ): ResultItem[] => buildLayoutResultItems({
    closeAll,
    confirmDangerousActions: options?.confirmDangerousActions,
    dispatch,
    duplicatePane,
    getState,
    openBuiltInWorkflow,
    openInlineConfirm,
    persistLayoutChange,
    pluginRegistry,
    pushRoute,
    query,
    state,
  }), [
    closeAll,
    dispatch,
    duplicatePane,
    getState,
    openBuiltInWorkflow,
    openInlineConfirm,
    persistLayoutChange,
    pluginRegistry,
    pushRoute,
    state,
  ]);

  /**
   * The real pane settings dialog, on the chosen setting when there is one.
   * The bar closes first: it would take the dialog's keys, and on the desktop
   * it would cover it.
   */
  const openPaneSettings = useCallback((paneId: string | null, fieldKey?: string) => {
    if (!paneId || !pluginRegistry.hasPaneSettings(paneId)) {
      notify(t("The focused pane has no settings."), { type: "info" });
      return;
    }
    closeAll({ revertThemePreview: false });
    pluginRegistry.openPaneSettings(paneId, fieldKey ? { fieldKey } : undefined);
  }, [closeAll, notify, pluginRegistry]);

  const buildPaneSettingItems = useCallback((
    paneId: string | null,
    query: string,
  ): ResultItem[] => buildPaneSettingResultItems({
    openPaneSettings,
    paneId,
    pluginRegistry,
    query,
  }), [
    openPaneSettings,
    pluginRegistry,
  ]);

  return {
    buildLayoutItems,
    buildPaneSettingItems,
    buildWindowModeItems,

    openPaneSettings,

  };
}
