import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
} from "react";
import type { PluginRegistry } from "../../../../plugins/registry";

import {
  useAppGetState,
  type AppAction,
  type AppState,
} from "../../../../state/app/context";

import { useRendererHost } from "../../../../ui";
import type { ThemePickerHandle } from "../../theme-picker";
import type { Command } from "../registry";

import {
  runDirectCommandAction,
} from "./index";
import type { OpenInlineConfirm } from "../../routing/confirm";
import { type SharedWorkflowDeps } from "../../workflow/ops";
import type { CommandBarRoute } from "../../workflow/types";

interface UseCommandBarDirectCommandRuntimeOptions {
  activeCollectionId: string | null;
  activeTickerSymbol: string | null;
  buildSharedWorkflowDeps: () => SharedWorkflowDeps;
  closeAll: (options?: { revertThemePreview?: boolean }) => void;
  dispatch: Dispatch<AppAction>;

  notify: (body: string, options?: { type?: "info" | "success" | "error" }) => void;
  openBuiltInWorkflow: (actionId: string) => void;
  openInlineConfirm: OpenInlineConfirm;
  openModeRoute: (
    screen: "ticker-search" | "layout",
    initialQuery?: string,
    payload?: Record<string, unknown>,
  ) => void;
  openPaneSettings: (paneId: string | null) => void;
  persistConfig: (nextConfig: AppState["config"]) => void;
  pluginRegistry: PluginRegistry;
  pushRoute: (route: CommandBarRoute) => void;
  quitApp: () => void;
  rootThemeBaseIdRef: MutableRefObject<string | null>;
  setRootQuery: (query: string) => void;
  themePickerRef: MutableRefObject<ThemePickerHandle | null>;
}

export function useCommandBarDirectCommandRuntime({
  activeCollectionId,
  activeTickerSymbol,
  buildSharedWorkflowDeps,
  closeAll,
  dispatch,

  notify,
  openBuiltInWorkflow,
  openInlineConfirm,
  openModeRoute,
  openPaneSettings,
  persistConfig,
  pluginRegistry,
  pushRoute,
  quitApp,
  rootThemeBaseIdRef,
  setRootQuery,
  themePickerRef,
}: UseCommandBarDirectCommandRuntimeOptions) {
  // A confirm it opens (Reset All Data) runs after the bar closed.
  const getState = useAppGetState();
  const rendererHost = useRendererHost();
  const runDirectCommand = useCallback((command: Command, arg: string) => {
    runDirectCommandAction({
      activeCollectionId,
      activeTickerSymbol,
      arg,
      cancelThemePreview: () => themePickerRef.current?.cancelPreview(),
      closeAll,
      command,
      controlWindow: (action) => {
        void rendererHost.controlWindow?.(action);
      },
      dispatch,

      getState,
      notify,
      openBuiltInWorkflow,
      openInlineConfirm,
      openModeRoute,
      openPaneSettings,
      persistConfig,
      pluginRegistry,
      pushRoute,
      quitApp,

      setRootQuery,
      setRootThemeBaseId: (themeId) => {
        rootThemeBaseIdRef.current = themeId;
      },
    });
  }, [
    activeCollectionId,
    activeTickerSymbol,
    closeAll,
    dispatch,

    getState,
    notify,
    openBuiltInWorkflow,
    openInlineConfirm,
    openModeRoute,
    openPaneSettings,
    persistConfig,
    pluginRegistry,
    pushRoute,
    quitApp,
    rendererHost,
    rootThemeBaseIdRef,

    setRootQuery,
    themePickerRef,
  ]);

  return {
    runDirectCommand,

  };
}
