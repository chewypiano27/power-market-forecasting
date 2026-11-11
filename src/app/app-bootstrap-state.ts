import {
  APP_SESSION_ID,
  APP_SESSION_SCHEMA_VERSION,
  reconcileAppSessionSnapshot,
  type AppSessionSnapshot,
} from "../core/state/session-persistence";
import { materializeDetachedLayouts } from "../core/state/app/layout";
import type { SessionStore } from "../data/session-store";
import type { AppConfig } from "../types/config";
import type {
  DesktopSharedStateSnapshot,
  DesktopWindowBridge,
} from "../types/desktop-window";

type SessionSnapshotReader = Pick<SessionStore, "get">;

interface ResolveInitialAppConfigOptions {
  initialConfig: AppConfig;
  desktopSnapshot?: DesktopSharedStateSnapshot | null;
  hasDesktopWindowBridge: boolean;
}

interface ResolveAppSessionSnapshotOptions {
  config: AppConfig;
  desktopSnapshot?: DesktopSharedStateSnapshot | null;
  desktopWindowKind?: DesktopWindowBridge["kind"];
  sessionStore: SessionSnapshotReader;
}

export function resolveInitialAppConfig({
  initialConfig,
  desktopSnapshot = null,
  hasDesktopWindowBridge,
}: ResolveInitialAppConfigOptions): AppConfig {
  const baseConfig = desktopSnapshot?.config ?? initialConfig;
  return hasDesktopWindowBridge ? baseConfig : materializeDetachedLayouts(baseConfig);
}

function readPersistedAppSessionSnapshot(
  sessionStore: SessionSnapshotReader,
): AppSessionSnapshot | null {
  return sessionStore.get<AppSessionSnapshot>(APP_SESSION_ID, APP_SESSION_SCHEMA_VERSION)?.value ?? null;
}

function createDetachedSessionSnapshotFallback(): AppSessionSnapshot {
  return {
    paneState: {},
    focusedPaneId: null,
    statusBarVisible: true,
    openPaneIds: [],
    savedAt: Date.now(),
  };
}

function resolveDetachedAppSessionSnapshot(
  config: AppConfig,
  sessionStore: SessionSnapshotReader,
  desktopSnapshot?: DesktopSharedStateSnapshot | null,
): AppSessionSnapshot | null {
  const baseSessionSnapshot = reconcileAppSessionSnapshot(
    config,
    readPersistedAppSessionSnapshot(sessionStore),
  ) ?? createDetachedSessionSnapshotFallback();

  return desktopSnapshot
    ? {
      ...baseSessionSnapshot,
      paneState: desktopSnapshot.paneState,
      focusedPaneId: desktopSnapshot.focusedPaneId,
      statusBarVisible: desktopSnapshot.statusBarVisible,
    }
    : null;
}

export function resolveAppSessionSnapshot({
  config,
  desktopSnapshot = null,
  desktopWindowKind,
  sessionStore,
}: ResolveAppSessionSnapshotOptions): AppSessionSnapshot | null {
  if (desktopWindowKind === "detached") {
    return resolveDetachedAppSessionSnapshot(config, sessionStore, desktopSnapshot);
  }

  const persisted = readPersistedAppSessionSnapshot(sessionStore);
  const reconciled = reconcileAppSessionSnapshot(config, persisted);
  return reconciled;
}
