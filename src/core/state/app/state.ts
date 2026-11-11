import type { AppConfig } from "../../../types/config";
import { updateKeybindingsConfig } from "../../../app/keybindings/config";
import { recordCommandBarOpen } from "../../../app/command-bar-intro";

import { bringFloatingToFront, clonePaneStateMap, focusPaneState, restoreSavedPaneState, getEffectiveThemeId, getFocusedTickerSymbol, getPaneOrder, getPanelFocusTarget, getTopFloatingPaneId, hydrateDesktopSnapshot, nextRecentCommands, nextRecentTickers, reconcilePaneState, resolveTickerForPane, syncConfigActiveLayoutState, withFocusedPane } from "./layout";
import { reduceLayoutAction } from "./layout-reducer";
import type { AppAction, AppState, CollectionSortPreference, PaneRuntimeState } from "./types";
import type { AppSessionSnapshot } from "../session-persistence";

export {
  clonePaneStateMap,
  getEffectiveThemeId,
  getFocusedTickerSymbol,
  resolveTickerForPane,
  syncConfigActiveLayoutState,
};
export type { AppAction, AppState, CollectionSortPreference, PaneRuntimeState };

/** One more open of the empty command bar; past the introduction the count stays put. */
function countEmptyCommandBarOpen(state: AppState): AppState {
  const commandBarOpens = recordCommandBarOpen(state.config.commandBarOpens);
  return commandBarOpens === state.config.commandBarOpens
    ? state
    : { ...state, config: { ...state.config, commandBarOpens } };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  const layoutState = reduceLayoutAction(state, action);
  if (layoutState) return layoutState;

  switch (action.type) {
    case "SET_CONFIG": {
      // A config that leaves the layouts alone (a broker sync, a setting) keeps
      // the layout undo history; one that replaces them starts it over.
      const sameLayouts = action.config.layout === state.config.layout
        && action.config.layouts === state.config.layouts
        && action.config.activeLayoutIndex === state.config.activeLayoutIndex;
      return withFocusedPane(
        { ...state, themePreview: null, layoutHistory: sameLayouts ? state.layoutHistory : {} },
        action.config,
        {
          paneState: {
            ...state.paneState,
            ...(restoreSavedPaneState(action.config, state.paneState) ?? {}),
          },
        },
      );
    }

    case "SET_ONBOARDING_STATE":
      return {
        ...state,
        config: {
          ...state.config,
          onboardingComplete: action.complete,
          onboardingProgress: action.progress,
        },
      };

    case "SET_KEYBINDINGS":
      return { ...state, config: updateKeybindingsConfig(state.config, action.keybindings) };

    case "SET_STAR_PROMPT":
      return { ...state, config: { ...state.config, starPrompt: action.starPrompt } };

    case "RECORD_COMMAND": {
      // Kept in config, not beside it like the recent tickers: a pane run is
      // followed by a layout save, which writes the config as it stands and
      // would drop a list held anywhere else.
      const arg = action.arg?.trim();
      const current = state.config.recentCommands ?? [];
      const recentCommands = nextRecentCommands(current, {
        id: action.id,
        label: action.label,
        ...(arg ? { arg } : {}),
      });
      return recentCommands === current ? state : { ...state, config: { ...state.config, recentCommands } };
    }

    case "SET_ACTIVE_PANEL": {
      if (action.preserveFocus) return state;
      const paneId = getPanelFocusTarget(state.config.layout, action.panel);
      return paneId ? focusPaneState(state, paneId) : state;
    }

    case "TOGGLE_COMMAND_BAR":
      return state.commandBarOpen
        ? { ...state, commandBarOpen: false, commandBarQuery: "", commandBarLaunchRequest: null, themePreview: null }
        : { ...countEmptyCommandBarOpen(state), commandBarOpen: true, commandBarQuery: "", commandBarLaunchRequest: null };

    case "SET_COMMAND_BAR": {
      const launchRequest = action.open && action.launch
        ? {
            ...action.launch,
            sequence: (state.commandBarLaunchRequest?.sequence ?? 0) + 1,
          }
        : null;
      // Only an open onto the empty bar counts: one that runs text or goes
      // straight to a search never shows the bar's own list.
      const opensEmpty = action.open && !state.commandBarOpen && !launchRequest && !action.query;
      return {
        ...(opensEmpty ? countEmptyCommandBarOpen(state) : state),
        commandBarOpen: action.open,
        commandBarQuery: action.open ? (action.query ?? "") : "",
        commandBarLaunchRequest: launchRequest,
        themePreview: action.open ? state.themePreview : null,
      };
    }

    case "SET_COMMAND_BAR_QUERY":
      return { ...state, commandBarQuery: action.query };

    case "SET_INITIALIZED":
      return { ...state, initialized: true };

    case "TOGGLE_STATUS_BAR":
      return { ...state, statusBarVisible: !state.statusBarVisible };

    case "SET_LANGUAGE":
      return { ...state, config: { ...state.config, language: action.language } };

    case "SET_THEME":
      if (state.config.theme === action.theme && state.themePreview == null) return state;
      return { ...state, themePreview: null, config: { ...state.config, theme: action.theme } };

    case "PREVIEW_THEME":
      if (state.themePreview === action.theme) return state;
      return { ...state, themePreview: action.theme };

    case "SET_DISABLED_PLUGINS": {
      const config = { ...state.config, disabledPlugins: action.disabledPlugins };
      return Object.prototype.hasOwnProperty.call(action, "focusedPaneId")
        ? withFocusedPane(state, config, { focusedPaneId: action.focusedPaneId ?? null })
        : { ...state, config };
    }

    case "SET_INPUT_CAPTURED":
      return { ...state, inputCaptured: action.captured };

    case "FOCUS_PANE": {
      return focusPaneState(state, action.paneId);
    }

    case "FOCUS_NEXT": {
      if (action.paneOrder.length === 0) return state;
      const currentIndex = state.focusedPaneId ? action.paneOrder.indexOf(state.focusedPaneId) : -1;
      const nextPaneId = action.paneOrder[(currentIndex + 1) % action.paneOrder.length]!;
      return focusPaneState(state, nextPaneId);
    }

    case "FOCUS_PREV": {
      if (action.paneOrder.length === 0) return state;
      const focusedIndex = state.focusedPaneId ? action.paneOrder.indexOf(state.focusedPaneId) : -1;
      const currentIndex = focusedIndex >= 0 ? focusedIndex : 0;
      const nextPaneId = action.paneOrder[(currentIndex - 1 + action.paneOrder.length) % action.paneOrder.length]!;
      return focusPaneState(state, nextPaneId);
    }

    case "HYDRATE_DESKTOP_SNAPSHOT":
      return hydrateDesktopSnapshot(state, action.snapshot);

    case "UPDATE_PANE_STATE": {
      const current = state.paneState[action.paneId] ?? {};
      if (Object.keys(action.patch).every((key) => Object.is(current[key], action.patch[key]))) {
        return state;
      }
      const nextState = { ...current, ...action.patch };
      const recentTickers = Object.prototype.hasOwnProperty.call(action.patch, "cursorSymbol")
        ? nextRecentTickers(state.recentTickers, typeof nextState.cursorSymbol === "string" ? nextState.cursorSymbol : null)
        : state.recentTickers;
      const paneState = {
        ...state.paneState,
        [action.paneId]: nextState,
      };
      return {
        ...state,
        config: syncConfigActiveLayoutState(state.config, paneState, state.focusedPaneId),
        paneState,
        recentTickers,
      };
    }

    case "REPLACE_PANE_STATE": {
      const current = state.paneState[action.paneId] ?? {};
      const nextState = action.state;
      if (Object.is(current, nextState)) return state;
      const paneState = {
        ...state.paneState,
        [action.paneId]: nextState,
      };
      const recentTickers = current.cursorSymbol !== nextState.cursorSymbol
        ? nextRecentTickers(state.recentTickers, typeof nextState.cursorSymbol === "string" ? nextState.cursorSymbol : null)
        : state.recentTickers;
      return {
        ...state,
        config: syncConfigActiveLayoutState(state.config, paneState, state.focusedPaneId),
        paneState,
        recentTickers,
      };
    }

    case "UPDATE_PLUGIN_PANE_STATE": {
      const current = state.paneState[action.paneId] ?? {};
      const currentPluginState = current.pluginState ?? {};
      const currentPluginValues = currentPluginState[action.pluginId] ?? {};
      if (Object.is(currentPluginValues[action.key], action.value)) {
        return state;
      }
      const paneState = {
        ...state.paneState,
        [action.paneId]: {
          ...current,
          pluginState: {
            ...currentPluginState,
            [action.pluginId]: {
              ...currentPluginValues,
              [action.key]: action.value,
            },
          },
        },
      };
      return {
        ...state,
        config: syncConfigActiveLayoutState(state.config, paneState, state.focusedPaneId),
        paneState,
      };
    }

    default:
      return state;
  }
}

export function createInitialState(config: AppConfig, sessionSnapshot: AppSessionSnapshot | null = null): AppState {
  const activeSavedLayout = config.layouts[config.activeLayoutIndex];
  const savedPaneState = activeSavedLayout?.paneState ? clonePaneStateMap(activeSavedLayout.paneState) : {};
  const sessionPaneState = sessionSnapshot?.paneState ? clonePaneStateMap(sessionSnapshot.paneState) : {};
  const paneState = reconcilePaneState(config, { ...sessionPaneState, ...savedPaneState });
  const defaultFocusedPaneId = getTopFloatingPaneId(config.layout) ?? getPaneOrder(config.layout)[0] ?? null;
  const requestedFocusedPaneId = activeSavedLayout?.focusedPaneId ?? sessionSnapshot?.focusedPaneId ?? null;
  const focusedPaneId = requestedFocusedPaneId
    && config.layout.instances.some((instance) => instance.instanceId === requestedFocusedPaneId)
    ? requestedFocusedPaneId
    : defaultFocusedPaneId;
  const focusedLayout = focusedPaneId ? bringFloatingToFront(config.layout, focusedPaneId) : config.layout;
  const focusedConfig = syncConfigActiveLayoutState(
    focusedLayout === config.layout ? config : { ...config, layout: focusedLayout },
    paneState,
    focusedPaneId,
  );
  return {
    config: focusedConfig,
    tickers: new Map(),
    focusedPaneId,
    previousFocusedPaneId: null,
    paneState,
    recentTickers: config.recentTickers,
    commandBarOpen: false,
    commandBarQuery: "",
    commandBarLaunchRequest: null,
    themePreview: null,
    initialized: false,
    statusBarVisible: sessionSnapshot?.statusBarVisible !== false,
    inputCaptured: false,
    layoutHistory: {},
  };
}
