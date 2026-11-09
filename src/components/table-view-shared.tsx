import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Box, useUiCapabilities, type ScrollBoxRenderable } from "../ui";
import type { DataTableProps } from "./ui/data-table/types";

export interface TableViewFrameProps {
  width?: number;
  height?: number;
  /** Desktop and web: as tall as the table's rows, not the space it is given (`fitRows`). */
  fit?: boolean;
  backgroundColor?: string;
  before?: ReactNode;
  after?: ReactNode;
  children: ReactNode;
}

export function TableViewFrame({
  width,
  height,
  fit = false,
  backgroundColor,
  before,
  after,
  children,
}: TableViewFrameProps) {
  const { nativePaneChrome } = useUiCapabilities();
  const nativeFlexibleFrame = nativePaneChrome === true && !fit;
  const nativeFitFrame = nativePaneChrome === true && fit;

  return (
    <Box
      flexDirection="column"
      flexGrow={nativeFitFrame ? 0 : nativeFlexibleFrame || height == null ? 1 : undefined}
      flexShrink={nativeFitFrame ? 0 : nativeFlexibleFrame ? 1 : height == null ? undefined : 0}
      flexBasis={nativeFlexibleFrame ? 0 : undefined}
      width={width}
      height={nativeFlexibleFrame || nativeFitFrame ? undefined : height}
      minWidth={nativeFlexibleFrame ? 0 : undefined}
      minHeight={nativeFlexibleFrame ? 0 : undefined}
      maxHeight={nativeFlexibleFrame ? "100%" : undefined}
      backgroundColor={backgroundColor}
      overflow="hidden"
      data-power-role="table-view-frame"
    >
      {before}
      {children}
      {after}
    </Box>
  );
}

export function useTableViewState({
  headerScrollRef,
  scrollRef,
  syncHeaderScroll,
}: {
  headerScrollRef?: RefObject<ScrollBoxRenderable | null>;
  scrollRef?: RefObject<ScrollBoxRenderable | null>;
  syncHeaderScroll?: () => void;
}) {
  const internalHeaderScrollRef = useRef<ScrollBoxRenderable>(null);
  const internalScrollRef = useRef<ScrollBoxRenderable>(null);

  const effectiveHeaderScrollRef = headerScrollRef ?? internalHeaderScrollRef;
  const effectiveScrollRef = scrollRef ?? internalScrollRef;

  const defaultSyncHeaderScroll = useCallback(() => {
    const body = effectiveScrollRef.current;
    const header = effectiveHeaderScrollRef.current;
    if (!body || !header) return;
    if (header.scrollLeft !== body.scrollLeft) {
      header.scrollLeft = body.scrollLeft;
    }
  }, [effectiveHeaderScrollRef, effectiveScrollRef]);

  return {
    effectiveHeaderScrollRef,
    effectiveScrollRef,
    effectiveSyncHeaderScroll: syncHeaderScroll ?? defaultSyncHeaderScroll,
  };
}

export function useTableBodyScrollActivity({
  onBodyScrollActivity,
  syncHeaderScroll,
  afterScroll,
}: {
  onBodyScrollActivity?: DataTableProps<unknown>["onBodyScrollActivity"];
  syncHeaderScroll: () => void;
  afterScroll?: () => void;
}) {
  return useCallback<DataTableProps<unknown>["onBodyScrollActivity"]>((source) => {
    if (onBodyScrollActivity) {
      onBodyScrollActivity(source);
    } else {
      queueMicrotask(syncHeaderScroll);
    }
    if (afterScroll) {
      queueMicrotask(afterScroll);
    }
  }, [afterScroll, onBodyScrollActivity, syncHeaderScroll]);
}

export function useResetTableScroll({
  headerScrollRef,
  scrollRef,
  resetScrollKey,
  afterReset,
}: {
  headerScrollRef: RefObject<ScrollBoxRenderable | null>;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  resetScrollKey?: unknown;
  afterReset?: () => void;
}) {
  const afterResetRef = useRef(afterReset);

  useEffect(() => {
    afterResetRef.current = afterReset;
  }, [afterReset]);

  useEffect(() => {
    if (resetScrollKey === undefined) return;
    const body = scrollRef.current;
    if (body) {
      body.scrollTop = 0;
      body.scrollLeft = 0;
    }
    const header = headerScrollRef.current;
    if (header) {
      header.scrollLeft = 0;
    }
    if (afterResetRef.current) {
      queueMicrotask(afterResetRef.current);
    }
  }, [headerScrollRef, resetScrollKey, scrollRef]);
}
