export const REMOTE_CONTROL_PROTOCOL_VERSION = 1;

export interface RemoteUiNodeSnapshot {
  id: string;
  role: string;
  /** The pane instance the node is drawn in; absent outside panes. */
  paneId?: string;
  label?: string;
  disabled?: boolean;
  actions: string[];
  metadata?: Record<string, unknown>;
}
