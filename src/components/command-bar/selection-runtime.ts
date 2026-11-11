import { useCallback, type MutableRefObject } from "react";
import type { AppState } from "../../state/app/context";

import type { PluginRegistry } from "../../plugins/registry";
import type { Command } from "./commands/registry";
import type {
  CommandDef,
  PaneTemplateCreateOptions,
  PaneTemplateDef,
} from "../../types/plugin";
import { resolveCommandBarMode, type CommandBarMode } from "./view-model";
import type { ListScreenState, ResultItem } from "./list/model";
import type { CommandBarRoute } from "./workflow/types";

import {
  acceptRootShortcutTabAction,
  buildImmediateRootSelection,
} from "./routes/root/selection";
import type { OpenInlineConfirm } from "./routing/confirm";
import { activatePickerSelectionAction } from "./picker-activation";
import type { ShortcutIntent } from "./routes/root/shortcuts";

type OpenModeRouteFn = (
  screen: "ticker-search" | "layout",
  initialQuery?: string,
  payload?: Record<string, unknown>,
) => void;

interface UseCommandBarSelectionRuntimeOptions {
  activeTickerSymbol: string | null;
  promptTickerSymbol?: string | null;
  availableCommands: Command[];
  clearThemePreview: (themeId: string) => void;
  closeAll: (options?: { revertThemePreview?: boolean }) => void;

  createPaneTemplateItem: (template: PaneTemplateDef, options?: {
    category?: string;
    createOptions?: PaneTemplateCreateOptions;
    showShortcut?: boolean;
    shortcutExecution?: boolean;
  }) => ResultItem;
  createPluginCommandItem: (command: CommandDef, options?: { shortcutArg?: string }) => ResultItem;
  currentRoute: CommandBarRoute | null;
  currentRouteRef: MutableRefObject<CommandBarRoute | null>;

  getAvailablePaneShortcutTemplates: (query: string) => PaneTemplateDef[];
  getAvailablePluginCommands: () => CommandDef[];
  openInlineConfirm: OpenInlineConfirm;
  openModeRoute: OpenModeRouteFn;
  openPaneTemplateWorkflow: (template: PaneTemplateDef, options?: { arg?: string }) => void;
  persistLayoutChange: (nextLayout: AppState["config"]["layout"]) => void;
  pluginCommandResultItems: (command: CommandDef, shortcutArg: string) => ResultItem[];
  pluginRegistry: PluginRegistry;
  rootModeKindRef: MutableRefObject<CommandBarMode>;
  rootQuery: string;
  rootQueryRef: MutableRefObject<string>;
  rootSelectionNavigatedRef: MutableRefObject<boolean>;
  rootShortcutIntent: ShortcutIntent;
  rootThemeBaseIdRef: MutableRefObject<string | null>;
  runDirectCommand: (command: Command, arg: string) => void;
  /**
   * The command-search report, which runs each root row (and Tab on a typed
   * shortcut) so it can tell a row that ran from one that only opened a route
   * or rewrote the query. It never holds the row up.
   */

  setRootQuery: (query: string) => void;
  stateConfigLayout: AppState["config"]["layout"];
  stateRef: MutableRefObject<AppState>;
  updateTopRoute: (updater: (route: CommandBarRoute) => CommandBarRoute) => void;
  visibleListStateRef: MutableRefObject<ListScreenState | null>;
}

export function useCommandBarSelectionRuntime({
  activeTickerSymbol,
  promptTickerSymbol = null,
  availableCommands,
  clearThemePreview,
  closeAll,

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
  stateConfigLayout,
  stateRef,
  updateTopRoute,
  visibleListStateRef,
}: UseCommandBarSelectionRuntimeOptions) {
  const startThemePicker = useCallback((arg: string) => {
    rootThemeBaseIdRef.current = stateRef.current.config.theme;
    setRootQuery(arg ? `TH ${arg}` : "TH ");
  }, [rootThemeBaseIdRef, setRootQuery, stateRef]);

  const acceptSelectedShortcutTab = useCallback((): boolean => {
    const listState = visibleListStateRef.current;
    if (listState?.kind !== "root") return false;

    const selected = listState.results[listState.selectedIdx];
    const shortcutQuery = selected?.shortcutQuery?.trim();
    if (!shortcutQuery) return false;

    setRootQuery(`${shortcutQuery} `);
    return true;
  }, [setRootQuery, visibleListStateRef]);

  const resolveImmediateRootSelection = useCallback((query: string): ResultItem | null => buildImmediateRootSelection({
    activeTickerSymbol,
    promptTickerSymbol,
    availableCommands,
    createPaneTemplateItem,
    createPluginCommandItem,

    getAvailablePaneShortcutTemplates,
    getAvailablePluginCommands,
    openModeRoute,
    openPaneTemplateWorkflow,
    pluginCommandResultItems,
    query,
    runDirectCommand,

    setRootQuery,
    startThemePicker,
  }), [
    activeTickerSymbol,
    promptTickerSymbol,
    availableCommands,
    createPaneTemplateItem,
    createPluginCommandItem,

    getAvailablePaneShortcutTemplates,
    getAvailablePluginCommands,
    openModeRoute,
    openPaneTemplateWorkflow,
    pluginCommandResultItems,
    runDirectCommand,

    setRootQuery,
    startThemePicker,
  ]);

  /**
   * Tab on a typed shortcut: it completes the prefix, or opens what the
   * shortcut starts (a ticker search in the bar, a pane form in the form
   * modal), which is the typed text running.
   */
  const acceptRootShortcutTab = useCallback((): boolean => {
    const query = rootQueryRef.current;
    const accept = () => acceptRootShortcutTabAction({
      activeTickerSymbol,
      promptTickerSymbol,
      availableCommands,
      createPaneTemplateItem,
      createPluginCommandItem,

      getAvailablePaneShortcutTemplates,
      getAvailablePluginCommands,
      openModeRoute,
      openPaneTemplateWorkflow,
      pluginCommandResultItems,
      query,
      runDirectCommand,

      setRootQuery,
      startThemePicker,
    });
    return accept();
  }, [
    activeTickerSymbol,
    promptTickerSymbol,
    availableCommands,
    createPaneTemplateItem,
    createPluginCommandItem,

    getAvailablePaneShortcutTemplates,
    getAvailablePluginCommands,
    openModeRoute,
    openPaneTemplateWorkflow,
    pluginCommandResultItems,
    resolveImmediateRootSelection,
    rootQueryRef,
    runDirectCommand,

    setRootQuery,
    startThemePicker,
  ]);

  /**
   * Runs `query` exactly as if it had been typed into the root bar and
   * submitted, so AI-suggested inputs take the same prefix/arg path as anything
   * the user types. Argless prefixes reject a trailing argument outright
   * ("ERN NVDA" resolves to nothing), so the bare prefix gets a second try
   * before the text is merely dropped into the input. Returns whether a row
   * ran.
   */
  const runRootQuery = useCallback((query: string, options?: { fallbackPrefix?: string }): boolean => {
    const item = resolveImmediateRootSelection(query);
    if (item && !item.disabled) {
      void item.action();
      return true;
    }
    const trimmed = query.trim();
    const fallbackPrefix = (options?.fallbackPrefix ?? trimmed.split(/\s+/)[0] ?? "").trim();
    if (fallbackPrefix && fallbackPrefix.toUpperCase() !== trimmed.toUpperCase()) {
      const fallbackItem = resolveImmediateRootSelection(fallbackPrefix);
      if (fallbackItem && !fallbackItem.disabled) {
        void fallbackItem.action();
        return true;
      }
    }
    setRootQuery(query);
    return false;
  }, [resolveImmediateRootSelection, setRootQuery]);

  const setActiveListQuery = useCallback((nextQuery: string) => {
    const route = currentRouteRef.current;
    if (!route) {
      if (rootModeKindRef.current === "themes" && resolveCommandBarMode(nextQuery, availableCommands).kind !== "themes") {
        clearThemePreview(rootThemeBaseIdRef.current ?? stateRef.current.config.theme);
        rootThemeBaseIdRef.current = null;
      }
      setRootQuery(nextQuery);
      return;
    }

    updateTopRoute((route) => ({ ...route, query: nextQuery, selectedIdx: 0, hoveredIdx: null }));
  }, [
    availableCommands,
    clearThemePreview,
    currentRouteRef,
    rootModeKindRef,
    rootThemeBaseIdRef,
    setRootQuery,
    stateRef,
    updateTopRoute,
  ]);

  const activateListSelection = useCallback((options?: { secondary?: boolean; item?: ResultItem }) => {
    const listState = visibleListStateRef.current;
    if (!listState) return;
    const queryChanged = rootQueryRef.current !== rootQuery;
    const submitTyped = !options?.item && !currentRoute
      && (queryChanged || !rootSelectionNavigatedRef.current);
    const typed = submitTyped && queryChanged
      ? resolveImmediateRootSelection(rootQueryRef.current) : null;
    const selected = options?.item ?? typed ?? listState.results[listState.selectedIdx];
    if (!selected || selected.disabled) return;

    const run = () => {
      if (options?.secondary && selected.secondaryAction) {
        void selected.secondaryAction();
        return;
      }

      if (currentRoute?.kind === "picker") {
        activatePickerSelectionAction({
          closeAll,

          layout: stateConfigLayout,
          openInlineConfirm,
          persistLayoutChange,
          pluginRegistry,
          route: currentRoute,
          selectedId: selected.id,
        });
        return;
      }

      void selected.action();
    };
    run();
  }, [
    closeAll,

    currentRoute,

    openInlineConfirm,
    persistLayoutChange,
    pluginRegistry,
    resolveImmediateRootSelection,
    rootQuery,
    rootQueryRef,
    rootSelectionNavigatedRef,
    rootShortcutIntent,

    stateConfigLayout,
    stateRef,
    visibleListStateRef,
  ]);

  return {
    acceptRootShortcutTab,
    acceptSelectedShortcutTab,
    activateListSelection,
    runRootQuery,
    setActiveListQuery,
  };
}
