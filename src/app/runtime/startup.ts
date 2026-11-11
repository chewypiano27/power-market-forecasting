import { useEffect, type Dispatch } from "react";
import type { AppAction } from "../../state/app/context";
import { logFailure } from "../../utils/log-failure";

/** Electricity panes own their feed loading; startup only waits for pane registration. */
export function useAppStartupRuntime({ dispatch, initialized, pluginsReady }: {
  dispatch: Dispatch<AppAction>;
  initialized: boolean;
  pluginsReady?: Promise<unknown>;
}): void {
  useEffect(() => {
    if (initialized) return;
    let disposed = false;
    void Promise.resolve(pluginsReady).then(() => {
      if (!disposed) dispatch({ type: "SET_INITIALIZED" });
    }).catch(logFailure("app.runtime.startup", "Electricity pane registration failed"));
    return () => { disposed = true; };
  }, [dispatch, initialized, pluginsReady]);
}
