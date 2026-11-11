import type { WorkstationPlugin } from "../types/plugin";
import { vicPowerPlugin } from "./builtin/vic-power";

export const uiBuiltinPlugins: WorkstationPlugin[] = [vicPowerPlugin];
