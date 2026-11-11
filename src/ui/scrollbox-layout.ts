type ObservedBox = { onSizeChange?: (() => void) | null };
type ObservedScrollBox = { content?: ObservedBox; viewport?: ObservedBox };
import type { ScrollBoxRenderable } from "./host";

/** Observe computed native content layout after ScrollBox updates its range. */
export function observeScrollBoxContentSize(
  scrollBox: ScrollBoxRenderable | null,
  onSizeChange: () => void,
): (() => void) | undefined {
  return observeSizeChange((scrollBox as ObservedScrollBox | null)?.content, onSizeChange);
}

/** Scrollbars can resize the viewport without changing the scroll box itself. */
export function observeScrollBoxViewportSize(
  scrollBox: ScrollBoxRenderable | null,
  onSizeChange: () => void,
): (() => void) | undefined {
  return observeSizeChange((scrollBox as ObservedScrollBox | null)?.viewport, onSizeChange);
}

function observeSizeChange(content: ObservedBox | undefined, onSizeChange: () => void) {
  if (!content) return;
  // Computed layout invokes onSizeChange, not the explicit resize event.
  // Preserve the internal handler that recalculates the scrollbars.
  const previousSizeChange = content.onSizeChange;
  const handleContentSizeChange = () => {
    previousSizeChange?.call(content);
    onSizeChange();
  };
  content.onSizeChange = handleContentSizeChange;
  return () => {
    if (content.onSizeChange === handleContentSizeChange) {
      content.onSizeChange = previousSizeChange;
    }
  };
}
