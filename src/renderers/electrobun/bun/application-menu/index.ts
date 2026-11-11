import type { ApplicationMenuItemConfig } from "electrobun/bun";
import type { DesktopApplicationMenuCommand } from "../../../../types/desktop-menu";
import type { KeybindingsConfig } from "../../../../types/config";
import { menuAcceleratorFor } from "../../../../app/keybindings/labels";
import { resolveKeybindings, type ResolvedKeybindings } from "../../../../app/keybindings/resolve";

export const ELECTROBUN_APPLICATION_MENU_ACTION = "power.application-menu.select";

export type ElectrobunApplicationMenuCommand =
  | DesktopApplicationMenuCommand
  | { type: "open-devtools" };

function commandItem(
  label: string,
  command: ElectrobunApplicationMenuCommand,
  options: { accelerator?: string } = {},
): ApplicationMenuItemConfig {
  return {
    label,
    action: ELECTROBUN_APPLICATION_MENU_ACTION,
    data: command,
    ...(options.accelerator ? { accelerator: options.accelerator } : {}),
  };
}

function openCommandBar(label: string, query: string, options?: { accelerator?: string }): ApplicationMenuItemConfig {
  return commandItem(label, { type: "open-command-bar", query }, options);
}

function buildApplicationMenu(keybindings: ResolvedKeybindings): ApplicationMenuItemConfig[] {
  const accelerator = (actionId: string) => ({ accelerator: menuAcceleratorFor(keybindings, actionId) });
  return [
    {
      label: "VIC1 Power Trader Workstation",
      submenu: [
        { role: "about" },
        { type: "divider" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "divider" },
        commandItem("Quit VIC1 Power Trader Workstation", { type: "quit" }, { accelerator: "CmdOrCtrl+Q" }),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "divider" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        openCommandBar("Open Command Bar", "", accelerator("command-bar")),
        { type: "divider" },
        commandItem("Toggle Status Bar", { type: "toggle-status-bar" }),
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "divider" },
        { role: "toggleFullScreen" },
        { type: "divider" },
        { role: "close" },
        { type: "divider" },
        { role: "bringAllToFront" },
      ],
    },
  ];
}

export function buildDesktopApplicationMenu(
  platform = process.platform,
  keybindings?: KeybindingsConfig,
): ApplicationMenuItemConfig[] {
  return platform === "win32" ? [] : buildApplicationMenu(resolveKeybindings(keybindings));
}
