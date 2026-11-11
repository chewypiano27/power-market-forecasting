import { useCallback, useEffect, useMemo, useRef } from "react";

import type { PluginRegistry } from "../../../plugins/registry";
import type { LayoutBounds } from "../../../layout/pane-manager";

/** Command-bar prefix of the assistant pane. */
import { useRouteListState } from "../routing/list-state";
import { useCommandBarRootRuntime } from "../routes/root/runtime";

import { leadingShortcutCode, parseRootShortcutIntent } from "../routes/root/shortcuts";
import { useCommandBarThemePreview } from "../theme-preview";
import { CommandBarPanel } from "../panel";
import { useCommandBarNavigationState } from "../routing/navigation-state";
import { useCommandBarSelectionRuntime } from "../selection-runtime";
import { useCommandBarPanelRuntime } from "../panel/runtime";
import { useCommandBarRouteEffects } from "../routing/effects";
import { useCommandBarEnvironment } from "./environment";
import { useCommandBarActionRuntime } from "../action-runtime";

interface CommandBarProps {

  pluginRegistry: PluginRegistry;
  quitApp: () => void;
  onNativeOccluderChange?: (rect: LayoutBounds | null) => void;
}

export function CommandBar({

  pluginRegistry,
  quitApp,
  onNativeOccluderChange,
}: CommandBarProps) {
  const {
    activeCollectionId,
    activeFinancials,
    activeTickerData,
    activeTickerSymbol,
    availableCommands: allAvailableCommands,
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
  } = useCommandBarEnvironment();
  const availableCommands = allAvailableCommands;
  const {
    applyThemePreview,
    clearThemePreview,
    commitTheme,
    restoreThemePreview,
    rootThemeBaseIdRef,
  } = useCommandBarThemePreview({
    dispatch,
    getCommittedThemeId,
    themePickerRef,
  });
  const {
    closeAll,
    currentRoute,
    currentRouteRef,
    dismissCommandBar,
    lastMainBrowseRef,
    markRootSelectionNavigated,
    popRoute,
    pushRoute,
    rootHoveredIdx,
    rootModeInfo,
    rootModeKindRef,
    rootQuery,
    rootQueryRef,
    rootSelectionNavigatedRef,
    rootSelectedIdx,
    setRootHoveredIdx,
    setRootQuery,
    setRootSelectedIdx,
    setRouteStack,
    updateTopRoute,
  } = useCommandBarNavigationState({
    availableCommands,
    dispatch,
    initialQuery: state.commandBarQuery,
    restoreThemePreview,
  });

  const closeAfterRun = useCallback((options?: { revertThemePreview?: boolean }) => {
    closeAll(options);
  }, [closeAll]);
  // A click outside the bar, read before closing clears the route it was on.
  const dismissOverlay = useCallback(() => {
    closeAll();
  }, [closeAll]);

  const {

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
    paneShortcutItems,
    persistLayoutChange,
    pluginCommandItems,
    pluginCommandResultItems,

    runDirectCommand,

  } = useCommandBarActionRuntime({
    activeCollectionId,
    activeFinancials,
    activeTickerData,
    activeTickerSymbol,
    closeAll: closeAfterRun,
    config: state.config,

    dispatch,
    focusedPaneId: state.focusedPaneId,
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

    tickers: state.tickers,
  });

  const getTickerSearchTickers = useCallback(() => stateRef.current.tickers, []);
  const hasPaneSettings = useCallback((paneId: string) => pluginRegistry.hasPaneSettings(paneId), [pluginRegistry]);
  const getRecentPaneTemplate = useCallback(
    (id: string, arg?: string) => getAvailablePaneTemplates(arg ? { arg } : undefined, { includePromptableTickerTemplates: true })
      .find((template) => template.id === id),
    [getAvailablePaneTemplates],
  );

  const promptTickerSymbol = null;
  const rootShortcutIntent = useMemo(() => parseRootShortcutIntent({
    query: rootQuery,
    commands: availableCommands,
    pluginCommands: getAvailablePluginCommands(),
    paneTemplates: getAvailablePaneShortcutTemplates(rootQuery),
    activeTicker: activeTickerSymbol,
    promptTicker: promptTickerSymbol,
  }), [activeTickerSymbol, availableCommands, getAvailablePaneShortcutTemplates, getAvailablePluginCommands, promptTickerSymbol, rootQuery]);
  // Every code of an enabled plugin, whether or not it can open here, so text
  // it leads is never answered with only the sign-up offer.
  const leadingCode = useMemo(() => {
    if (rootShortcutIntent.kind !== "none") return null;
    const disabled = new Set(state.config.disabledPlugins ?? []);
    return leadingShortcutCode({
      query: rootQuery,
      commands: availableCommands,
      pluginCommands: getAvailablePluginCommands(),
      paneTemplates: [...pluginRegistry.paneTemplates.values()].filter((template) => {
        const pluginId = pluginRegistry.getPaneTemplatePluginId(template.id);
        return !pluginId || !disabled.has(pluginId);
      }),
    });
  }, [availableCommands, getAvailablePluginCommands, pluginRegistry, rootQuery, rootShortcutIntent.kind, state.config.disabledPlugins]);

  const {
    activeMatch,
    orderedRootResults,
    rootGhostSuffix,
    rootSearching,
    rootSectionOrder,
    rootShortcutFeedback,

  } = useCommandBarRootRuntime({
    activeCollectionId,
    activeTickerData,
    activeTickerSymbol,
    availableCommands,
    buildLayoutItems,
    buildPaneSettingItems,

    buildWindowModeItems,
    createPaneTemplateItem,
    createPluginCommandItem,
    currentRoute,

    getAvailablePaneShortcutTemplates,
    getRecentPaneTemplate,
    leadingShortcutCode: leadingCode,
    getTickers: getTickerSearchTickers,
    hasPaneSettings,

    nativeListScrollRef,
    nonShortcutPaneTemplateItems,
    openModeRoute,
    paneShortcutItems,
    pluginCommandItems,
    pluginCommandResultItems,

    rootModeKind: rootModeInfo.kind,
    rootQuery,
    rootSelectionNavigatedRef,
    rootShortcutIntent,
    runDirectCommand,

    setRootHoveredIdx,
    setRootSelectedIdx,
    skipTickerSearchDebounceRef,
    state,

  });
  // The row plain Enter runs: the best match while the list is untouched. Not
  // the stand-in rows shown while the search for the typed query is out.
  const themePickerActive = !currentRoute && activeMatch?.command.id === "theme";
  const themePickerFilter = themePickerActive ? activeMatch.arg : "";
  // A theme picked from the root ("TH dracula", Enter) is the typed shortcut
  // running, so the visit reports it as it closes.
  const commitRootTheme = useCallback((themeId: string) => {
    commitTheme(themeId);
  }, [commitTheme]);

  const {
    acceptRootShortcutTab,
    acceptSelectedShortcutTab,
    activateListSelection,
    runRootQuery,
    setActiveListQuery,
  } = useCommandBarSelectionRuntime({
    activeTickerSymbol,
    promptTickerSymbol,
    availableCommands,
    clearThemePreview,
    closeAll: closeAfterRun,

    createPaneTemplateItem,
    createPluginCommandItem,
    currentRoute,
    currentRouteRef,

    getAvailablePaneShortcutTemplates,
    getAvailablePluginCommands,
    openInlineConfirm,
    openModeRoute,
    openPaneTemplateWorkflow,
    persistLayoutChange,
    pluginCommandResultItems,
    pluginRegistry,
    rootModeKindRef,
    rootQuery,
    rootQueryRef,
    rootSelectionNavigatedRef,
    rootShortcutIntent,
    rootThemeBaseIdRef,
    runDirectCommand,

    setRootQuery,
    stateConfigLayout: state.config.layout,
    stateRef,
    updateTopRoute,
    visibleListStateRef,
  });

  // A key bound to command bar text opens the bar with a run-query launch:
  // the text is submitted exactly as if typed and entered, once per request,
  // and text the parser cannot run stays in the input. What a key runs is not
  // a search, so the visit ends with no report.
  const processedRunQuerySequenceRef = useRef<number | null>(null);
  useEffect(() => {
    const launch = state.commandBarLaunchRequest;
    if (!launch || launch.kind !== "run-query" || !state.commandBarOpen) return;
    if (processedRunQuerySequenceRef.current === launch.sequence) return;
    processedRunQuerySequenceRef.current = launch.sequence;
    runRootQuery(launch.query);
  }, [runRootQuery, state.commandBarLaunchRequest, state.commandBarOpen]);

  const routeListState = useRouteListState({
    activeMatch,

    buildLayoutItems,
    currentRoute,
    orderedRootResults,
    rootHoveredIdx,
    rootModeKind: rootModeInfo.kind,
    rootQuery,
    rootSectionOrder,
    rootSearching,
    rootSelectedIdx,

  });
  useCommandBarRouteEffects({
    clearThemePreview,
    committedThemeId: state.config.theme,
    currentRoute,
    lastMainBrowseRef,
    rootModeKind: rootModeInfo.kind,
    rootQuery,
    rootSelectedIdx,
    rootThemeBaseIdRef,
  });

  const panelProps = useCommandBarPanelRuntime({
    acceptRootShortcutTab,
    acceptSelectedShortcutTab,
    activateListSelection,
    applyThemePreview,
    cellHeightPx,
    cellWidthPx,
    closeAll: closeAfterRun,
    commitTheme: commitRootTheme,
    committedThemeId: state.config.theme,
    currentRoute,
    currentRouteRef,
    dismissCommandBar,
    dismissOverlay,
    markRootSelectionNavigated,
    nativeListScrollRef,
    nativePaneChrome,
    nativeWindowChrome,
    onNativeOccluderChange,
    persistConfig,
    popRoute,
    rootModeKind: rootModeInfo.kind,
    rootGhostSuffix,
    rootShortcutFeedback,
    routeListState,
    setActiveListQuery,
    setRootHoveredIdx,
    setRootSelectedIdx,
    setRouteStack,
    stateRef,
    termHeight,
    termWidth,
    themePickerActive,
    themePickerFilter,
    themePickerRef,
    titleBarOverlay,
    updateTopRoute,
    visibleListStateRef,
  });

  return (
    <CommandBarPanel {...panelProps} />
  );
}
