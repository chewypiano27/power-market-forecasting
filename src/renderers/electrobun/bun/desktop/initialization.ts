import { existsSync, mkdirSync } from "fs";
import { getVic1Dirs } from "../../../../data/config/home";
import type { AppServices } from "../../../../core/app-services";
import {
  getDataDir,
  initDataDir,
} from "../../../../data/config/store";
import type { AppConfig } from "../../../../types/config";

import {
  loadDesktopPluginState,
} from "./plugin-state";
import { createDesktopWorkspace } from "./workspace";
import {
  MAIN_WINDOW_RPC_KEY,
  paneIdFromDetachedRpcKey,
} from "../window/focus";
import type { DesktopBackendRequestPayload, ElectrobunBackendInit } from "../../shared/protocol";

import type { DesktopBackend, DesktopRpc } from "./backend";

interface DesktopWindowTarget {
  kind: "main" | "detached";
  paneId?: string;
}

function normalizeInitWindowTarget(
  rpcKey: string | undefined,
  payload: DesktopBackendRequestPayload<"init">,
): DesktopWindowTarget {
  if (rpcKey === MAIN_WINDOW_RPC_KEY) return { kind: "main" };

  const detachedPaneId = paneIdFromDetachedRpcKey(rpcKey);
  if (detachedPaneId) {
    return {
      kind: "detached",
      paneId: detachedPaneId,
    };
  }

  const kind = payload.kind === "detached" ? "detached" : "main";
  return {
    kind,
    paneId: kind === "detached" && typeof payload.paneId === "string" && payload.paneId.length > 0
      ? payload.paneId
      : undefined,
  };
}

function buildInitializationPayload(
  backend: DesktopBackend,
  config: AppConfig,
  services: AppServices,
  windowTarget: DesktopWindowTarget,
): ElectrobunBackendInit {
  // The main window says once what the launch's seed could not install.
  return {
    config,
    sessionSnapshot: backend.getSessionSnapshot(),
    desktopSnapshot: backend.workspace?.getSnapshot() ?? null,
    desktopThemePreview: backend.stateBroadcaster.currentThemePreview,
    pluginState: loadDesktopPluginState(services.pluginRegistry),
    desktopPlatform: process.platform,
    windowKind: windowTarget.kind,
    paneId: windowTarget.paneId,
  };
}

async function resolveDesktopDataDir(): Promise<string> {
  const dataDir = await getDataDir() ?? getVic1Dirs().data;
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

/** The launch work, in order. Injected so a test can watch the order without a data folder. */
export interface DesktopLaunchSteps {
  readConfig(): Promise<AppConfig>;
  /** Installs plugins that moved into their own repositories; returns the seed record to merge. */
  restorePlugins(): Promise<Partial<AppConfig> | null>;
  startServices(config: AppConfig): Promise<unknown>;
  /** Starts compiling the plugins for the view; not awaited. */

}

function desktopLaunchSteps(backend: DesktopBackend): DesktopLaunchSteps {
  return {
    readConfig: async () => initDataDir(await resolveDesktopDataDir()),
    // Restore plugins that moved into their own repositories before the
    // catalog is read, the same as the terminal does at startup. Without it a
    // desktop-only user silently loses a feature the day it is extracted,
    // since nothing else installs it for them.
    restorePlugins: async () => null,
    startServices: (config) => backend.startServices(config),

  };
}

const launches = new WeakMap<object, Promise<void>>();

/**
 * Opens the data folder and starts the services every window shares: the
 * config, restored plugins, and every plugin registered. That takes most of
 * a second, and it used to wait for the view to load its bundle and ask for
 * `init`. Started when the process starts, it runs while the window opens
 * and the view loads, and `init` finds it done or nearly so. The plugins the
 * view runs then start compiling, still before the view asks for them, and
 * after the services imported them, so two loads never link one plugin at once.
 *
 * Callers share a run in flight. With the services up it does nothing; after
 * they were torn down (all data reset) or a run failed, it starts over.
 */
export function startDesktopBackend(
  backend: DesktopBackend,
  steps: DesktopLaunchSteps = desktopLaunchSteps(backend),
): Promise<void> {
  const running = launches.get(backend);
  if (running) return running;
  if (backend.config && backend.services) return Promise.resolve();
  const launch = (async () => {
    const initialConfig = await steps.readConfig();
    const seed = await steps.restorePlugins();
    await steps.startServices(seed ? { ...initialConfig, ...seed } : initialConfig);

  })();
  launches.set(backend, launch);
  const settled = () => {
    if (launches.get(backend) === launch) launches.delete(backend);
  };
  // The caller that awaits the launch reports a failure; this only lets the next one start over.
  launch.then(settled, settled);
  return launch;
}

export async function initializeDesktopBackend(
  backend: DesktopBackend,
  rpc: DesktopRpc,
  payload: DesktopBackendRequestPayload<"init">,
): Promise<ElectrobunBackendInit> {
  const windowTarget = normalizeInitWindowTarget(backend.rpcs.getRpcWindowKey(rpc), payload);
  backend.rpcs.markWindowRpcReady(rpc);
  backend.stateBroadcaster.forgetWindowState(rpc);

  await startDesktopBackend(backend);
  const config = backend.requireConfig();
  const services = backend.requireServices();
  if (!backend.workspace) {
    backend.workspace = createDesktopWorkspace(config, backend.getSessionSnapshot());
    backend.detachedWindows.reconcile();
  }
  return buildInitializationPayload(backend, config, services, windowTarget);
}
