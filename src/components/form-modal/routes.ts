import type { PluginRegistry } from "../../plugins/registry";
import { type AppState } from "../../state/app/context";

import type { CommandDef, PaneTemplateCreateOptions } from "../../types/plugin";

import { buildPaneTemplateWorkflowRoute } from "../command-bar/pane-templates/workflow-route";
import { buildBuiltInWorkflowRoute } from "../command-bar/workflow/builtin";
import { getFirstVisibleFieldId, normalizeWizardFields } from "../command-bar/workflow/fields";
import type { FormRoute } from "./model";

/** What to fill in, once the host resolved what the caller asked for. */
export type FormRouteResult =
  | { kind: "route"; route: FormRoute }
  | { kind: "notice"; message: string }
  | { kind: "none" };

export function buildBuiltInFormRoute(
  actionId: string,
  state: AppState,
): FormRouteResult {
  return buildBuiltInWorkflowRoute({ actionId, config: state.config });
}

/**
 * A plugin command's wizard as one form. Without values from a typed
 * argument, the command's own argument parser fills what it can from the
 * focused ticker, as a launch from a pane always has.
 */
export function buildPluginCommandFormRoute(
  command: CommandDef,
  values?: Record<string, string>,
): FormRouteResult {
  if (!command.wizard || command.wizard.length === 0) return { kind: "none" };
  let defaults: Record<string, string> | undefined = values;
  if (!defaults) {
    try {
      defaults = command.shortcutArg?.parse?.("", { activeTicker: null });
    } catch {
      defaults = undefined;
    }
  }
  const normalized = normalizeWizardFields(command.wizard);
  const initialValues = { ...normalized.initialValues, ...(defaults ?? {}) };
  return {
    kind: "route",
    route: {
      kind: "workflow",
      workflowId: `plugin-command:${command.id}`,
      title: command.label,
      subtitle: command.description,
      description: normalized.description,
      fields: normalized.fields,
      values: initialValues,
      activeFieldId: getFirstVisibleFieldId(normalized.fields, initialValues),
      submitLabel: command.label,
      pendingLabel: normalized.pendingLabel,
      successLabel: normalized.successLabel,
      pending: false,
      error: null,
      successBehavior: "close",
      payload: { kind: "plugin-command", actionId: command.id },
    },
  };
}

export function buildPaneTemplateFormRoute(
  pluginRegistry: PluginRegistry,
  templateId: string,
  arg: string | undefined,
  createOptions?: PaneTemplateCreateOptions,
): FormRouteResult {
  const template = pluginRegistry.paneTemplates.get(templateId);
  if (!template) return { kind: "none" };
  const route = buildPaneTemplateWorkflowRoute({
    activeTicker: null,
    arg,
    template,
  });
  return {
    kind: "route",
    route: createOptions ? { ...route, payloadMeta: { ...route.payloadMeta, createOptions } } : route,
  };
}
