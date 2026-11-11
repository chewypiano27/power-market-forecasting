import type { AppState } from "../../../../state/app/context";
import type {
  CommandDef,
  PaneTemplateCreateOptions,
  PaneTemplateDef,
} from "../../../../types/plugin";

import type { ResultItem } from "../../list/model";

import type { parseRootShortcutIntent } from "./shortcuts";

type RootShortcutIntent = ReturnType<typeof parseRootShortcutIntent>;

interface PaneTemplateItemOptions {
  category?: string;
  createOptions?: PaneTemplateCreateOptions;
  showShortcut?: boolean;
  shortcutExecution?: boolean;
}

interface RootShortcutItemOptions {
  activeCollectionId: string | null;
  activeTickerSymbol: string | null;
  createPaneTemplateItem: (
    template: PaneTemplateDef,
    options?: PaneTemplateItemOptions,
  ) => ResultItem;
  createPluginCommandItem: (
    command: CommandDef,
    options?: { shortcutArg?: string },
  ) => ResultItem;

  rootShortcutIntent: RootShortcutIntent;

  state: AppState;
}

export function buildRootShortcutItem({
  activeTickerSymbol,
  createPaneTemplateItem,
  createPluginCommandItem,

  rootShortcutIntent,

}: RootShortcutItemOptions): ResultItem | null {
  if (rootShortcutIntent.kind === "none") return null;

  if (rootShortcutIntent.source === "pane-template") {
    return createPaneTemplateItem(rootShortcutIntent.template, {
      category: "Panes",
      createOptions: rootShortcutIntent.argText
        ? { arg: rootShortcutIntent.argText }
        : undefined,
      showShortcut: true,
      shortcutExecution: true,
    });
  }

  if (rootShortcutIntent.source === "plugin-command") {
    return createPluginCommandItem(rootShortcutIntent.command, {
      shortcutArg: rootShortcutIntent.argText,
    });
  }

  return null;
}
