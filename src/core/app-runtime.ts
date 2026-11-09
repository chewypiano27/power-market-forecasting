import { PluginRegistry } from "../plugins/registry";
import { releaseSharedRegistry } from "../plugins/registry/shared";
import type { LoadedExternalPlugin } from "../plugins/loader";
import type { WorkstationPlugin } from "../types/plugin";

import { debugLog } from "../utils/debug-log";
import { measurePerfAsync } from "../utils/perf-marks";
import type { AppRuntimeServices, AppServicesFactoryOptions } from "./app-service-ports";

type Dispose = () => void;
type Runtime = AppRuntimeServices;
type RuntimeModules = Pick<Runtime, "pluginRegistry">;

interface AppRuntimeOptions extends AppServicesFactoryOptions, Pick<Runtime, "persistence"> {
  configure?: (modules: RuntimeModules) => void | Dispose;
  onReady?: (modules: RuntimeModules) => void | Dispose;
  onPluginError?: (error: unknown, plugin: WorkstationPlugin) => void;
}

const runtimeLog = debugLog.createLogger("app-runtime");

/**
 * A built-in that cannot register is a bug in this repository and stops
 * startup. An external plugin that cannot register is someone else's code:
 * a reserved or duplicate id, or a `setup()` that throws. Before this, one
 * such plugin in the plugins folder took the whole app down at launch,
 * with nothing on screen to say which one. Now the failure lands on the
 * plugin's entry, where the marketplace shows it as failed with the reason,
 * and the app starts without it. The registry has already undone the
 * partial registration by the time this runs.
 */
function recordExternalPluginFailure(
  externalPlugins: readonly LoadedExternalPlugin[] | undefined,
  plugin: WorkstationPlugin,
  error: unknown,
): boolean {
  const entry = externalPlugins?.find((candidate) => candidate.plugin === plugin);
  if (!entry) return false;
  const message = error instanceof Error ? error.message : String(error);
  entry.error = `Registration failed: ${message}`;
  runtimeLog.error("external plugin failed to register", { pluginId: plugin.id, path: entry.path, error: message });

  return true;
}

/** Hosts supply adapters; registration, shared-service ownership and disposal have one lifecycle. */
export function createAppRuntime({
  config, plugins, externalPlugins, persistence,
  configure, onReady, onPluginError,
}: AppRuntimeOptions): Runtime {
  const pluginRegistry = new PluginRegistry(persistence);
  // Usage counts keep a mnemonic for these; a plugin installed later is not one of them.

  const modules = { pluginRegistry };
  pluginRegistry.bindHost({ getConfig: () => config, getLayout: () => config.layout });

  let destroyed = false;
  let registering = false;
  let disposeConfigured: void | Dispose;
  let disposeReady: void | Dispose;
  const dispose = (...callbacks: Array<void | Dispose>) => {
    const errors: unknown[] = [];
    for (const callback of callbacks) {
      try { callback?.(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "App runtime teardown failed");
  };
  const disposePlugins = () => dispose(() => pluginRegistry.destroy(), disposeConfigured, () => persistence.close());
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    dispose(
      disposeReady,
      // An async setup may still use persistence or contribute panes. Dispose it
      // after setup settles, so it cannot write into a closed store or leak late contributions.
      registering ? undefined : disposePlugins,
      () => releaseSharedRegistry(pluginRegistry),
    );
  };

  try {
    disposeConfigured = configure?.(modules);
  } catch (error) {
    try { destroy(); } catch { /* Intentional ignore: destroy attempts all disposers; preserve the startup error rethrown to the caller. */ }
    throw error;
  }
  registering = true;
  const ready = Promise.allSettled(plugins.map((plugin) => (
    measurePerfAsync("startup.services.register-plugin", () => pluginRegistry.register(plugin), { pluginId: plugin.id })
      .catch((error) => {
        if (onPluginError) return onPluginError(error, plugin);
        if (!recordExternalPluginFailure(externalPlugins, plugin, error)) throw error;
      })
  ))).then((results) => {
    registering = false;
    if (destroyed) {
      disposePlugins();
      return;
    }
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const cleanup = onReady?.(modules);
    if (destroyed) cleanup?.();
    else disposeReady = cleanup;
  }).catch((error) => {
    try { destroy(); } catch { /* Intentional ignore: destroy attempts all disposers; preserve the startup error rethrown to the caller. */ }
    throw error;
  });
  return { persistence, ...modules, ready, destroy };
}
