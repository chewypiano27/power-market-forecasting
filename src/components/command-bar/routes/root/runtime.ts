import { useLayoutEffect, useMemo, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ScrollBoxRenderable } from "../../../../ui";
import type { AppState } from "../../../../state/app/context";

import type { CommandDef, PaneTemplateCreateOptions, PaneTemplateDef } from "../../../../types/plugin";
import type { TickerRecord } from "../../../../types/ticker";

import { matchPrefix, type Command } from "../../commands/registry";
import { orderListResults, type ResultItem } from "../../list/model";
import type { CommandBarCategoryPriorities, CommandBarSectionOrder } from "../../view-model";
import type { CommandBarRoute } from "../../workflow/types";

import { buildRootResultModel, type RootResultModel } from "./results";

import { buildRootShortcutFeedback } from "./shortcut-feedback";
import type { ShortcutIntent } from "./shortcuts";
import { clampIndex } from "../../../../utils/math";

/** A row plain Enter can run, so the untouched selection may rest on it. */
function isDefaultSelectable(item: ResultItem): boolean {
  return item.disabled !== true && item.defaultSelectable !== false;
}

interface UseCommandBarRootRuntimeOptions {
  activeCollectionId: string | null;
  activeTickerData: TickerRecord | null | undefined;
  activeTickerSymbol: string | null;
  availableCommands: Command[];
  bindKey?: (query: string) => void;
  buildLayoutItems(query: string, options?: { confirmDangerousActions?: boolean }): ResultItem[];
  buildPaneSettingItems(paneId: string | null, query: string): ResultItem[];

  buildWindowModeItems(arg: string): ResultItem[];
  createPaneTemplateItem(template: PaneTemplateDef, options?: {
    category?: string;
    createOptions?: PaneTemplateCreateOptions;
    showShortcut?: boolean;
    shortcutExecution?: boolean;
  }): ResultItem;
  createPluginCommandItem(command: CommandDef, options?: { shortcutArg?: string }): ResultItem;
  currentRoute: CommandBarRoute | null;

  getAvailablePaneShortcutTemplates(query: string): PaneTemplateDef[];
  getRecentPaneTemplate?: (id: string, arg?: string) => PaneTemplateDef | undefined;
  leadingShortcutCode?: string | null;
  getTickers(): AppState["tickers"];
  hasPaneSettings(paneId: string): boolean;

  nativeListScrollRef: RefObject<ScrollBoxRenderable | null>;
  nonShortcutPaneTemplateItems(filterQuery?: string): ResultItem[];
  openModeRoute(screen: "ticker-search" | "layout", initialQuery?: string): void;
  paneShortcutItems(options?: {
    filterQuery?: string;
    createOptions?: PaneTemplateCreateOptions;
    includePromptableTickerTemplates?: boolean;
  }): ResultItem[];
  pluginCommandItems(): ResultItem[];
  pluginCommandResultItems(command: CommandDef, shortcutArg: string): ResultItem[];
  pluginInstallItem?: ResultItem | null;
  providerResultItems?: ResultItem[];
  providerMatchItems?: ResultItem[];
  providerCategoryPriorities?: CommandBarCategoryPriorities;
  providerSearching?: boolean;

  rootModeKind: string;
  rootQuery: string;
  rootSelectionNavigatedRef: RefObject<boolean>;
  rootShortcutIntent: ShortcutIntent;
  runDirectCommand(command: Command, arg: string): void;

  setRootHoveredIdx: Dispatch<SetStateAction<number | null>>;
  setRootSelectedIdx: Dispatch<SetStateAction<number>>;
  skipTickerSearchDebounceRef: RefObject<boolean>;
  state: AppState;

}

export function useCommandBarRootRuntime({
  activeCollectionId,
  activeTickerData,
  activeTickerSymbol,
  availableCommands,
  bindKey,
  buildLayoutItems,
  buildPaneSettingItems,

  buildWindowModeItems,
  createPaneTemplateItem,
  createPluginCommandItem,
  currentRoute,

  getAvailablePaneShortcutTemplates,
  getRecentPaneTemplate,
  leadingShortcutCode,
  getTickers,
  hasPaneSettings,

  nativeListScrollRef,
  nonShortcutPaneTemplateItems,
  openModeRoute,
  paneShortcutItems,
  pluginCommandItems,
  pluginCommandResultItems,
  pluginInstallItem = null,
  providerResultItems = [],
  providerMatchItems = [],
  providerCategoryPriorities,
  providerSearching = false,

  rootModeKind,
  rootQuery,
  rootSelectionNavigatedRef,
  rootShortcutIntent,
  runDirectCommand,

  setRootHoveredIdx,
  setRootSelectedIdx,
  skipTickerSearchDebounceRef,
  state,

}: UseCommandBarRootRuntimeOptions): {
  activeMatch: ReturnType<typeof matchPrefix>;
  orderedRootResults: ResultItem[];
  rootGhostSuffix: string | null;
  rootResultModel: RootResultModel;
  rootResultsCurrent: boolean;
  rootSearching: boolean;
  rootSectionOrder: CommandBarSectionOrder;
  rootShortcutFeedback: string | null;
  rootShortcutIntent: ShortcutIntent;

} {
  const previousRootSelectionContextRef = useRef<{ query: string; mode: string } | null>(null);
  const previousRootResultIdsRef = useRef<string[]>([]);
  const activeMatch = matchPrefix(rootQuery, availableCommands);

  const rootResultModel = useMemo(() => buildRootResultModel({
    activeCollectionId,
    activeTickerData,
    activeTickerSymbol,
    availableCommands,
    bindKey,
    buildLayoutItems,
    buildPaneSettingItems,

    buildWindowModeItems,
    createPaneTemplateItem,
    createPluginCommandItem,
    currentRoute,

    getAvailablePaneShortcutTemplates,
    getRecentPaneTemplate,
    hasPaneSettings,
    leadingShortcutCode,

    nonShortcutPaneTemplateItems,
    openModeRoute,
    paneShortcutItems,
    pluginCommandItems,
    pluginCommandResultItems,
    pluginInstallItem,
    rootQuery,
    rootShortcutIntent,
    providerResultItems,
    providerMatchItems,
    runDirectCommand,

    state,

  }), [
    activeCollectionId,
    activeTickerData,
    activeTickerSymbol,
    availableCommands,
    bindKey,
    buildLayoutItems,
    buildPaneSettingItems,

    buildWindowModeItems,
    createPaneTemplateItem,
    createPluginCommandItem,
    currentRoute,

    getAvailablePaneShortcutTemplates,
    getRecentPaneTemplate,
    hasPaneSettings,
    leadingShortcutCode,

    nonShortcutPaneTemplateItems,
    openModeRoute,
    paneShortcutItems,
    pluginCommandItems,
    pluginCommandResultItems,
    pluginInstallItem,
    rootQuery,
    rootShortcutIntent,
    providerResultItems,
    providerMatchItems,
    runDirectCommand,

    state,

  ]);

  const orderedRootResults = useMemo(() => orderListResults(rootResultModel.items, { sectionOrder: "default", categoryPriorities: providerCategoryPriorities }), [rootResultModel.items, providerCategoryPriorities]);
  const rootSearching = providerSearching;
  const rootSectionOrder = "default" as const;
  useLayoutEffect(() => {
    if (currentRoute) return;

    const resultIds = orderedRootResults.map((item) => item.id);
    const previousResultIds = previousRootResultIdsRef.current;
    previousRootResultIdsRef.current = resultIds;

    setRootHoveredIdx((current) => (current != null && current < resultIds.length ? current : null));

    const selectionContextChanged =
      previousRootSelectionContextRef.current?.query !== rootQuery
      || previousRootSelectionContextRef.current?.mode !== rootModeKind;
    previousRootSelectionContextRef.current = { query: rootQuery, mode: rootModeKind };
    if (selectionContextChanged) {
      rootSelectionNavigatedRef.current = false;
    }

    setRootSelectedIdx((current) => {
      if (rootSelectionNavigatedRef.current) {
        // The user picked this row. Async sections append below it, but an
        // exact symbol match still lands above, so the row is tracked by id
        // rather than by index.
        const selectedId = previousResultIds[current];
        const shiftedIdx = selectedId ? resultIds.indexOf(selectedId) : -1;
        if (shiftedIdx >= 0) return shiftedIdx;
        return clampIndex(current, resultIds.length);
      }
      // Untouched, the selection follows the best row on offer.
      const defaultIdx = orderedRootResults.findIndex(isDefaultSelectable);
      return clampIndex(Math.max(rootResultModel.initialIdx, defaultIdx), resultIds.length);
    });
  }, [
    activeMatch?.command.id,
    currentRoute,
    orderedRootResults,
    rootModeKind,
    rootQuery,
    rootResultModel.initialIdx,
    rootSelectionNavigatedRef,
    setRootHoveredIdx,
    setRootSelectedIdx,
  ]);

  const rootGhostCompletion = !currentRoute && rootShortcutIntent.kind === "inferred-complete"
    ? rootShortcutIntent.completionQuery
    : null;
  const rootGhostSuffix = rootGhostCompletion && rootGhostCompletion.startsWith(rootQuery)
    ? rootGhostCompletion.slice(rootQuery.length)
    : null;
  const rootShortcutFeedback = useMemo(() => buildRootShortcutFeedback({
    currentRoute,
    rootShortcutIntent,
  }), [activeCollectionId, activeTickerSymbol, currentRoute, rootShortcutIntent, state]);

  return {
    activeMatch,
    orderedRootResults,
    rootGhostSuffix,
    rootResultModel,
    rootResultsCurrent: true,
    rootSearching,
    rootSectionOrder,
    rootShortcutFeedback,
    rootShortcutIntent,

  };
}
