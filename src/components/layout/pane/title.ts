import type { AppState } from "../../../state/app/context";
import { t } from "../../../i18n";
import type { PaneInstanceConfig } from "../../../types/config";
import type { PaneDef } from "../../../types/plugin";

export function getBasePaneDisplayTitle(
  _state: Pick<AppState, "config" | "paneState">,
  instance: PaneInstanceConfig,
  paneDef: PaneDef,
  _panes?: ReadonlyMap<string, PaneDef>,
): string {
  return instance.title || t(paneDef.name);
}

export function getPaneDisplayTitle(
  state: Pick<AppState, "config" | "paneState">,
  instance: PaneInstanceConfig,
  paneDef: PaneDef,
  panes?: ReadonlyMap<string, PaneDef>,
): string {
  return getBasePaneDisplayTitle(state, instance, paneDef, panes);
}
