import type { AppState } from "../../../state/app/context";
import type { CommandBarWorkflowRoute } from "./types";
import { buildCommandBarWorkflowRoute } from "./route-builder";
export function buildLayoutNameWorkflowRoute(
  actionId: "new-layout" | "rename-layout",
  layouts: AppState["config"]["layouts"],
  layoutIndex: number,
): CommandBarWorkflowRoute {
  const renaming = actionId === "rename-layout";
  const currentName = renaming ? layouts[layoutIndex]?.name ?? "" : "";
  return buildCommandBarWorkflowRoute({
    workflowId: `builtin:${actionId}`,
    title: renaming ? "Rename Layout" : "New Layout",
    fields: [{
      id: "name",
      label: "Layout Name",
      type: "text",
      placeholder: "Trading, Research, Overview",
      required: true,
    }],
    values: { name: currentName },
    submitLabel: renaming ? "Rename Layout" : "Create Layout",
    pendingLabel: renaming ? "Renaming layout…" : "Creating layout…",
    payload: { kind: "builtin", actionId },
    ...(renaming ? { payloadMeta: { layoutIndex, layoutName: currentName } } : {}),
  });
}
