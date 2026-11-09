import type { AppSessionSnapshot } from "../../../core/state/session-persistence";
import type { PaneRuntimeState } from "../../../core/state/app/state";
import type { DesktopDockPreviewState, DesktopSharedStateSnapshot, DesktopThemePreviewState } from "../../../types/desktop-window";
import type { DesktopApplicationMenuCommand } from "../../../types/desktop-menu";
import type { AppConfig } from "../../../types/config";

import type { HttpProxyRequestEnvelope, HttpProxyResponseEnvelope } from "../../../utils/http-proxy-response";
import type { StallEvent } from "../../../utils/main-thread-stall";
import type { BootFrame } from "../../dom/boot-frame-page";

export const ELECTROBUN_CONTEXT_MENU_ACTION = "power.context-menu.select";

export interface ElectrobunBackendInit {
  config: AppConfig;
  sessionSnapshot: AppSessionSnapshot | null;
  desktopSnapshot: DesktopSharedStateSnapshot | null;
  desktopThemePreview: DesktopThemePreviewState;
  pluginState: Record<string, Record<string, unknown>>;
  /** Saved broker account snapshots, which the view's in-memory store starts from. */
  desktopPlatform: string;
  /** The machine name, which a remote assistant sees this desktop app under. */
  windowKind: "main" | "detached";
  paneId?: string;
  /** What the launch's plugin seed could not install, for the main window to say once. */
  /** What the view needs to send crash reports and usage counts the same way the Bun process would. */
}

export interface DesktopRestartMessage {
  reason?: string;
  source?: string;
}

export type DesktopWindowControlAction = "minimize" | "toggle-maximize" | "close";

export type DesktopContextMenuItem =
  | { type: "divider" }
  | {
    type?: "normal";
    label?: string;
    tooltip?: string;
    action?: string;
    role?: string;
    data?: unknown;
    submenu?: DesktopContextMenuItem[];
    enabled?: boolean;
    checked?: boolean;
    hidden?: boolean;
    accelerator?: string;
  };

export interface DesktopPluginStateSetEntry {
  pluginId: string;
  key: string;
  value: unknown;
  schemaVersion?: number;
}

interface DesktopBackendRequestMap {
  init: {
    request: { kind?: "main" | "detached"; paneId?: string };
    response: ElectrobunBackendInit;
  };
  "http.fetch": { request: HttpProxyRequestEnvelope; response: HttpProxyResponseEnvelope };
  "desktop.syncMainState": { request: { snapshot: DesktopSharedStateSnapshot }; response: null };
  "desktop.setThemePreview": { request: { preview: DesktopThemePreviewState }; response: null };
  "desktop.replaceDetachedPaneState": {
    request: { paneId: string; paneState: PaneRuntimeState };
    response: null;
  };
  "desktop.popOutPane": { request: { paneId: string }; response: null };
  "desktop.dockDetachedPane": {
    request: { paneId: string; edge?: "left" | "right" | "top" | "bottom" };
    response: null;
  };
  "desktop.closeDetachedPane": { request: { paneId: string }; response: null };
  "desktop.focusDetachedPane": { request: { paneId: string }; response: null };
  "pluginState.setMany": { request: { entries: DesktopPluginStateSetEntry[] }; response: null };
  "pluginState.delete": { request: { pluginId: string; key: string }; response: null };
  /** Remote default-branch heads by folder, for plugins the registry does not pin. */
  /** Compiles one plugin directory, fresh, for activation in the view. */
  /**
   * Loads and registers the plugin in the Bun process, where capabilities and
   * brokers execute. The view registers its own copy for panes and commands.
   */
  "host.exit": { request: null; response: null };
  "host.windowControl": { request: { action: DesktopWindowControlAction }; response: null };
  "host.windowFullscreen": { request: null; response: boolean };
  "host.openExternal": { request: { url: string }; response: boolean };
  "host.copyText": { request: { text: string }; response: null };
  "host.focusWindow": { request: null; response: null };
  "host.copyPngImage": { request: { pngBase64: string }; response: null };
  "host.readText": { request: null; response: string };
  "host.saveTextFile": {
    request: { name: string; text: string; mimeType: string };
    response: string;
  };
  "host.notify": {
    request: { title?: string; body?: string; subtitle?: string; sound?: string };
    response: null;
  };
  "host.showContextMenu": { request: { menu: DesktopContextMenuItem[] }; response: boolean };
  /** The layout the main window draws at the next launch before its script loads (dom/boot-frame.ts). Only the main window's is kept. */
  "host.saveBootFrame": { request: { frame: BootFrame }; response: null };
  /** The unread count for the Dock icon badge: `""` (none), `"1"` to `"99"` or `"99+"`. Only the main window's is applied. */
  "host.setAppBadge": { request: { label: string }; response: null };
  /** `channel` absent (an older view) means stable. */
  "config.save": { request: { config: AppConfig }; response: null };
  "config.resetAllData": { request: { dataDir: string }; response: null };
  "config.export": { request: { config: AppConfig; destPath: string }; response: null };
  "config.import": { request: { dataDir: string; srcPath: string }; response: AppConfig };
  "session.set": {
    request: { sessionId: string; value: unknown; schemaVersion?: number };
    response: null;
  };
  "session.delete": { request: { sessionId: string }; response: null };
  /** Saves or drops a broker account snapshot in the cache database; nothing else is accepted. */
}

export type DesktopBackendRequestMethod = keyof DesktopBackendRequestMap;
export type DesktopBackendRequestPayload<K extends DesktopBackendRequestMethod> =
  DesktopBackendRequestMap[K]["request"];
export type DesktopBackendRequestResponse<K extends DesktopBackendRequestMethod> =
  DesktopBackendRequestMap[K]["response"];
type DesktopBackendRequestFor<K extends DesktopBackendRequestMethod> = {
  [Method in K]: {
    method: Method;
    payload: DesktopBackendRequestPayload<Method>;
  };
}[K];
export type DesktopBackendRequest = DesktopBackendRequestFor<DesktopBackendRequestMethod>;
export type DesktopBackendRequestArgs<K extends DesktopBackendRequestMethod> =
  null extends DesktopBackendRequestPayload<K>
    ? [payload?: DesktopBackendRequestPayload<K>]
    : [payload: DesktopBackendRequestPayload<K>];
export type DesktopWorkspaceRequest = DesktopBackendRequestFor<Extract<DesktopBackendRequestMethod, `desktop.${string}`>>;
export type DesktopPluginStateRequest = DesktopBackendRequestFor<Extract<DesktopBackendRequestMethod, `pluginState.${string}`>>;
export type DesktopHostRequest = DesktopBackendRequestFor<Extract<DesktopBackendRequestMethod, `host.${string}`>>;
export type DesktopCoreRequest = DesktopBackendRequestFor<
  Extract<
    DesktopBackendRequestMethod,
    `config.${string}` | `session.${string}`
  >
>;

interface BackendRequestPayload {
  method: DesktopBackendRequestMethod;
  payload?: unknown;
}

export interface ContextMenuSelectMessage {
  requestId: string;
  itemId: string;
}

interface ApplicationMenuSelectMessage {
  command: DesktopApplicationMenuCommand;
}

interface DesktopStateMessage {
  snapshot: DesktopSharedStateSnapshot;
}

export interface DesktopDockPreviewMessage {
  preview: DesktopDockPreviewState;
}

export interface DesktopThemePreviewMessage {
  preview: DesktopThemePreviewState;
}

export interface DesktopDeepLinkMessage {
  url: string;
}

export interface ElectrobunDesktopRpcSchema {
  bun: {
    requests: {
      "backend.request": {
        params: BackendRequestPayload;
        response: unknown;
      };
    };
    messages: {
      "host.restart": DesktopRestartMessage;
      /** A window froze; the Bun process keeps the stall log and its report. */
      "runtime.stall": StallEvent;
    };
  };
  webview: {
    requests: {

    };
    messages: {
      "context-menu.select": ContextMenuSelectMessage;
      "application-menu.select": ApplicationMenuSelectMessage;
      "desktop.state": DesktopStateMessage;
      "desktop.dockPreview": DesktopDockPreviewMessage;
      "desktop.themePreview": DesktopThemePreviewMessage;
      "desktop.deepLink": DesktopDeepLinkMessage;
    };
  };
}
