import type { PanePersonalData } from "../types/plugin";
import type { NativePaneImage } from "../ui/host";

/** A picture of one pane as it looked when it was taken, ready to post. */
export interface PaneImageCapture {
  paneId: string;
  paneType: string;
  title: string;
  /** ISO instant the picture was taken; its status line shows it. */
  capturedAt: string;
  /** What personal data the pane shows, so posting it asks first; null for market data. */
  personalData: PanePersonalData | null;
  png: Uint8Array;
  width: number;
  height: number;
  /** The terminal's picture as RGBA, for a preview in cells where the terminal cannot show images. */
  pixels?: Uint8ClampedArray;
  /** The terminal cells the picture was drawn from, for a preview where they fit. */
  cells?: NativePaneImage["cells"];
}
