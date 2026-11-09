import type { AppState } from "../../../state/app/context";
import type { CommandBarWorkflowRoute } from "./types";
import { buildLayoutNameWorkflowRoute } from "./layout-name";
export { buildLayoutNameWorkflowRoute };
export function buildBuiltInWorkflowRoute({actionId,config}: {actionId:string;config:AppState["config"]}): {kind:"route";route:CommandBarWorkflowRoute}|{kind:"none"} {
 if(actionId!=="new-layout"&&actionId!=="rename-layout")return {kind:"none"};
 return {kind:"route",route:buildLayoutNameWorkflowRoute(actionId,config.layouts,config.activeLayoutIndex)};
}
