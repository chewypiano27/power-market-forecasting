import type { ShortcutIntent } from "./shortcuts";
import type { CommandBarRoute } from "../../workflow/types";

export function buildRootShortcutFeedback({ currentRoute, rootShortcutIntent }: {
  currentRoute: CommandBarRoute | null;
  rootShortcutIntent: ShortcutIntent;
}): string | null {
  if (currentRoute || rootShortcutIntent.kind === "none") return null;
  if (rootShortcutIntent.source === "pane-template" || rootShortcutIntent.source === "plugin-command") {
    return `Shortcut: ${rootShortcutIntent.label}`;
  }
  return null;
}
