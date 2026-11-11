import type { PaneDef, PaneProps } from "../../types/plugin";
import { PaneStatusBody } from "../ui";

function MissingPanePlaceholder({ paneType, width, height }: PaneProps) {
  return <PaneStatusBody empty subject={paneType} emptyTitle="This pane is unavailable in this desktop build." width={width} height={height} />;
}

const placeholders = new Map<string, PaneDef>();

/**
 * A pane definition standing in for one this terminal does not have. The
 * instance config passes through untouched, so a layout published from here
 * still carries the pane for teammates who do have the plugin.
 */
export function missingPanePlaceholderDef(paneId: string): PaneDef {
  let def = placeholders.get(paneId);
  if (!def) {
    def = {
      id: paneId,
      name: paneId,
      icon: "?",
      component: MissingPanePlaceholder,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 60, height: 12 },
      portableShare: { private: {} },
      // It draws a notice, not the pane's own data.
      personalData: () => null,
    };
    placeholders.set(paneId, def);
  }
  return def;
}
