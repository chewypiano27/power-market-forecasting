import { useCallback, type Dispatch } from "react";
import { createPaneInstance, findPaneInstance, type LayoutConfig } from "../../types/config";
import {
  addPaneFloating,
  addPaneToLayout,
} from "../../layout/pane-manager";
import type { PluginRegistry } from "../../plugins/registry";

import type { AppAction, AppState } from "../../state/app/context";

interface CommandBarPaneActionsOptions {
  dispatch: Dispatch<AppAction>;
  pluginRegistry: PluginRegistry;
  stateRef: { current: AppState };
}

export function useCommandBarPaneActions({
  dispatch,
  pluginRegistry,
  stateRef,
}: CommandBarPaneActionsOptions) {

  const persistLayoutChange = useCallback((nextLayout: LayoutConfig) => {
    pluginRegistry.updateLayout(nextLayout);
  }, [pluginRegistry]);

  const duplicatePane = useCallback((paneId: string) => {
    const currentState = stateRef.current;
    const pane = findPaneInstance(currentState.config.layout, paneId);
    if (!pane) return;
    const paneDef = pluginRegistry.panes.get(pane.paneId);
    if (!paneDef) return;

    const duplicate = createPaneInstance(pane.paneId, {
      title: pane.title,
      binding: pane.binding,
      params: pane.params,
      settings: pane.settings,
    });

    const { width, height } = pluginRegistry.getTermSize();
    const nextLayout = currentState.config.layout.floating.some((entry) => entry.instanceId === paneId)
      ? addPaneFloating(currentState.config.layout, duplicate, width, height, paneDef)
      : addPaneToLayout(currentState.config.layout, duplicate, { relativeTo: paneId, position: "right" });
    persistLayoutChange(nextLayout);
    dispatch({ type: "FOCUS_PANE", paneId: duplicate.instanceId });
  }, [dispatch, persistLayoutChange, pluginRegistry, stateRef]);

  return {
    duplicatePane,

    persistLayoutChange,
  };
}
