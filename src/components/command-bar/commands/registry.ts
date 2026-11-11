import type { AppAction } from "../../../state/app/context";
import type { Dispatch } from "react";
import { getTheme, getThemeIds } from "../../../theme/themes";
import type { ShortcutArgOption } from "../../../types/plugin";

type CommandExecutor = (dispatch: Dispatch<AppAction>, context: CommandContext) => void | Promise<void>;

interface CommandContext {
  activeTicker: string | null;
  activeCollectionId: string | null;
}

export interface Command {
  id: string;
  prefix: string;        // e.g., "DES", "AW", "RP"
  aliases?: string[];
  label: string;
  description: string;
  hasArg?: boolean;       // true if prefix takes an argument (e.g., "DES AMD")
  argPlaceholder?: string;
  /** Named values the argument accepts, when it is one of a set (a theme, a language). */
  argOptions?: () => readonly ShortcutArgOption[];
  shortcut?: string;
  category: string;
  execute?: CommandExecutor;
}

/** Workstation actions; power workflows are contributed by the VIC1 plugin. */
export const commands: Command[] = [
  {
    id: "pane-settings",
    prefix: "PS",
    label: "Pane Settings",
    description: "Edit settings for the focused pane",
    category: "Config",
  },
  {
    id: "layout",
    prefix: "LMA",
    label: "Layout Actions",
    description: "Organize panes and saved layouts",
    hasArg: true,
    argPlaceholder: "action",
    category: "Config",
  },
  {
    id: "window-mode",
    prefix: "WIN",
    aliases: ["WM"],
    label: "Window Mode",
    description: "Move or resize the focused window",
    hasArg: true,
    argPlaceholder: "move|resize",
    category: "Config",
  },
  {
    id: "minimize-window",
    prefix: "",
    label: "Minimize Window",
    description: "Minimize the app window",
    category: "Config",
  },
  {
    id: "maximize-window",
    prefix: "",
    label: "Maximize Window",
    description: "Maximize the app window, or restore it when maximized",
    category: "Config",
  },
  {
    id: "toggle-status-bar",
    prefix: "SB",
    label: "Toggle Status Bar",
    description: "Show or hide the keyboard shortcuts bar",
    category: "Config",
    execute: (dispatch) => {
      dispatch({ type: "TOGGLE_STATUS_BAR" });
    },
  },
  {
    id: "toggle-presentation-mode",
    prefix: "",
    label: "Toggle Presentation Mode",
    description: "Let the panes fill the window, without the header or the status bar",
    category: "Config",
  },
  {
    id: "font-size-increase",
    prefix: "FONT+",
    label: "Increase Font Size",
    description: "Increase the app-wide font size",
    category: "Config",
  },
  {
    id: "font-size-decrease",
    prefix: "FONT-",
    label: "Decrease Font Size",
    description: "Decrease the app-wide font size",
    category: "Config",
  },
  {
    id: "theme",
    prefix: "TH",
    label: "Change Theme",
    description: "Switch color theme",
    hasArg: true,
    argPlaceholder: "theme name",
    argOptions: () => getThemeIds().map((id) => ({ value: id, label: getTheme(id).name })),
    category: "Config",
  },
  {
    id: "language",
    prefix: "LANG",
    aliases: ["LANGUAGE"],
    label: "Change Language",
    description: "Switch interface language",
    hasArg: true,
    argPlaceholder: "language",
    category: "Config",
  },
  {
    id: "export-config",
    prefix: "",
    label: "Export Config",
    description: "Save config to ~/vic1-config-backup.json",
    category: "Config",
  },
  {
    id: "import-config",
    prefix: "",
    label: "Import Config",
    description: "Load config from ~/vic1-config-backup.json",
    category: "Config",
  },
  {
    id: "reset-all-data",
    prefix: "",
    label: "Reset All Data",
    description: "Delete all data and reset to first-run state",
    category: "Danger",
  },
];

/** Find a command whose prefix matches the start of the input */
export function matchPrefix(input: string, commandList: Command[] = commands): { command: Command; arg: string; prefix: string } | null {
  const upper = input.toUpperCase().trim();
  if (!upper) return null;

  // Sort by prefix length descending so longer prefixes match first (e.g., "AW" before "A")
  const sorted = commandList
    .flatMap((command) => getCommandPrefixes(command).map((prefix) => ({ command, prefix })))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  for (const { command, prefix } of sorted) {
    if (upper.startsWith(`${prefix} `) || upper === prefix) {
      const arg = input.slice(prefix.length).trim();
      return { command, arg, prefix };
    }
  }

  return null;
}

export function getCommandPrefixes(command: Command): string[] {
  return [command.prefix, ...(command.aliases ?? [])]
    .map((prefix) => prefix.trim().toUpperCase())
    .filter(Boolean);
}
