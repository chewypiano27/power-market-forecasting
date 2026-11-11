import { findPaneInstance, type AppConfig } from "../../types/config";

import { getDockedPaneIds } from "../../layout/pane-manager";
import { normalizeBuiltinPaneStatePluginOwners } from "../../plugins/ownership";

export const APP_SESSION_SCHEMA_VERSION = 1;
export const APP_SESSION_ID = "app";

export interface AppSessionSnapshot {
  paneState: Record<string, Record<string, unknown>>;
  focusedPaneId: string | null;
  /** @deprecated Ignored on read and no longer written. `focusedPaneId` is the resumed focus. */
  activePanel?: "left" | "right";
  statusBarVisible: boolean;
  openPaneIds: string[];
  /**
   * @deprecated Always empty. Exchange rates are not restored from the
   * session; read live rates with `useFxRatesMap` from `vic1/react`.
   */
  savedAt: number;
}

interface SessionStateInput {
  config: AppConfig;
  paneState: Record<string, Record<string, unknown>>;
  focusedPaneId: string | null;
  statusBarVisible: boolean;
}

export function buildAppSessionSnapshot(state: SessionStateInput): AppSessionSnapshot {
  return {
    paneState: Object.fromEntries(
      Object.entries(state.paneState)
        .filter(([paneId]) => !!findPaneInstance(state.config.layout, paneId))
        .map(([paneId, value]) => [paneId, { ...value }]),
    ),
    focusedPaneId: state.focusedPaneId,
    statusBarVisible: state.statusBarVisible,
    openPaneIds: [
      ...getDockedPaneIds(state.config.layout),
      ...state.config.layout.floating.map((entry) => entry.instanceId),
    ],
    savedAt: Date.now(),
  };
}

export function reconcileAppSessionSnapshot(
  config: AppConfig,
  snapshot: AppSessionSnapshot | null | undefined,
): AppSessionSnapshot | null {
  if (!snapshot) return null;

  const validPaneIds = new Set(config.layout.instances.map((instance) => instance.instanceId));
  const paneState = normalizeBuiltinPaneStatePluginOwners(Object.fromEntries(
    Object.entries(snapshot.paneState ?? {}).filter(([paneId]) => validPaneIds.has(paneId)),
  ));
  const openPaneIds = (snapshot.openPaneIds ?? []).filter((paneId) => validPaneIds.has(paneId));
  const defaultOpenPaneId = getDockedPaneIds(config.layout)[0] ?? config.layout.floating[0]?.instanceId ?? null;
  const focusedPaneId = snapshot.focusedPaneId && validPaneIds.has(snapshot.focusedPaneId)
    ? snapshot.focusedPaneId
    : openPaneIds[0] ?? defaultOpenPaneId;

  return {
    paneState,
    focusedPaneId,
    statusBarVisible: snapshot.statusBarVisible !== false,
    openPaneIds,
    savedAt: typeof snapshot.savedAt === "number" ? snapshot.savedAt : Date.now(),
  };
}
