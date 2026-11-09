import { type ReactNode, type RefObject } from "react";
import { type ScrollBoxRenderable } from "../../ui";

/** A variable-height list. The terminal keeps its ordinary, unwindowed rows. */
export interface WindowedListProps {
  itemKeys: readonly string[];
  renderItem: (index: number) => ReactNode;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  /** Pixel estimate only; mounted rows are measured at their actual CSS width. */
  estimateSize?: number;
  overscan?: number;
  onScrollActivity?: (event?: { scroll?: { direction?: "up" | "down" | "left" | "right" } }) => void;
  onPinChange?: (pinned: boolean) => void;
  onPointerMove?: (event: { target?: unknown; pixelX?: number; pixelY?: number }) => void;
  role?: string;
}
