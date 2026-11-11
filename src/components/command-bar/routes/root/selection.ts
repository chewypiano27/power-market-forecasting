import type {
  CommandDef,
  PaneTemplateCreateOptions,
  PaneTemplateDef,
} from "../../../../types/plugin";

import { matchPrefix, type Command } from "../../commands/registry";

import type { ResultItem } from "../../list/model";
import { getPaneTemplateArgKind } from "../../pane-templates/items";
import { parseRootShortcutIntent } from "./shortcuts";

interface PaneTemplateItemOptions {
  category?: string;
  createOptions?: PaneTemplateCreateOptions;
  showShortcut?: boolean;
  shortcutExecution?: boolean;
}

interface RootSelectionCommandOptions {
  activeTickerSymbol: string | null;
  promptTickerSymbol?: string | null;
  availableCommands: Command[];
  createPaneTemplateItem: (template: PaneTemplateDef, options?: PaneTemplateItemOptions) => ResultItem;
  createPluginCommandItem: (command: CommandDef, options?: { shortcutArg?: string }) => ResultItem;

  getAvailablePaneShortcutTemplates: (query: string) => PaneTemplateDef[];
  getAvailablePluginCommands: () => CommandDef[];
  openModeRoute: (
    screen: "ticker-search" | "layout",
    initialQuery?: string,
    payload?: Record<string, unknown>,
  ) => void;
  openPaneTemplateWorkflow: (template: PaneTemplateDef, options?: { arg?: string }) => void;
  pluginCommandResultItems: (command: CommandDef, shortcutArg: string) => ResultItem[];
  runDirectCommand: (command: Command, arg: string) => void;

  setRootQuery: (query: string) => void;
  startThemePicker: (arg: string) => void;
}

export function acceptRootShortcutTabAction(options: RootSelectionCommandOptions & {
  query: string;
}): boolean {
  const intent = parseRootShortcutIntent({
    query: options.query,
    commands: options.availableCommands,
    pluginCommands: options.getAvailablePluginCommands(),
    paneTemplates: options.getAvailablePaneShortcutTemplates(options.query),
    activeTicker: options.activeTickerSymbol,
    promptTicker: options.promptTickerSymbol,
  });
  if (intent.kind === "none") return false;
  if (intent.kind === "inferred-complete" && intent.completionQuery) {
    options.setRootQuery(intent.completionQuery);
    return true;
  }
  if (intent.source === "pane-template") {
    const argKind = getPaneTemplateArgKind(intent.template);
    if (argKind === "ticker") {
      options.openModeRoute("ticker-search", intent.argText, {
        action: "pane-template",
        templateId: intent.template.id,
      });
      return true;
    }
    if (argKind === "ticker-list" || intent.kind === "partial" || intent.kind === "ambiguous") {
      options.openPaneTemplateWorkflow(intent.template, { arg: intent.argText || undefined });
      return true;
    }
    return false;
  }

  if (intent.source === "plugin-command") {
    return false;
  }

  return false;
}

export function buildImmediateRootSelection(options: RootSelectionCommandOptions & {
  query: string;
}): ResultItem | null {
  const intent = parseRootShortcutIntent({
    query: options.query,
    commands: options.availableCommands,
    pluginCommands: options.getAvailablePluginCommands(),
    paneTemplates: options.getAvailablePaneShortcutTemplates(options.query),
    activeTicker: options.activeTickerSymbol,
    promptTicker: options.promptTickerSymbol,
  });
  if (intent.kind !== "none" && intent.source === "pane-template") {
    return options.createPaneTemplateItem(intent.template, {
      category: "Panes",
      createOptions: intent.argText ? { arg: intent.argText } : undefined,
      showShortcut: true,
      shortcutExecution: true,
    });
  }

  if (intent.kind !== "none" && intent.source === "plugin-command") {
    const dynamicItems = options.pluginCommandResultItems(intent.command, intent.argText);
    if (dynamicItems.length > 0) return dynamicItems[0] ?? null;
    return options.createPluginCommandItem(intent.command, {
      shortcutArg: intent.argText,
    });
  }

  const match = matchPrefix(options.query, options.availableCommands);
  if (!match) {
    return null;
  }

  if (match.command.id === "theme") {
    return {
      id: "theme-picker",
      label: "Change Theme",
      detail: "Preview and apply themes",
      category: "Themes",
      kind: "command",
      action: () => {

        options.startThemePicker(match.arg);
      },
    };
  }

  if (match.command.id === "language") {
    return {
      id: `command:${match.command.id}`,
      label: match.command.label,
      detail: match.command.description,
      category: match.command.category,
      kind: "command",
      right: match.arg || match.command.prefix,
      shortcutQuery: match.command.prefix,
      action: () => options.runDirectCommand(match.command, match.arg),
    };
  }

  if (match.command.id === "layout") {
    return {
      id: "layout-route",
      label: "Layout Actions",
      detail: "Organize panes and saved layouts",
      category: "Layout",
      kind: "command",
      action: () => {

        options.openModeRoute("layout", match.arg);
      },
    };
  }

  if (!match.command.hasArg) {
    return {
      id: `command:${match.command.id}`,
      label: match.command.label,
      detail: match.command.description,
      category: match.command.category,
      kind: "command",
      right: match.command.prefix || undefined,
      shortcutQuery: match.command.prefix || undefined,
      action: () => options.runDirectCommand(match.command, ""),
    };
  }

  return null;
}
