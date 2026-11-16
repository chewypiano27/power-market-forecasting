/** @jsxImportSource react */
import type { RendererHost, UiHost } from "../../../ui/host";
import { backendRequest } from "./backend-rpc";
import { NATIVE_CONTEXT_MENU_SUPPORTED, showDesktopContextMenu } from "./host/native";
import { startElectrobunWindowDrag } from "./host/window-move";
import { createDomUiHost } from "../../dom/dom-ui-host";

export function createWebUiHost(desktopPlatform?: string): UiHost {
  return createDomUiHost(desktopPlatform, {
    nativeContextMenu: NATIVE_CONTEXT_MENU_SUPPORTED,
    publicSharing: false,
  });
}

export const webUiHost: UiHost = createWebUiHost();

export const webRendererHost: RendererHost = {
  supportsNativeDesktopNotifications: true,
  requestExit() {
    // The Bun process ends the app on `host.exit`, before `pagehide` could
    // send what was counted, so that goes first.
    void backendRequest("host.exit").catch(() => window.close());
  },
  startWindowDrag() {
    startElectrobunWindowDrag();
  },
  async controlWindow(action) {
    // Closing the main window quits the app; send what was counted first.
    await backendRequest("host.windowControl", { action });
  },
  async openExternal(url) {
    return await backendRequest("host.openExternal", { url });
  },
  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      await backendRequest("host.copyText", { text });
    }
  },
  async readText() {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return backendRequest("host.readText");
    }
  },
  async saveTextFile({ name, text, mimeType }) {
    return backendRequest("host.saveTextFile", { name, text, mimeType });
  },
  notify(notification) {
    void backendRequest("host.notify", {
      title: notification.title,
      body: notification.body,
      subtitle: notification.subtitle,
      sound: notification.sound,
    }).catch(() => {});
  },
  showContextMenu: showDesktopContextMenu,
};
