import { useEffect, useRef, useState, type Dispatch } from "react";
import { useShortcut } from "../react/input";
import { useNativeRenderer, useRendererHost, useUiHost } from "../ui";
import { useDialogState } from "../ui/dialog";
import { useToastHost } from "../ui/toast";
import type { PluginRegistry } from "../plugins/registry";
import type { AppAction, AppState } from "../state/app/context";

import { getVisiblePaneCycleOrder } from "../components/layout/pane/cycle-order";
import { createOneShots } from "../utils/one-shot";
import { isMoveDownShortcut, isMoveUpShortcut } from "../components/command-bar/keyboard-handlers";
import { copyActiveSelection, isCopyShortcut, isPasteShortcut, pasteSystemClipboard } from "../utils/selection-clipboard";
import { describeKeybindingIssue, getDefaultKeybindings, matchKeybinding, matchesKeyChord, resolvePluginShortcutChords, type ResolvedKeybindings } from "./keybindings";

/** Long enough to read a few conflicts and choose Review. */
const KEYBINDING_NOTICE_DURATION_MS = 15_000;

/**
 * Tells the user once per launch when `config.json` holds a binding that does
 * not parse, names no action, or lands on a key another action already has.
 * Silence would read as "I set it and nothing happened".
 */
function useKeybindingIssueNotice(
  keybindings: ResolvedKeybindings,
  pluginRegistry: PluginRegistry,
  initialized: boolean,
) {
  const noticedRef = useRef<string | null>(null);
  const issueKey = keybindings.issues.map(describeKeybindingIssue).join("\n");
  useEffect(() => {
    if (!initialized || !issueKey || noticedRef.current === issueKey) return;
    noticedRef.current = issueKey;
    const lines = keybindings.issues.map(describeKeybindingIssue);
    const shown = lines.slice(0, 3);
    const more = lines.length - shown.length;
    pluginRegistry.notify({
      body: [
        "Keybindings need attention:",
        ...shown,
        ...(more > 0 ? [`and ${more} more.`] : []),
      ].join("\n"),
      type: "error",
      duration: KEYBINDING_NOTICE_DURATION_MS,

    });
  }, [initialized, issueKey, keybindings.issues, pluginRegistry]);
}

export function useAppGlobalShortcuts({
  dispatch,
  isDetachedWindow,
  keybindings = getDefaultKeybindings(),
  pluginRegistry,
  state,
}: {
  dispatch: Dispatch<AppAction>;
  isDetachedWindow: boolean;
  /** The resolved table; the app resolves it once and shares it with the shell. */
  keybindings?: ResolvedKeybindings;
  pluginRegistry: PluginRegistry;
  /** Applies a downloaded desktop update and relaunches. Runs only on the user's key press. */
  state: AppState;
}) {
  const dialogOpen = useDialogState((s) => s.isOpen);
  const nativeRenderer = useNativeRenderer();
  const rendererHost = useRendererHost();
  const uiKind = useUiHost().kind;
  const toastHost = useToastHost();
  useKeybindingIssueNotice(keybindings, pluginRegistry, state.initialized);
  // Every action here runs once per press: a held key, or a terminal that does
  // not say it is a repeat, must not run it again. Only moving focus between
  // panes (Tab) and switching layouts by number (idempotent) are left to repeat.
  const [shots] = useState(createOneShots);
  const layoutRef = useRef(state.config.layout);
  layoutRef.current = state.config.layout;

  useShortcut((event) => {
    if (isCopyShortcut(event) && copyActiveSelection(nativeRenderer)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isPasteShortcut(event) && pasteSystemClipboard(nativeRenderer)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const match = matchKeybinding(keybindings, event);
    const action = match?.kind === "action" ? match.id : null;
    /**
     * Whether the action already ran for this press or hold. An action that
     * takes the key (`claims`) swallows the refused ones as well; one that
     * leaves it to the pane (R) does not, so a pane's own key keeps working.
     */
    const ranAlready = (id: string, claims = true): boolean => {
      const shot = shots.get(id);
      if (shot.refuses(event)) {
        if (claims) {
          event.preventDefault();
          event.stopPropagation();
        }
        return true;
      }
      shot.end();
      return false;
    };

    // Terminals send Ctrl; the browser and the desktop webview send Cmd on
    // macOS, which the OpenTUI host also reports as `super` under the kitty
    // protocol. While a dialog, the command bar or an editable field owns the
    // keyboard the digit must not move layouts, but it still has to be
    // swallowed there or the webview hands Cmd-digit to the browser's own tab
    // switcher.
    if (!isDetachedWindow && action === "switch-layout" && match?.kind === "action" && match.digit !== null) {
      const layouts = state.config.layouts ?? [];
      const idx = match.digit - 1;
      const uiOwnsKeyboard = dialogOpen || state.commandBarOpen || event.targetEditable === true;
      if (!uiOwnsKeyboard && idx < layouts.length && idx !== state.config.activeLayoutIndex) {
        dispatch({ type: "SWITCH_LAYOUT", index: idx });
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Toasts float above everything, so their keys work over a dialog too.
    // The status bar's star line answers the same keys once no toast does,
    // but only over the workspace itself.
    if (action === "notification-action" || action === "notification-dismiss") {
      if (ranAlready(action)) return;
      const toastHandled = action === "notification-action"
        ? toastHost.activateNewest?.() === true
        : toastHost.dismissNewest?.() === true;
      const handled = toastHandled;
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // Text fields keep Cmd+Z. Everywhere else it restores the previous layout.
    // A detached window has no layout history of its own.
    if (action === "layout-undo" || action === "layout-redo") {
      if (isDetachedWindow || dialogOpen || state.commandBarOpen || state.inputCaptured || event.targetEditable === true) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: action === "layout-undo" ? "UNDO_LAYOUT" : "REDO_LAYOUT" });
      return;
    }

    if (dialogOpen) return;

    if (!isDetachedWindow && action === "command-bar") {
      // Ctrl+P and Ctrl+N move the open bar's selection, so a bar chord that
      // is one of them only opens it; Esc and the bar's other chords close it.
      if (state.commandBarOpen && (isMoveUpShortcut(event) || isMoveDownShortcut(event))) return;
      if (ranAlready(action)) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "TOGGLE_COMMAND_BAR" });
      return;
    }
    if (state.commandBarOpen) return;

    if (action === "focus-next-pane" || action === "focus-prev-pane") {
      const paneOrder = getVisiblePaneCycleOrder(
        state.config.layout,
        pluginRegistry,
        state.config.disabledPlugins,
      );
      if (paneOrder.length === 0) return;

      dispatch({ type: action === "focus-prev-pane" ? "FOCUS_PREV" : "FOCUS_NEXT", paneOrder });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (match?.kind === "command" && !isDetachedWindow) {
      // Control chords belong to the editor while text is being typed; Alt,
      // Command and function keys are never text, so they still fire.
      const editing = state.inputCaptured || event.targetEditable === true;
      if (editing && event.ctrl && !(event.meta || event.super)) return;
      if (ranAlready(`command:${match.command.query}`)) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({
        type: "SET_COMMAND_BAR",
        open: true,
        query: match.command.query,
        launch: { kind: "run-query", query: match.command.query },
      });
      return;
    }

    if (state.inputCaptured) return;

    if (!isDetachedWindow && action === "quit") {
      if (ranAlready(action, false)) return;
      if (uiKind === "opentui") rendererHost.requestExit();
    } else if (!action) {
      const disabledPlugins = new Set(state.config.disabledPlugins || []);
      const keybindingsConfig = state.config.keybindings;
      for (const shortcut of pluginRegistry.shortcuts.values()) {
        const ownerId = pluginRegistry.getShortcutPluginId(shortcut.id);
        if (ownerId && disabledPlugins.has(ownerId)) continue;
        const chords = resolvePluginShortcutChords(keybindingsConfig, shortcut);
        if (chords.some((chord) => matchesKeyChord(chord, event))) {
          if (ranAlready(`plugin:${shortcut.id}`, false)) return;
          shortcut.execute();
          break;
        }
      }
    }
  }, { phase: "before" });
}
