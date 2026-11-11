import type { AppState } from "../../../../state/app/context";
import type { Command } from "../../commands/registry";
import type { ResultItem } from "../../list/model";

interface RootCommandItemBuilderOptions {
  hasPaneSettings: (paneId: string) => boolean;
  runDirectCommand: (command: Command, arg: string) => void;
  state: AppState;
}

export function createRootCommandItemBuilder({ hasPaneSettings, runDirectCommand, state }: RootCommandItemBuilderOptions): (command: Command, arg?: string) => ResultItem | null {
  return (command, arg = "") => {
    if (command.id === "pane-settings" && (!state.focusedPaneId || !hasPaneSettings(state.focusedPaneId))) return null;
    const detail = command.id === "toggle-presentation-mode"
      ? state.config.presentationMode ? "Currently on" : "Currently off"
      : command.id === "font-size-increase" || command.id === "font-size-decrease"
        ? `Currently ${state.config.fontSize ?? 12}px` : command.description;
    return {
      id: command.id, label: command.label, detail, category: command.category,
      kind: "command", right: command.prefix || undefined, shortcutQuery: command.prefix || undefined,
      action: () => runDirectCommand(command, arg),
    };
  };
}
