import { useCallback, type Dispatch } from "react";
import type { AppAction, AppState } from "../../../state/app/context";

import type {
  PaneTemplateCreateOptions,
  PaneTemplateDef,
} from "../../../types/plugin";

import { debugLog } from "../../../utils/debug-log";

import type { ResultItem } from "../list/model";
import {
  buildNonShortcutPaneTemplateItems,
  buildPaneShortcutItems,
  buildPaneTemplateContext,
  buildPaneTemplateItem,
  getAvailablePaneShortcutTemplatesForQuery,
  getAvailablePaneTemplatesForState,
  getPaneTemplateDisplayLabel,
  paneTemplateArgError,
  recentPaneTemplateArg,
} from "./items";
import type { FormModalRequest } from "../../form-modal";
import { type SharedWorkflowDeps } from "../workflow/ops";
import type { PluginRegistry } from "../../../plugins/registry";
import { PluginOffError, notifyPluginOff } from "../../../plugins/plugin-off";
import { shouldOpenPaneTemplateConfig } from "./workflow-route";

type CloseAllFn = (options?: { revertThemePreview?: boolean }) => void;
type NotifyFn = (body: string, options?: { type?: "info" | "success" | "error" }) => void;
type OpenModeRouteFn = (
  screen: "ticker-search" | "layout",
  initialQuery?: string,
  payload?: Record<string, unknown>,
) => void;

interface UseCommandBarPaneTemplateActionsOptions {
  activeCollectionId: string | null;
  activeTickerSymbol: string | null;
  buildWorkflowDeps: () => SharedWorkflowDeps;
  closeAll: CloseAllFn;
  config: AppState["config"];
  dispatch: Dispatch<AppAction>;

  focusedPaneId: string | null;
  notify: NotifyFn;
  openForm: (request: FormModalRequest) => void;
  openModeRoute: OpenModeRouteFn;
  pluginRegistry: PluginRegistry;
}

const commandBarLog = debugLog.createLogger("command-bar");

export function useCommandBarPaneTemplateActions({
  activeCollectionId,
  activeTickerSymbol,
  buildWorkflowDeps,
  closeAll,
  config,
  dispatch,

  focusedPaneId,
  notify,
  openForm,
  openModeRoute,
  pluginRegistry,
}: UseCommandBarPaneTemplateActionsOptions) {
  const getPaneTemplateContext = useCallback(() => buildPaneTemplateContext({
    activeCollectionId,
    activeTicker: activeTickerSymbol,
    config,
    focusedPaneId,
  }), [activeCollectionId, activeTickerSymbol, config, focusedPaneId]);

  const recordPaneTemplate = useCallback((template: PaneTemplateDef, arg?: string) => {
    const tickerArg = recentPaneTemplateArg(template, arg);
    dispatch({
      type: "RECORD_COMMAND",
      id: `pane-template:${template.id}`,
      label: getPaneTemplateDisplayLabel(template),
      ...(tickerArg ? { arg: tickerArg } : {}),
    });
  }, [dispatch]);

  const openPaneTemplateWorkflow = useCallback((template: PaneTemplateDef, options?: { arg?: string }) => {
    recordPaneTemplate(template, options?.arg);
    openForm({ kind: "pane-template", templateId: template.id, arg: options?.arg });
  }, [openForm, recordPaneTemplate]);

  const openPaneTemplateDirect = useCallback(async (
    template: PaneTemplateDef,
    createOptions?: PaneTemplateCreateOptions,
  ) => {
    recordPaneTemplate(template, createOptions?.arg);
    try {
      await pluginRegistry.createPaneFromTemplateAsync(template.id, createOptions);
      closeAll({ revertThemePreview: false });
    } catch (error) {
      if (error instanceof PluginOffError) {
        notifyPluginOff(pluginRegistry, error, () => { void openPaneTemplateDirect(template, createOptions); });
        return;
      }
      const displayLabel = getPaneTemplateDisplayLabel(template);
      notify(
        error instanceof Error ? error.message : `Could not create ${displayLabel.toLowerCase()}.`,
        { type: "error" },
      );
    }
  }, [closeAll, notify, pluginRegistry, recordPaneTemplate]);

  const runPaneTemplateShortcut = useCallback(async (
    template: PaneTemplateDef,
    rawArg?: string,
  ) => {
    const trimmedArg = rawArg?.trim() || "";
    if (shouldOpenPaneTemplateConfig(template, trimmedArg)) {
      openPaneTemplateWorkflow(template, { arg: trimmedArg });
      return;
    }
    await openPaneTemplateDirect(template, trimmedArg ? { arg: trimmedArg } : undefined);
  }, [
    activeCollectionId,
    activeTickerSymbol,
    buildWorkflowDeps,
    getPaneTemplateContext,
    openModeRoute,
    openPaneTemplateDirect,
    openPaneTemplateWorkflow,
  ]);

  const getAvailablePaneTemplates = useCallback((
    options?: PaneTemplateCreateOptions,
    availability?: { includePromptableTickerTemplates?: boolean },
  ): PaneTemplateDef[] => {
    return getAvailablePaneTemplatesForState({
      context: getPaneTemplateContext(),
      createOptions: options,
      disabledPlugins: config.disabledPlugins || [],
      includePromptableTickerTemplates: availability?.includePromptableTickerTemplates,
      logError: (message, details) => commandBarLog.error(message, details),
      pluginRegistry,
    });
  }, [config.disabledPlugins, getPaneTemplateContext, pluginRegistry]);

  const getAvailablePaneShortcutTemplates = useCallback((query: string): PaneTemplateDef[] => {
    return getAvailablePaneShortcutTemplatesForQuery({
      context: getPaneTemplateContext(),
      disabledPlugins: config.disabledPlugins || [],
      logError: (message, details) => commandBarLog.error(message, details),
      pluginRegistry,
      query,
    });
  }, [config.disabledPlugins, getPaneTemplateContext, pluginRegistry]);

  const createPaneTemplateItem = useCallback((
    template: PaneTemplateDef,
    options?: {
      category?: string;
      createOptions?: PaneTemplateCreateOptions;
      showShortcut?: boolean;
      shortcutExecution?: boolean;
    },
  ): ResultItem => buildPaneTemplateItem({
    argError: paneTemplateArgError(template, options?.createOptions?.arg, getPaneTemplateContext()),
    category: options?.category,
    createOptions: options?.createOptions,
    openPaneTemplateDirect,
    openPaneTemplateWorkflow,
    pluginRegistry,
    runPaneTemplateShortcut,
    shortcutExecution: options?.shortcutExecution,
    shouldOpenTemplateConfig: shouldOpenPaneTemplateConfig,
    showShortcut: options?.showShortcut,
    template,
  }), [
    getPaneTemplateContext,
    openPaneTemplateDirect,
    openPaneTemplateWorkflow,
    pluginRegistry,
    runPaneTemplateShortcut,
  ]);

  const paneShortcutItems = useCallback((options?: {
    filterQuery?: string;
    createOptions?: PaneTemplateCreateOptions;
    includePromptableTickerTemplates?: boolean;
  }): ResultItem[] => buildPaneShortcutItems({
    createItem: createPaneTemplateItem,
    createOptions: options?.createOptions,
    filterQuery: options?.filterQuery,
    templates: getAvailablePaneTemplates(options?.createOptions, {
      includePromptableTickerTemplates: options?.includePromptableTickerTemplates,
    }),
  }), [createPaneTemplateItem, getAvailablePaneTemplates]);

  const nonShortcutPaneTemplateItems = useCallback((filterQuery?: string): ResultItem[] => {
    return buildNonShortcutPaneTemplateItems({
      createItem: createPaneTemplateItem,
      filterQuery,
      templates: getAvailablePaneTemplates(),
    });
  }, [createPaneTemplateItem, getAvailablePaneTemplates]);

  return {

    createPaneTemplateItem,
    getAvailablePaneShortcutTemplates,
    getAvailablePaneTemplates,
    nonShortcutPaneTemplateItems,
    openPaneTemplateWorkflow,
    paneShortcutItems,
  };
}
