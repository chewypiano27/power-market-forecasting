import type { SavedLayout } from "../../types/config";

export type TabGroupId = "personal" | `team:${string}`;

export function groupIdFor(layout: Pick<SavedLayout, "origin">): TabGroupId {
  return layout.origin ? `team:${layout.origin.teamId}` : "personal";
}
