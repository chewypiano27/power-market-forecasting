import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { t } from "../i18n";
import { getSharedRegistry, type PluginRegistry } from "../plugins/registry";

import {
  contextMenuDivider,
  hasRunnableContextMenuItem,
  type ContextMenuContext,
  type ContextMenuDividerItem,
  type ContextMenuItem,
} from "../types/context-menu";

import { useRendererHost, useUiCapabilities } from "./host";
import { menuAcceleratorFor, useKeybindings } from "../app/keybindings";

interface ContextMenuEventLike {
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

interface RightClickSelectionGesture {
  selectedBefore: string;
  startedAt: number;
}

interface ContextMenuController {
  showContextMenu(
    context: ContextMenuContext,
    items: ContextMenuItem[],
    event?: ContextMenuEventLike,
  ): Promise<boolean>;
}

const ContextMenuControllerContext = createContext<ContextMenuController | null>(null);
const noopContextMenuController: ContextMenuController = {
  showContextMenu: async () => false,
};
const EDITABLE_SELECTOR = "input, textarea, [contenteditable='true']";
const MENU_SURFACE_SELECTOR = [
  "[data-power-context-menu-surface='true']",
  "[data-power-role='pane-header']",
  "[data-power-role='pane-action']",
  "[data-power-role='pane-close']",
  "[data-power-role='pane-restore']",
  "[data-power-role='status-bar']",
  "[data-power-role='tab-button']",
  // A strip's "+" (a tab's close mark sits inside its tab-button).
  "[data-power-role='tab-add']",
].join(", ");

function isDivider(item: ContextMenuItem): item is ContextMenuDividerItem {
  return item.type === "divider";
}

export function compactContextMenuItems(items: ContextMenuItem[]): ContextMenuItem[] {
  const result: ContextMenuItem[] = [];
  for (const item of items) {
    if (isDivider(item)) {
      if (result.length === 0 || isDivider(result[result.length - 1]!)) continue;
      result.push(item);
      continue;
    }
    if (item.hidden === true) continue;
    const nextItem = item.type === "normal" || item.type == null
      ? {
        ...item,
        submenu: item.submenu ? compactContextMenuItems(item.submenu) : undefined,
      }
      : item;
    if (nextItem.type !== "role" && nextItem.submenu && !hasRunnableContextMenuItem(nextItem.submenu)) {
      result.push({ ...nextItem, enabled: false, submenu: nextItem.submenu });
      continue;
    }
    result.push(nextItem);
  }

  while (result.length > 0 && isDivider(result[result.length - 1]!)) {
    result.pop();
  }
  return result;
}

function withSafeActions(
  items: ContextMenuItem[],
  onError: (error: unknown) => void,
): ContextMenuItem[] {
  return items.map((item) => {
    if (item.type === "divider" || item.type === "role") return item;
    return {
      ...item,
      submenu: item.submenu ? withSafeActions(item.submenu, onError) : undefined,
      onSelect: item.onSelect
        ? () => {
          try {
            const result = item.onSelect?.();
            if (result instanceof Promise) {
              void result.catch(onError);
            }
          } catch (error) {
            onError(error);
          }
        }
        : undefined,
    };
  });
}

function selectedTextTickerSymbol(text: string): string | null {
  const normalized = text.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(normalized) ? normalized : null;
}

function elementTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function selectionText(): string {
  return window.getSelection()?.toString().trim() ?? "";
}

function clearBrowserSelection(): void {
  window.getSelection()?.removeAllRanges();
}

function selectedTextMenuItems(text: string, registry: PluginRegistry | null, copyText: (text: string) => Promise<void>): ContextMenuItem[] {
  const symbol = selectedTextTickerSymbol(text);
  const ticker = symbol ? registry?.getTicker(symbol) ?? null : null;
  const items: ContextMenuItem[] = [
    { type: "role", role: "copy", label: "Copy" },
  ];
  if (ticker && symbol) {
    items.push(
      contextMenuDivider("selected-text:ticker-divider"),
      {
        id: "selected-text:open-ticker",
        label: "Open Ticker Research",
        onSelect: () => registry?.navigateTicker(symbol),
      },
      {
        id: "selected-text:copy-symbol",
        label: "Copy Symbol",
        onSelect: () => { void copyText(symbol); },
      },
    );
  }
  return items;
}

export function editableTextContextMenuItems(): ContextMenuItem[] {
  return [
    { type: "role", role: "undo" },
    { type: "role", role: "redo" },
    contextMenuDivider("edit:history"),
    { type: "role", role: "cut" },
    { type: "role", role: "copy" },
    { type: "role", role: "paste" },
    contextMenuDivider("edit:selection"),
    { type: "role", role: "selectAll" },
  ];
}

function appContextMenuItems(
  registry: Pick<PluginRegistry, "openCommandBar"> | null,
  commandBarAccelerator?: string,
): ContextMenuItem[] {
  return [
    {
      id: "app:command-bar",
      label: "Command Bar",
      accelerator: commandBarAccelerator,
      onSelect: () => registry?.openCommandBar(),
    },
    {
      id: "app:layout-actions",
      label: "Layout Actions...",
      onSelect: () => registry?.openCommandBar("LMA "),
    },
    contextMenuDivider("app:config-divider"),
    {
      id: "app:plugins",
      label: "Manage Plugins...",
      onSelect: () => registry?.openCommandBar("PL "),
    },
    {
      id: "app:theme",
      label: "Change Theme...",
      onSelect: () => registry?.openCommandBar("TH "),
    },
    {
      id: "app:updates",
      label: "Check for Updates",
      onSelect: () => registry?.openCommandBar("Check for Updates"),
    },
  ];
}

/**
 * A context's own items, then what plugins add for it: the menu a right-click
 * shows, for a surface that lists it somewhere else too (the pane menu).
 */
/**
 * Marks where plugin items go among a context's own items, as a divider with
 * this id; the marker itself is never drawn. Without one they follow at the end.
 */
export function pluginContextMenuSlot(kind: ContextMenuContext["kind"]): ContextMenuItem {
  return contextMenuDivider(`${kind}:plugin-items`);
}

export function withPluginContextMenuItems(
  context: ContextMenuContext,
  localItems: ContextMenuItem[],
  registry: Pick<PluginRegistry, "getContextMenuItems"> | null,
): ContextMenuItem[] {
  const pluginItems = registry?.getContextMenuItems?.(context) ?? [];
  const slot = localItems.findIndex((item) => item.type === "divider" && item.id === `${context.kind}:plugin-items`);
  if (slot >= 0) {
    return compactContextMenuItems([...localItems.slice(0, slot), ...pluginItems, ...localItems.slice(slot + 1)]);
  }
  return compactContextMenuItems([
    ...localItems,
    ...(localItems.length > 0 && pluginItems.length > 0 ? [contextMenuDivider(`${context.kind}:plugin-divider`)] : []),
    ...pluginItems,
  ]);
}

function translateContextMenuItems(items: ContextMenuItem[]): ContextMenuItem[] {
  return items.map((item) => {
    if (item.type === "divider" || item.type === "role") return item;
    return {
      ...item,
      label: t(item.label),
      submenu: item.submenu ? translateContextMenuItems(item.submenu) : item.submenu,
    };
  });
}

export function ContextMenuProvider({
  pluginRegistry,
  children,
}: {
  pluginRegistry?: PluginRegistry | null;
  children: ReactNode;
}) {
  const renderer = useRendererHost();
  const capabilities = useUiCapabilities();
  const rightClickSelectionRef = useRef<RightClickSelectionGesture | null>(null);
  const registry = pluginRegistry ?? getSharedRegistry() ?? null;
  const keybindings = useKeybindings();
  const commandBarAccelerator = menuAcceleratorFor(keybindings, "command-bar");
  const nativeSupported = capabilities.nativeContextMenu === true && typeof renderer.showContextMenu === "function";

  const handleActionError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    registry?.notify({ body: message || "Context menu action failed.", type: "error" });
  }, [registry]);

  const showContextMenu = useCallback<ContextMenuController["showContextMenu"]>(async (context, localItems, event) => {
    if (!nativeSupported || !renderer.showContextMenu) return false;

    const items = withPluginContextMenuItems(context, localItems, registry);
    if (!hasRunnableContextMenuItem(items)) return false;

    event?.preventDefault?.();
    event?.stopPropagation?.();
    return renderer.showContextMenu(withSafeActions(translateContextMenuItems(items), handleActionError));
  }, [handleActionError, nativeSupported, registry, renderer]);

  useEffect(() => {
    if (!nativeSupported || typeof document === "undefined") return;
    const handleDocumentRightClickStart = (event: MouseEvent | PointerEvent) => {
      if (event.button !== 2) return;
      const target = elementTarget(event.target);
      if (target?.closest(EDITABLE_SELECTOR)) {
        rightClickSelectionRef.current = null;
        return;
      }

      const now = Date.now();
      if (!rightClickSelectionRef.current || now - rightClickSelectionRef.current.startedAt > 500) {
        rightClickSelectionRef.current = {
          selectedBefore: selectionText(),
          startedAt: now,
        };
      }
      event.preventDefault();
    };
    const handleDocumentSelectStart = (event: Event) => {
      if (!rightClickSelectionRef.current) return;
      const target = elementTarget(event.target);
      if (target?.closest(EDITABLE_SELECTOR)) return;
      event.preventDefault();
    };
    const handleDocumentContextMenu = (event: MouseEvent) => {
      const target = elementTarget(event.target);
      if (target?.closest(EDITABLE_SELECTOR)) return;
      const gesture = rightClickSelectionRef.current;
      let selected = selectionText();
      const browserCreatedSelection = !!gesture && !gesture.selectedBefore && !!selected;
      if (browserCreatedSelection) {
        clearBrowserSelection();
        selected = "";
      }
      globalThis.setTimeout(() => {
        if (rightClickSelectionRef.current === gesture) {
          rightClickSelectionRef.current = null;
        }
      }, 0);
      if (target?.closest(MENU_SURFACE_SELECTOR)) return;
      if (!selected) {
        void showContextMenu(
          { kind: "app" },
          appContextMenuItems(registry, commandBarAccelerator),
          event,
        );
        return;
      }
      void showContextMenu(
        { kind: "selected-text", text: selected },
        selectedTextMenuItems(selected, registry, renderer.copyText.bind(renderer)),
        event,
      );
    };
    document.addEventListener("pointerdown", handleDocumentRightClickStart, true);
    document.addEventListener("mousedown", handleDocumentRightClickStart, true);
    document.addEventListener("selectstart", handleDocumentSelectStart, true);
    document.addEventListener("contextmenu", handleDocumentContextMenu, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentRightClickStart, true);
      document.removeEventListener("mousedown", handleDocumentRightClickStart, true);
      document.removeEventListener("selectstart", handleDocumentSelectStart, true);
      document.removeEventListener("contextmenu", handleDocumentContextMenu, true);
    };
  }, [commandBarAccelerator, nativeSupported, registry, renderer, showContextMenu]);

  const value = useMemo(() => ({ showContextMenu }), [showContextMenu]);
  return (
    <ContextMenuControllerContext value={value}>
      {children}
    </ContextMenuControllerContext>
  );
}

export function useContextMenu(): ContextMenuController {
  const context = useContext(ContextMenuControllerContext);
  if (!context) {
    return noopContextMenuController;
  }
  return context;
}
