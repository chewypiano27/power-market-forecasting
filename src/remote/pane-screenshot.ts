/**
 * pane.screenshot: one pane as a PNG, painted from what the window shows now.
 * The bounds keep the image legible for an assistant and small enough for one
 * Workstation Cloud socket frame (the terminal relay carries it to the MCP).
 */

/** Neither side of the image is longer; assistants shrink larger images anyway. */
export const PANE_SCREENSHOT_MAX_EDGE = 1600;
/** The narrowest image a caller can ask for, and the floor when shrinking to fit the byte cap. */
export const PANE_SCREENSHOT_MIN_WIDTH = 200;
/** The PNG never exceeds this; a larger paint is shrunk until it fits. */
export const PANE_SCREENSHOT_MAX_BYTES = 512 * 1024;

export interface PaneScreenshotRequest {
  instanceId: string;
  /** Device pixels per CSS pixel to paint a pane of this on-screen size at. */
  scaleFor(screen: { width: number; height: number }): number;
  maxBytes: number;
  minWidth: number;
}

interface PaneScreenshot {
  pngBase64: string;
  width: number;
  height: number;
  bytes: number;
  /** The pane's size on screen, in CSS pixels. */
  screen: { width: number; height: number };
  /** Shrunk below the asked size so the PNG fits `maxBytes`. */
  reduced: boolean;
}

/** Paints one pane of this window. Only renderers with pixels (the desktop app) have one. */
export type CapturePane = (request: PaneScreenshotRequest) => Promise<PaneScreenshot>;
