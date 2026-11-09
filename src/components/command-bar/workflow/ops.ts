import { type LayoutConfig, type PaneBinding, type PaneInstanceConfig } from "../../../types/config";
import type { PaneSettingField, PaneTemplateContext, PaneTemplateCreateOptions, PaneTemplateInstanceConfig, PaneTemplateDef } from "../../../types/plugin";

import type { PluginRegistry } from "../../../plugins/registry";
import { PluginOffError } from "../../../plugins/plugin-off";
import { PANE_LOCK_SETTING_KEY, setPaneLocked, updatePaneInstance, setPaneSettings } from "../../../pane-settings";
import { getPaneTemplateDisplayLabel, paneTemplateArgError } from "../pane-templates/items";

import { keysClearedByChange } from "./fields";
import { findReusablePaneInstance, retargetPaneInstance, withFreeTickerInstanceId } from "./pane-reuse";
import type { AppAction, AppState } from "../../../state/app/context";
import type { Dispatch } from "react";
export interface SharedWorkflowDeps { pluginRegistry: PluginRegistry; dispatch: Dispatch<AppAction>; getState: () => AppState }

interface CreatePaneTemplateDeps extends SharedWorkflowDeps {
  buildPaneInstance: (
    paneType: string,
    options?: {
      title?: string;
      binding?: PaneBinding;
      params?: Record<string, string>;
      settings?: Record<string, unknown>;
      instanceId?: string;
    },
  ) => PaneInstanceConfig | null;
  placePaneInstance: (
    instance: PaneInstanceConfig,
    paneDef: NonNullable<ReturnType<PluginRegistry["panes"]["get"]>>,
    options?: PaneTemplateInstanceConfig,
  ) => void;
}

interface ApplyPaneSettingDeps extends SharedWorkflowDeps {
  persistLayout: (layout: LayoutConfig, options?: { pushHistory?: boolean }) => void;
}

async function resolvePaneTemplateOptions(_template: PaneTemplateDef, options: PaneTemplateCreateOptions | undefined, deps: SharedWorkflowDeps) {
  const state = deps.getState();
  const context: PaneTemplateContext = { config: state.config, layout: state.config.layout, focusedPaneId: state.focusedPaneId, activeTicker: null, activeCollectionId: null };
  return { context, resolvedOptions: options };
}

export async function createPaneTemplateOrThrow(
  templateId: string,
  options: PaneTemplateCreateOptions | undefined,
  deps: CreatePaneTemplateDeps,
): Promise<void> {
  const template = deps.pluginRegistry.paneTemplates.get(templateId);
  if (!template) {
    throw new Error(`Unknown pane template "${templateId}".`);
  }
  // Read before the first await: automation that started this open may have
  // finished by the time the pane is placed.

  const state = deps.getState();
  // The template's plugin, or the plugin of the pane it opens (CHOKE opens a
  // chart): a pane of a switched-off plugin would be added hidden.
  const disabledOwner = deps.pluginRegistry.getDisabledPaneTemplateOwner(templateId, state.config.disabledPlugins);
  if (disabledOwner) throw new PluginOffError(disabledOwner, getPaneTemplateDisplayLabel(template));

  const { context, resolvedOptions } = await resolvePaneTemplateOptions(template, options, deps);

  // A name the function knows nothing of opens nothing, rather than its default view.
  const argError = paneTemplateArgError(template, resolvedOptions?.arg, context);
  if (argError) {
    throw new Error(argError.detail ? `${argError.message}. ${argError.detail}.` : `${argError.message}.`);
  }

  if (template.canCreate && !template.canCreate(context, resolvedOptions)) {
    throw new Error(`Can't create ${getPaneTemplateDisplayLabel(template).toLowerCase()} right now.`);
  }

  const createInstanceResult = await template.createInstance?.(context, resolvedOptions);
  if (createInstanceResult === null) {
    return;
  }
  let spec = createInstanceResult ?? {};
  const paneDef = deps.pluginRegistry.panes.get(template.paneId);
  if (!paneDef) {
    throw new Error(`Unknown pane "${template.paneId}".`);
  }

  const instances = deps.getState().config.layout.instances;
  spec = withFreeTickerInstanceId(instances, template.paneId, spec);
  const existing = findReusablePaneInstance(
    instances,
    template,
    deps.pluginRegistry.paneTemplates,
    spec,
    { focusedPaneId: deps.getState().focusedPaneId, paneDef: deps.pluginRegistry.panes.get(template.paneId) },
  );
  if (existing) {
    const retargeted = retargetPaneInstance(existing, spec);
    const nextLayout = retargeted ? updatePaneInstance(
        deps.getState().config.layout,
        existing.instanceId,
        () => retargeted,
      ) : undefined;
    if (nextLayout) deps.pluginRegistry.updateLayout(nextLayout);
    // React can batch the layout update and focus. Bringing a floating pane to
    // the front must use its retargeted settings, not the preceding render.
    deps.pluginRegistry.focusPane(existing.instanceId, nextLayout);

    return;
  }

  const instance = deps.buildPaneInstance(template.paneId, {
    // A stable id another pane type already holds would collide, so the new pane picks its own.
    instanceId: instances.some((entry) => entry.instanceId === spec.instanceId) ? undefined : spec.instanceId,
    title: spec.title,
    binding: spec.binding,
    params: spec.params,
    settings: spec.settings,
  });
  if (!instance) {
    throw new Error("Open a matching ticker or collection context first.");
  }

  deps.placePaneInstance(instance, paneDef, spec);

}

/** Every pane template the user opens, from the command bar, a menu or another pane, passes here. */

export async function applyPaneSettingFieldValue(
  targetId: string,
  field: PaneSettingField,
  value: unknown,
  deps: ApplyPaneSettingDeps,
  options?: { pushHistory?: boolean },
): Promise<void> {
  if (field.type === "action") {
    throw new Error("Pane setting actions cannot be applied as values.");
  }
  const descriptor = deps.pluginRegistry.resolvePaneSettings(targetId);
  if (!descriptor) {
    throw new Error("This pane does not expose settings.");
  }

  const state = deps.getState();
  const shouldPushHistory = options?.pushHistory !== false;

  // The lock lives on the pane instance, not in pane settings, so it never
  // reaches a plugin's `applyValue`.
  if (field.key === PANE_LOCK_SETTING_KEY) {
    deps.persistLayout(
      setPaneLocked(state.config.layout, targetId, value === true),
      { pushHistory: shouldPushHistory },
    );
    return;
  }

  const clearOnChange = Object.fromEntries(
    keysClearedByChange(field.clearOnChange, descriptor.context.settings[field.key], value).map((key) => [key, ""]),
  );

  if (field.storage === "plugin") {
    if (!descriptor.pluginId) {
      throw new Error("This pane setting is not owned by a plugin.");
    }
    await deps.pluginRegistry.setConfigStates(descriptor.pluginId, {
      ...clearOnChange,
      [field.key]: value,
    });
    return;
  }

  const currentSettings = {
    ...(descriptor.rawSettings ?? descriptor.context.settings),
    ...clearOnChange,
  };
  let nextSettings: Record<string, unknown> = descriptor.settingsDef.applyValue
    ? await descriptor.settingsDef.applyValue(
      currentSettings,
      field,
      value,
      descriptor.context,
    )
    : { ...currentSettings, [field.key]: value };

  let nextLayout = setPaneSettings(state.config.layout, targetId, nextSettings);

  deps.persistLayout(nextLayout, { pushHistory: shouldPushHistory });
}
