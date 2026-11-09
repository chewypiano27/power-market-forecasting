import { useMemo } from "react";
import {
  getEmptyState,
  type CommandBarCategoryPriorities,
  type CommandBarMode,
  type CommandBarSectionOrder,
} from "../view-model";
import {
  getScreenFooterLeft,
  getScreenFooterRight,
} from "../helpers";
import {
  orderListResults,
  type ListScreenState,
  type ResultItem,
} from "../list/model";
import type { matchPrefix } from "../commands/registry";
import { fuzzyFilter } from "../../../utils/fuzzy-search";
import type { CommandBarRoute } from "../workflow/types";
import { t, tc } from "../../../i18n";

type ActiveCommandMatch = ReturnType<typeof matchPrefix>;

interface BuildRouteListStateOptions {
  activeMatch: ActiveCommandMatch;

  buildLayoutItems: (query: string) => ResultItem[];
  currentRoute: CommandBarRoute | null;
  orderedRootResults: ResultItem[];
  rootHoveredIdx: number | null;
  rootModeKind: CommandBarMode;
  rootQuery: string;
  rootCategoryPriorities?: CommandBarCategoryPriorities;
  rootSearching: boolean;
  rootSectionOrder: CommandBarSectionOrder;
  rootSelectedIdx: number;

}

function buildRouteListState(options: BuildRouteListStateOptions): ListScreenState | null {
  const {
    activeMatch,

    buildLayoutItems,
    currentRoute,
    orderedRootResults,
    rootHoveredIdx,
    rootModeKind,
    rootCategoryPriorities,
    rootQuery,
    rootSearching,
    rootSectionOrder,
    rootSelectedIdx,

  } = options;

  if (!currentRoute) {
    const emptyState = getEmptyState(
      rootModeKind,
      rootQuery,
      activeMatch?.command.id === "security-description" ? activeMatch.arg : undefined,
    );
    return {
      kind: "root",
      title: "Commands",
      query: rootQuery,
      selectedIdx: rootSelectedIdx,
      hoveredIdx: rootHoveredIdx,
      results: orderedRootResults,
      searching: rootSearching,
      emptyLabel: emptyState.label,
      emptyDetail: emptyState.detail,
      footerLeft: getScreenFooterLeft(null),
      footerRight: getScreenFooterRight(null),
      sectionOrder: rootSectionOrder,
      categoryPriorities: rootCategoryPriorities,
    };
  }

  if (currentRoute.kind === "mode") {
    switch (currentRoute.screen) {
      case "layout": {
        const results = buildLayoutItems(currentRoute.query);
        return {
          kind: "mode",
          title: "Layout Actions",
          subtitle: "Organize panes and saved layouts.",
          query: currentRoute.query,
          selectedIdx: currentRoute.selectedIdx,
          hoveredIdx: currentRoute.hoveredIdx,
          results: orderListResults(results),
          searching: false,
          emptyLabel: getEmptyState("layout", currentRoute.query).label,
          emptyDetail: getEmptyState("layout", currentRoute.query).detail,
          footerLeft: getScreenFooterLeft(currentRoute),
          footerRight: getScreenFooterRight(currentRoute),
        };
      }
      default:
        return null;
    }
  }

  if (currentRoute.kind === "picker") {
    const filteredOptions = currentRoute.query
      ? fuzzyFilter(currentRoute.options, currentRoute.query, (option) => `${option.label} ${t(option.label)} ${option.detail || ""} ${option.description || ""}`)
      : currentRoute.options;
    const filtered = filteredOptions.map((option) => ({
      id: option.id,
      label: option.label,
      detail: option.detail || "",
      category: tc("picker-heading", "Options"),
      kind: "action" as const,
      disabled: option.disabled,
      action: () => {},
    }));
    const selectedIdx = filtered.length === 0
      ? 0
      : Math.max(0, Math.min(currentRoute.selectedIdx, filtered.length - 1));
    return {
      kind: "picker",
      title: currentRoute.title,
      query: currentRoute.query,
      selectedIdx,
      hoveredIdx: currentRoute.hoveredIdx,
      results: orderListResults(filtered),
      searching: false,
      emptyLabel: "No matches",
      emptyDetail: "Adjust the filter to see more options.",
      footerLeft: getScreenFooterLeft(currentRoute),
      footerRight: getScreenFooterRight(currentRoute),
    };
  }

  return null;
}

export function useRouteListState(options: BuildRouteListStateOptions): ListScreenState | null {
  const {
    activeMatch,

    buildLayoutItems,
    currentRoute,
    orderedRootResults,
    rootCategoryPriorities,
    rootHoveredIdx,
    rootModeKind,
    rootQuery,
    rootSearching,
    rootSectionOrder,
    rootSelectedIdx,

  } = options;

  return useMemo(() => buildRouteListState(options), [
    activeMatch,

    buildLayoutItems,
    currentRoute,
    orderedRootResults,
    rootCategoryPriorities,
    rootHoveredIdx,
    rootModeKind,
    rootQuery,
    rootSearching,
    rootSectionOrder,
    rootSelectedIdx,

  ]);
}
