import { useCallback, type Dispatch } from "react";

import {
  addPaneFloating,
  addPaneToLayout,
  bringToFront,
  findDockLeaf,
  getDockedPaneIds,
  isPaneDetached,
  isPaneInLayout,
} from "../../layout/pane-manager";
import type { PluginRegistry } from "../../plugins/registry";
import { PluginOffError, notifyPluginOff } from "../../plugins/plugin-off";
import type { LoadedExternalPlugin } from "../../plugins/loader";
import { resolveTickerForPane, syncConfigActiveLayoutState, type AppAction, type AppState } from "../../state/app/context";
import { scheduleConfigSave } from "../../state/config-save-scheduler";
import { pinFollowingPane } from "../../layout/pane-follow";
import { createPaneInstance, normalizePaneId, normalizePaneLayout, type LayoutConfig, type PaneBinding, type PaneInstanceConfig } from "../../types/config";

import type {
  PaneDef,
  PaneTemplateInstanceConfig,
} from "../../types/plugin";
import type { DialogApi } from "../../ui/dialog";
import {
  resolvePaneShowTarget,
  resolvePaneTarget as resolvePaneTargetInLayout,
  selectEdgeAnchor,
} from "./layout-placement";
import { useAppPaneSettingsRuntime } from "./pane-settings-runtime";
import { useAppPaneTemplateRuntime } from "./pane-template-runtime";
import { bindAppPanePluginRegistry } from "./plugin-bindings";

interface AppPaneRuntimeArgs {

  detachedPaneId: string | null;
  dialog: DialogApi;
  dispatch: Dispatch<AppAction>;
  externalPlugins: readonly LoadedExternalPlugin[];
  /** Desktop main window: raises a detached pane's own window. */
  focusDetachedPane?: (paneId: string) => void;
  isDetachedWindow: boolean;
  notify: (body: string, options?: { type?: "info" | "success" | "error" }) => void;
  persistConfig: (nextConfig: AppState["config"]) => void;
  pluginRegistry: PluginRegistry;
  state: AppState;
  stateRef: { current: AppState };

}

export function useAppPaneRuntime({

  detachedPaneId,
  dialog,
  dispatch,
  externalPlugins,
  focusDetachedPane,
  isDetachedWindow,
  notify,
  persistConfig,
  pluginRegistry,
  state,
  stateRef,

}: AppPaneRuntimeArgs) {
  const resolvePaneTarget = useCallback((paneId: string, layout: LayoutConfig = state.config.layout): string | null => {
    return resolvePaneTargetInLayout(layout, paneId);
  }, [state.config.layout]);

  const persistLayout = useCallback((layout: LayoutConfig, options?: { pushHistory?: boolean; focusedPaneId?: string | null }) => {
    const currentState = stateRef.current;
    const normalizedLayout = normalizePaneLayout(layout, {
      resolveOrphanSymbol: (instanceId) => resolveTickerForPane(currentState, instanceId),
      pinOrphan: pinFollowingPane,
    });
    if (options?.pushHistory !== false) {
      dispatch({ type: "PUSH_LAYOUT_HISTORY" });
    }
    const hasFocusTarget = !!options && Object.prototype.hasOwnProperty.call(options, "focusedPaneId");
    dispatch(hasFocusTarget
      ? { type: "UPDATE_LAYOUT", layout: normalizedLayout, focusedPaneId: options.focusedPaneId ?? null }
      : { type: "UPDATE_LAYOUT", layout: normalizedLayout });
    scheduleConfigSave(syncConfigActiveLayoutState(
      { ...currentState.config, layout: normalizedLayout },
      currentState.paneState,
      hasFocusTarget ? (options.focusedPaneId ?? null) : currentState.focusedPaneId,
    ));
  }, [dispatch, stateRef]);

  const activatePane = useCallback((paneId: string) => {
    dispatch({ type: "FOCUS_PANE", paneId });
  }, [dispatch]);

  const buildPaneInstance = useCallback((paneType: string, options?: {
    title?: string;
    binding?: PaneBinding;
    params?: Record<string, string>;
    settings?: Record<string, unknown>;
    instanceId?: string;
  }): PaneInstanceConfig | null => {
    const normalizedPaneType = normalizePaneId(paneType);
    return createPaneInstance(normalizedPaneType, {
      instanceId: options?.instanceId,
      title: options?.title,
      binding: options?.binding ?? { kind: "none" },
      params: options?.params,
      settings: options?.settings,
    });
  }, []);

  const focusVisiblePane = useCallback((paneId: string, layout: LayoutConfig = state.config.layout) => {
    const nextLayout = layout.floating.some((entry) => entry.instanceId === paneId)
      ? bringToFront(layout, paneId)
      : layout;

    if (nextLayout !== state.config.layout) {
      persistLayout(nextLayout, { pushHistory: false });
    }
    activatePane(paneId);
    // Focus in this window's state alone would leave the pane's window behind this one.
    if (isPaneDetached(nextLayout, paneId)) focusDetachedPane?.(paneId);
  }, [activatePane, focusDetachedPane, persistLayout, state.config.layout]);

  const placePaneInstance = useCallback((
    instance: PaneInstanceConfig,
    paneDef: PaneDef,
    options?: PaneTemplateInstanceConfig,
  ) => {
    const { width, height } = pluginRegistry.getTermSize();
    // Templates can await ticker resolution before placing their pane, so the
    // layout from the render that started the request may be out of date.
    const { config: { layout }, focusedPaneId } = stateRef.current;
    const relativeTo = options?.relativeToPaneId
      ? resolvePaneTarget(options.relativeToPaneId, layout)
      : (focusedPaneId && isPaneInLayout(layout, focusedPaneId) ? focusedPaneId : null);
    const relativePosition = options?.relativePosition ?? "right";
    let nextLayout = layout;
    const dockedPaneIds = getDockedPaneIds(nextLayout);

    if (options?.placement === "floating" || (options?.placement !== "docked" && paneDef.defaultMode === "floating")) {
      nextLayout = addPaneFloating(nextLayout, instance, width, height, paneDef);
    } else if (relativeTo && findDockLeaf(nextLayout, relativeTo)) {
      nextLayout = addPaneToLayout(nextLayout, instance, { relativeTo, position: relativePosition });
    } else if (dockedPaneIds.length === 0) {
      nextLayout = addPaneToLayout(nextLayout, instance, { relativeTo: instance.instanceId, position: "right" });
    } else if (paneDef.defaultPosition === "left") {
      const leftAnchor = selectEdgeAnchor(nextLayout, "left");
      nextLayout = leftAnchor
        ? addPaneToLayout(nextLayout, instance, { relativeTo: leftAnchor, position: "below" })
        : addPaneToLayout(nextLayout, instance, { relativeTo: dockedPaneIds[0]!, position: "left" });
    } else {
      const rightAnchor = selectEdgeAnchor(nextLayout, "right");
      nextLayout = rightAnchor
        ? addPaneToLayout(nextLayout, instance, { relativeTo: rightAnchor, position: "below" })
        : addPaneToLayout(nextLayout, instance, { relativeTo: dockedPaneIds[dockedPaneIds.length - 1]!, position: "right" });
    }

    persistLayout(nextLayout);
    activatePane(instance.instanceId);
  }, [
    activatePane,
    persistLayout,
    pluginRegistry,
    resolvePaneTarget,
    stateRef,
  ]);

  const showPane = useCallback((paneId: string) => {
    const target = resolvePaneShowTarget(state.config.layout, paneId);
    const paneDef = pluginRegistry.panes.get(target.paneType);
    if (!paneDef) return;
    // Its pane would be added, or focused, hidden.
    const owner = pluginRegistry.getDisabledPaneOwner(target.paneType, stateRef.current.config.disabledPlugins);
    if (owner) {
      notifyPluginOff(pluginRegistry, new PluginOffError(owner, paneDef.name), () => pluginRegistry.showPane(paneId));
      return;
    }

    if (target.instance && isPaneInLayout(state.config.layout, target.instance.instanceId)) {
      pluginRegistry.focusPane(target.instance.instanceId);
      return;
    }

    const instance = target.instance ?? buildPaneInstance(target.paneType);
    if (!instance) {
      return;
    }
    placePaneInstance(instance, paneDef, { placement: "default" });
  }, [
    buildPaneInstance,
    notify,
    placePaneInstance,
    pluginRegistry,
    state.config.layout,
    stateRef,
  ]);

  const { createPaneFromTemplate } = useAppPaneTemplateRuntime({
    buildPaneInstance,

    dispatch,
    notify,
    placePaneInstance,
    pluginRegistry,
    stateRef,

  });

  const { openPaneSettings } = useAppPaneSettingsRuntime({

    dialog,
    dispatch,
    persistLayout,
    pluginRegistry,
    resolvePaneTarget,
    stateRef,

  });

  bindAppPanePluginRegistry({
    activatePane,
    buildPaneInstance,
    createPaneFromTemplate,

    detachedPaneId,
    dispatch,
    externalPlugins,
    focusVisiblePane,
    isDetachedWindow,
    openPaneSettings,
    persistConfig,
    persistLayout,
    placePaneInstance,
    pluginRegistry,
    resolvePaneTarget,
    showPane,
    state,
    stateRef,

  });
}
