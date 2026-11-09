import type { Dispatch } from "react";

import type { PluginRegistry } from "../../plugins/registry";
import { type AppAction, type AppState } from "../../state/app/context";

/** What a form needs from the app to submit. Read when it submits, never kept. */
export interface FormModalDeps {

  dispatch: Dispatch<AppAction>;
  getState: () => AppState;
  pluginRegistry: PluginRegistry;

}
