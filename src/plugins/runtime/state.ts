import { useCallback, useRef, type SetStateAction } from "react";
import {
  useAppDispatch,
  useAppSelector,
  useAppStateRef,
  useOptionalPaneInstanceId,
} from "../../state/app/context";
import { usePluginRenderContext } from "./context";

import { getPluginPaneStateValue } from "../../layout/pane-state";

export function usePluginPaneState<T>(key: string, fallback: T, paneId?: string): [T, (value: SetStateAction<T>) => void] {
  const { pluginId } = usePluginRenderContext();
  const contextPaneId = useOptionalPaneInstanceId();
  const scopedPaneId = paneId ?? contextPaneId;
  if (!scopedPaneId) throw new Error("usePluginPaneState requires a pane id or PaneInstanceProvider");
  const dispatch = useAppDispatch();
  const stateRef = useAppStateRef();
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const value = useAppSelector((state) => (
    getPluginPaneStateValue(state.paneState[scopedPaneId], pluginId, key, fallback)
  ));

  const setValue = useCallback((nextValue: SetStateAction<T>) => {
    const currentPaneState = stateRef.current.paneState[scopedPaneId];
    const currentValue = getPluginPaneStateValue(
      currentPaneState,
      pluginId,
      key,
      fallbackRef.current,
    );
    const resolved = typeof nextValue === "function"
      ? (nextValue as (previousValue: T) => T)(currentValue)
      : nextValue;

    if (Object.is(resolved, currentValue)) {
      return;
    }

    dispatch({
      type: "UPDATE_PLUGIN_PANE_STATE",
      paneId: scopedPaneId,
      pluginId,
      key,
      value: resolved,
    });
  }, [dispatch, key, pluginId, scopedPaneId, stateRef]);

  return [value, setValue];
}

export function usePluginConfigState<T>(key: string, fallback: T): [T, (value: SetStateAction<T>) => void] {
  const { pluginId, runtime } = usePluginRenderContext();
  const stateRef = useAppStateRef();
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const value = useAppSelector((state) => (
    (state.config.pluginConfig[pluginId]?.[key] as T | undefined) ?? fallback
  ));

  const setValue = useCallback((nextValue: SetStateAction<T>) => {
    const currentValue =
      (stateRef.current.config.pluginConfig[pluginId]?.[key] as T | undefined) ??
      fallbackRef.current;
    const resolved = typeof nextValue === "function"
      ? (nextValue as (previousValue: T) => T)(currentValue)
      : nextValue;
    if (Object.is(resolved, currentValue)) {
      return;
    }
    void runtime.setConfigState(pluginId, key, resolved);
  }, [key, pluginId, runtime, stateRef]);

  return [value, setValue];
}
