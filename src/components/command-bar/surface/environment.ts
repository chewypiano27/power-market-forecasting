import { useAppLanguage } from "../../../i18n/react";
import { useCallback, useMemo, useRef } from "react";
import { useUiCapabilities, type ScrollBoxRenderable } from "../../../ui";
import { useViewport } from "../../../react/input";
import { syncConfigActiveLayoutState, useAppDispatch, useAppSelector, type AppState } from "../../../state/app/context";
import { scheduleConfigSave } from "../../../state/config-save-scheduler";
import { commands } from "../commands/registry";
import type { ThemePickerHandle } from "../theme-picker";
import type { ListScreenState } from "../list/model";

/** Saves a config with the live layout state folded in, as every workflow write does. */
export function persistWorkflowConfig(state: AppState, nextConfig: AppState["config"]): void {
  scheduleConfigSave(syncConfigActiveLayoutState(
    nextConfig,
    state.paneState,
    state.focusedPaneId,
  ));
}

function useCommandBarAppState(): AppState {
  const config = useAppSelector((state) => state.config);
  const paneState = useAppSelector((state) => state.paneState);
  const tickers = useAppSelector((state) => state.tickers);
  const focusedPaneId = useAppSelector((state) => state.focusedPaneId);
  const layoutHistory = useAppSelector((state) => state.layoutHistory);
  const recentTickers = useAppSelector((state) => state.recentTickers);
  const commandBarOpen = useAppSelector((state) => state.commandBarOpen);
  const commandBarQuery = useAppSelector((state) => state.commandBarQuery);
  const commandBarLaunchRequest = useAppSelector((state) => state.commandBarLaunchRequest);

  return useMemo(() => ({
    config,
    paneState,
    tickers,
    focusedPaneId,
    layoutHistory,
    recentTickers,
    commandBarOpen,
    commandBarQuery,
    commandBarLaunchRequest,
  }) as AppState, [
    commandBarLaunchRequest,
    commandBarOpen,
    commandBarQuery,
    config,
    focusedPaneId,
    layoutHistory,
    paneState,
    recentTickers,
    tickers,
  ]);
}

export function useCommandBarEnvironment() {
  useAppLanguage();
  const dispatch = useAppDispatch();
  const state = useCommandBarAppState();
  const stateRef = useRef(state);
  stateRef.current = state;
  const persistConfig = useCallback((nextConfig: AppState["config"]) => {
    persistWorkflowConfig(stateRef.current, nextConfig);
  }, []);
  const activeTickerSymbol = null;
  const activeTickerData = null;
  const activeFinancials = null;
  const { width: termWidth, height: termHeight } = useViewport();
  const {
    nativePaneChrome: nativePaneChromeCapability,
    cellWidthPx = 8,
    cellHeightPx = 18,
    nativeWindowChrome,
    titleBarOverlay,
    windowControls,
  } = useUiCapabilities();
  const nativePaneChrome = nativePaneChromeCapability === true;
  // Same test the header uses before it draws its own window buttons.
  const drawsWindowControls = (nativeWindowChrome ?? titleBarOverlay) === true && windowControls === "windows";
  const availableCommands = useMemo(
    () => commands.filter((command) => {
      if (command.id === "cycle-chart-renderer") return !nativePaneChrome;
      if (command.id === "minimize-window" || command.id === "maximize-window") return drawsWindowControls;
      return true;
    }),
    [drawsWindowControls, nativePaneChrome],
  );
  const skipTickerSearchDebounceRef = useRef(false);
  const nativeListScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const themePickerRef = useRef<ThemePickerHandle | null>(null);
  const visibleListStateRef = useRef<ListScreenState | null>(null);
  const activeCollectionId = null;
  const getCommittedThemeId = useCallback(() => stateRef.current.config.theme, []);

  return {
    activeCollectionId,
    activeFinancials,
    activeTickerData,
    activeTickerSymbol,
    availableCommands,
    cellHeightPx,
    cellWidthPx,
    dispatch,
    getCommittedThemeId,
    nativeListScrollRef,
    nativePaneChrome,
    nativeWindowChrome,
    persistConfig,
    skipTickerSearchDebounceRef,
    state,
    stateRef,
    termHeight,
    termWidth,
    themePickerRef,
    titleBarOverlay,
    visibleListStateRef,
  };
}
