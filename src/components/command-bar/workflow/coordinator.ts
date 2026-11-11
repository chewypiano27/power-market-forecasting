import { useCallback, type Dispatch } from "react";

import type { PluginRegistry } from "../../../plugins/registry";
import { useAppGetState, type AppAction } from "../../../state/app/context";

import { openFormModal, type FormModalRequest } from "../../form-modal";

import type { CommandBarNotifyFn } from "./types";

interface UseCommandBarWorkflowCoordinatorOptions {
  closeAll: (options?: { revertThemePreview?: boolean }) => void;

  dispatch: Dispatch<AppAction>;
  notify: CommandBarNotifyFn;
  pluginRegistry: PluginRegistry;

}

/**
 * The bar finds a form and hands it to the form modal, closing itself; the
 * modal builds and submits it. The collection actions stay here for the
 * pickers and confirms the bar still starts, and read the app's store when
 * they run: a confirm outlives the bar that opened it.
 */
export function useCommandBarWorkflowCoordinator({
  closeAll,

  dispatch,
  notify,
  pluginRegistry,

}: UseCommandBarWorkflowCoordinatorOptions) {
  const getState = useAppGetState();
  const openForm = useCallback((request: FormModalRequest) => {
    if (openFormModal(request)) closeAll({ revertThemePreview: false });
  }, [closeAll]);

  const openBuiltInWorkflow = useCallback((actionId: string) => {
    openForm({ kind: "builtin", actionId });
  }, [openForm]);

  const buildSharedWorkflowDeps = useCallback(() => ({

    pluginRegistry,
    dispatch,
    getState,
  }), [ dispatch, getState, pluginRegistry]);

  return {
    buildSharedWorkflowDeps,

    openBuiltInWorkflow,
    openForm,
  };
}
