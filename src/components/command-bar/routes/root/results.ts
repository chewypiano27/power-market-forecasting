import { t } from "../../../../i18n";
import { languagePickerItems } from "../../language-picker";
import type { AppState } from "../../../../state/app/context";
import type {
  CommandDef,
  PaneTemplateCreateOptions,
  PaneTemplateDef,
} from "../../../../types/plugin";
import type { TickerRecord } from "../../../../types/ticker";
import { fuzzyFilter } from "../../../../utils/fuzzy-search";
import { matchPrefix, type Command } from "../../commands/registry";

import { recentPaneTemplateArg } from "../../pane-templates/items";
import { dedupeById } from "../../view-model";
import type { ResultItem } from "../../list/model";
import type { parseRootShortcutIntent } from "./shortcuts";
import type { CommandBarRoute } from "../../workflow/types";
import { createRootCommandItemBuilder } from "./command-items";
import { buildRootShortcutItem } from "./shortcut-items";
import { buildStartHereItems } from "./start-here";
import { showsCommandBarIntro } from "../../../../app/command-bar-intro";

type RootShortcutIntent = ReturnType<typeof parseRootShortcutIntent>;

interface PaneTemplateItemOptions {
  category?: string;
  createOptions?: PaneTemplateCreateOptions;
  showShortcut?: boolean;
  shortcutExecution?: boolean;
}

interface PaneShortcutItemsOptions {
  filterQuery?: string;
  createOptions?: PaneTemplateCreateOptions;
  includePromptableTickerTemplates?: boolean;
}

export interface RootResultModel {
  items: ResultItem[];
  initialIdx: number;
}

export interface RootResultModelOptions {
  activeCollectionId: string | null;
  activeTickerData: TickerRecord | null | undefined;
  activeTickerSymbol: string | null;
  /** Natural-language fallback rows; omit to build the list without an AI section. */
  availableCommands: Command[];
  /** Builds one select/pin ticker row for a recent symbol. */

  /** Offers to bind a key to the typed text once it resolves to a command; omit to hide the row. */
  bindKey?: (query: string) => void;
  buildLayoutItems: (query: string, options?: { confirmDangerousActions?: boolean }) => ResultItem[];
  buildPaneSettingItems: (paneId: string | null, query: string) => ResultItem[];
  buildWindowModeItems: (arg: string) => ResultItem[];
  createPaneTemplateItem: (template: PaneTemplateDef, options?: PaneTemplateItemOptions) => ResultItem;
  createPluginCommandItem: (command: CommandDef, options?: { shortcutArg?: string }) => ResultItem;
  currentRoute: CommandBarRoute | null;

  getAvailablePaneShortcutTemplates: (query: string) => PaneTemplateDef[];
  /** The function code the query starts with, claimed by the parser or not (`leadingShortcutCode`). */
  leadingShortcutCode?: string | null;
  /** Looks a recorded `pane-template:<id>` entry back up among the templates the bar offers now. */
  getRecentPaneTemplate?: (id: string, arg?: string) => PaneTemplateDef | undefined;
  hasPaneSettings: (paneId: string) => boolean;

  nonShortcutPaneTemplateItems: (filterQuery?: string) => ResultItem[];
  openModeRoute: (screen: "ticker-search" | "layout", initialQuery?: string) => void;
  paneShortcutItems: (options?: PaneShortcutItemsOptions) => ResultItem[];
  pluginCommandItems: () => ResultItem[];
  pluginCommandResultItems: (command: CommandDef, shortcutArg: string) => ResultItem[];
  /**
   * The install row for a code only an official plugin the user lacks answers
   * to. It leads the list but claims nothing: the same text may be a ticker.
   */
  pluginInstallItem?: ResultItem | null;
  rootQuery: string;
  rootShortcutIntent: RootShortcutIntent;
  /**
   * Rows from plugin search providers, already ordered by provider priority.
   * Appended after the local matches so a late answer never moves the row the
   * user is aiming at, and only ever adds to what the bar already resolved.
   */
  providerResultItems?: ResultItem[];
  /**
   * Rows from providers that answer from memory, built with the keystroke. The
   * empty bar shows them under Suggested; typed text ranks them as one block
   * among the local matches, at the place of their best row.
   */
  providerMatchItems?: ResultItem[];
  runDirectCommand: (command: Command, arg: string) => void;

  state: AppState;

}

/**
 * The text a key would replay. An inferred ticker is left out on purpose: the
 * key should follow the focused ticker at press time, not freeze today's.
 */
function buildBindKeyItem(
  intent: Exclude<RootShortcutIntent, { kind: "none" }>,
  bindKey: (query: string) => void,
): ResultItem {
  const query = intent.kind !== "inferred-complete" && intent.argText
    ? `${intent.prefix} ${intent.argText}`
    : intent.prefix;
  return {
    id: `bind-key:${query}`,
    label: `Bind a key to ${query}`,
    detail: intent.kind === "inferred-complete"
      ? `${intent.label} for the focused ticker, on a key of your choice`
      : `${intent.label}, on a key of your choice`,
    category: "Keybindings",
    kind: "action",
    defaultSelectable: false,
    action: () => bindKey(query),
  };
}

/**
 * Ranks a provider's in-memory rows with the local matches without reordering
 * them: the provider decided which rows answer and in what order, so the block
 * moves as one to where its best row would rank. A block none of whose rows
 * the bar's own matching finds still shows, after the local matches.
 */
function rootItemSearchText(item: ResultItem): string {
  return `${item.label} ${t(item.label)} ${item.searchText || ""} ${item.detail} ${t(item.detail)} ${item.right || ""}`;
}

/** Kept short: the empty bar is still a browse list of everything below. */
const MAX_RECENT_PANE_ROWS = 4;

function buildRecentResultItems(options: {

  createPaneTemplateItem: (template: PaneTemplateDef, options?: PaneTemplateItemOptions) => ResultItem;
  getRecentPaneTemplate?: (id: string, arg?: string) => PaneTemplateDef | undefined;
  recentCommands: AppState["config"]["recentCommands"];
}): ResultItem[] {
  const {
    createPaneTemplateItem,
    getRecentPaneTemplate = () => undefined,
    recentCommands,
  } = options;
  const items: ResultItem[] = [];
  let paneRows = 0;
  for (const recent of recentCommands) {
    if (paneRows >= MAX_RECENT_PANE_ROWS) break;
    if (!recent.id.startsWith("pane-template:")) continue;
    // Only a template the bar would offer now: its plugin enabled, and able
    // to open for that argument.
    const template = getRecentPaneTemplate(recent.id.slice("pane-template:".length), recent.arg);
    if (!template) continue;
    const arg = recentPaneTemplateArg(template, recent.arg);
    const item = createPaneTemplateItem(template, {
      showShortcut: true,
      ...(arg ? { createOptions: { arg } } : {}),
    });
    items.push({
      ...item,
      id: arg ? `recent:${recent.id}:${arg}` : `recent:${recent.id}`,
      label: arg ? `${item.label} ${arg}` : item.label,
      category: "Suggested",
    });
    paneRows += 1;
  }
  return items;
}

export function buildRootResultModel(options: RootResultModelOptions): RootResultModel {
  const {
    activeCollectionId,
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

    nonShortcutPaneTemplateItems,
    paneShortcutItems,
    pluginCommandItems,
    pluginCommandResultItems,
    pluginInstallItem,
    rootQuery,
    rootShortcutIntent,
    runDirectCommand,

    state,
  } = options;

  if (currentRoute) {
    return { items: [], initialIdx: 0 };
  }

  const commandToItem = createRootCommandItemBuilder({
    hasPaneSettings,
    runDirectCommand,
    state,
  });

  const items: ResultItem[] = [];
  const match = matchPrefix(rootQuery, availableCommands);
  let initialIdx = 0;
  // Off when the code's own rows only say why the argument opens nothing (`PF Nope`).
  let shortcutRuns = true;
  const shortcutItem = buildRootShortcutItem({
    activeCollectionId,
    activeTickerSymbol,
    createPaneTemplateItem,
    createPluginCommandItem,

    rootShortcutIntent,

    state,
  });

  if (rootShortcutIntent.kind !== "none" && rootShortcutIntent.source === "pane-template" && shortcutItem) {
    const matchingTemplates = getAvailablePaneShortcutTemplates(rootQuery);
    const templateItems = matchingTemplates.length > 0
      ? matchingTemplates.map((template) => createPaneTemplateItem(template, {
        category: "Panes",
        createOptions: rootShortcutIntent.argText ? { arg: rootShortcutIntent.argText } : undefined,
        showShortcut: true,
        shortcutExecution: true,
      }))
      : [shortcutItem];
    shortcutRuns = templateItems.some((item) => !item.disabled);
    const relatedTemplateItems = rootQuery.trim().toUpperCase() === rootShortcutIntent.prefix
      ? paneShortcutItems({
        filterQuery: rootQuery,
        includePromptableTickerTemplates: true,
      })
      : [];
    items.push(...templateItems, ...relatedTemplateItems);
  } else if (
    rootShortcutIntent.kind !== "none"
    && rootShortcutIntent.source === "plugin-command"
    && shortcutItem
  ) {
    const dynamicItems = pluginCommandResultItems(rootShortcutIntent.command, rootShortcutIntent.argText);
    items.push(...(dynamicItems.length > 0 ? dynamicItems : [shortcutItem]));
  } else if (match && match.command.id === "layout") {
    items.push(...buildLayoutItems(match.arg, { confirmDangerousActions: true }));
  } else if (match && match.command.id === "window-mode") {
    items.push(...buildWindowModeItems(match.arg));
  } else if (match && match.command.id === "theme") {
    initialIdx = 0;
  } else if (match && match.command.id === "language") {
    const picker = languagePickerItems(match.arg, state.config.language, (code) => runDirectCommand(match.command, code));
    items.push(...picker.items);
    initialIdx = picker.initialIdx;
    shortcutRuns = picker.items.length > 0;
  } else if (match && !match.command.hasArg) {
    const item = commandToItem(match.command);
    if (item) items.push(item);
  } else if (!rootQuery) {
    if (rootShortcutIntent.kind === "none") {
      items.push(...buildRecentResultItems({

        createPaneTemplateItem,
        getRecentPaneTemplate,
        recentCommands: state.config.recentCommands ?? [],
      }));
    }
    // Plain-word rows for the common first tasks, ahead of the codes, for the
    // first opens only. Each runs what its code's own row below runs.
    if (showsCommandBarIntro(state.config)) {
      items.push(...buildStartHereItems({
        templatesForCode: getAvailablePaneShortcutTemplates,
        createTemplateItem: (template) => createPaneTemplateItem(template, { showShortcut: true }),
        lookUpCompany: null,
      }));
    }
    items.push(...paneShortcutItems());
    for (const command of availableCommands) {
      const item = commandToItem(command);
      if (item) items.push(item);
    }
    items.push(...pluginCommandItems());
  } else {
    const commandItems = availableCommands
      .map((command) => commandToItem(command))
      .filter((item): item is ResultItem => item !== null);
    const allItems = [
      ...commandItems,
      ...buildLayoutItems("", { confirmDangerousActions: true }),
      ...buildPaneSettingItems(state.focusedPaneId, rootQuery),
      ...paneShortcutItems(),
      ...nonShortcutPaneTemplateItems(),
      ...pluginCommandItems(),
    ];
    items.push(...fuzzyFilter(allItems, rootQuery, rootItemSearchText, (item) => item.label));
  }

  const shortcutClaimedQuery = rootShortcutIntent.kind !== "none";
  // Text the parser can run is text a key can run, so the offer sits under the
  // match it would replay. Never the default selection: Enter still runs the
  // command itself.
  if (bindKey && shortcutClaimedQuery && shortcutRuns && rootShortcutIntent.kind !== "ambiguous") {
    items.push(buildBindKeyItem(rootShortcutIntent, bindKey));
  }
  const installItems = pluginInstallItem ? [pluginInstallItem] : [];
  return {
    items: dedupeById([...installItems, ...items]).filter((item) => item.kind !== "ticker" && item.kind !== "search"),
    initialIdx,
  };
}
