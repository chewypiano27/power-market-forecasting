import { Box, Input, Text, TextAttributes, useCommandBarShortcut, useRendererHost, useUiCapabilities, type InputRenderable } from "../../ui";
import { useCallback, useLayoutEffect, useRef } from "react";
import {
  blendHex,
  commandBarBg,
  commandBarPanelBg,
  commandBarSubtleText,
  commandBarText,
} from "../../theme/colors";
import { useThemeColors } from "../../theme/theme-context";
import { NATIVE_COMMAND_SURFACE, nativeCommandSurfaceBorder } from "../command-bar/panel/native-surface";
import {
  useCommandBarPromptBinding,
  type CommandBarPromptBinding,
} from "../command-bar/panel/prompt-binding";
import { useAppDispatch, useAppSelector } from "../../state/app/context";
import { useViewport } from "../../react/input";

import { t } from "../../i18n";
import { displayWidth, truncateToDisplayWidth } from "../../utils/format";
import { ClippedText } from "../ui/display";
import { resolveHeaderPromptGeometry } from "./shell/chrome";
import { useWindowFullscreen } from "./window-fullscreen";
import { WindowControls, WINDOWS_CONTROL_GROUP_WIDTH_PX } from "./window-controls";
import { Button } from "../ui/button";

/** Kept clear after the terminal update status, so its last character never touches the Help pill. */

/** A clipped terminal notice narrower than this is left out rather than shown as a stub. */

/** Left padding of the update status's slot, in cells; the desktop's title-bar layout also pads its right. */
const UPDATE_SLOT_PADDING_COLUMNS = 2;
/** The Help pill's own props, shared by its button and the width the update status leaves it. */
const helpButtonProps = () => ({ label: "Open Help", displayLabel: t("Help"), shortcut: "?", compact: true });
/** The terminal pads the pill's right edge by a cell; the desktop pads it in px. */
const TERMINAL_HELP_PADDING_COLUMNS = 1;

type HeaderActionEvent = {
  key?: string;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

/**
 * Chooses what the prompt can say at a given width. The descriptive label earns
 * its space before the shortcut hint does, because the prompt is what tells a
 * first-time user the command bar exists at all.
 */
function resolveHeaderPromptContent(width: number, shortcutLabel: string): {
  placeholder: string;
  shortcut: string;
} {
  const textSpace = Math.max(0, width - 2 - "> ".length);
  const full = t("Search or run a command");
  const short = t("Search");
  if (textSpace >= full.length + shortcutLabel.length + 2) return { placeholder: full, shortcut: shortcutLabel };
  if (textSpace >= full.length) return { placeholder: full, shortcut: "" };
  if (textSpace >= short.length) return { placeholder: short, shortcut: "" };
  return { placeholder: "", shortcut: "" };
}

const PROMPT_CARET = "> ";
/** Room for a pasted list of a few thousand symbols. */
const COMMAND_BAR_MAX_LENGTH = 20_000;

/**
 * The topbar's own fill in the terminal. The prompt used to be the only thing
 * wearing it, which left the bar reading as a pale input pasted onto a darker
 * strip; now the whole row carries it and the prompt paints nothing of its own.
 * Desktop has real chrome to sit on and uses the header colour directly.
 */
function headerSurface(colors: ReturnType<typeof useThemeColors>): string {
  return blendHex(colors.header, colors.bg, 0.55);
}

/**
 * Desktop chrome for the prompt. Closed it draws nothing: no fill and no edge,
 * so the caret and its placeholder sit straight on the header instead of in a
 * pale box pasted onto it. The hover fill is the whole affordance, and the
 * border stays in the box model as a transparent hairline so opening the bar
 * cannot shift the text by a pixel. Open it is the top half of the command
 * surface: same fill, same border and same shadow as the sheet, rounded only
 * where it is not touching it, and stretched to the header's full height so the
 * two meet with no gap. Both boxes take their left edge and width from
 * `resolveHeaderPromptGeometry`, so the seam is invisible rather than nearly
 * invisible.
 */
function nativePromptSurfaceStyle(colors: ReturnType<typeof useThemeColors>, open: boolean) {
  if (!open) {
    return {
      border: "1px solid transparent",
      borderRadius: "var(--power-radius-md)",
    };
  }
  const { radiusPx, shadow } = NATIVE_COMMAND_SURFACE;
  return {
    alignSelf: "stretch",
    height: "100%",
    border: `1px solid ${nativeCommandSurfaceBorder(colors)}`,
    borderBottomWidth: 0,
    borderRadius: `${radiusPx}px ${radiusPx}px 0 0`,
    boxShadow: shadow,
  };
}

/**
 * How fast the closed desktop prompt takes the bar's spare room next to the
 * update slot, which grows by one millionth as much: only empty space, if any.
 */
const NATIVE_PROMPT_GROW = 1_000_000;
/** How much faster the desktop update slot shrinks than an open prompt: it gives all of its room first. */
const NATIVE_UPDATE_SLOT_SHRINK = 1_000_000;
/**
 * How the desktop prompt sits in the bar. Closed it draws no box, so it claims
 * only its caret and placeholder, then grows toward `width` (the command
 * sheet's) from the room the update status leaves, showing its key hint once it
 * has room for it; Help and the market cluster never give any. Open it is the
 * top of the sheet and keeps the sheet's width: the update status gives all of
 * its room first (NATIVE_UPDATE_SLOT_SHRINK), and only a window too narrow for
 * Help and the market cluster beside the open prompt takes from it.
 */
function nativePromptFit(width: number, open: boolean) {
  return open
    ? { width, flexShrink: 1, minWidth: 0, overflow: "hidden" as const }
    : { flexBasis: 0, flexGrow: NATIVE_PROMPT_GROW, flexShrink: 0, minWidth: "min-content", maxWidth: width };
}

/**
 * The command bar's input while the bar is open. Vic1's panes are driven
 * by bare single keys, so the input only exists while the bar is open; the idle
 * prompt is an affordance that never takes keyboard focus.
 */
function HeaderPromptInput({
  binding,
  nativePaneChrome,
  width,
}: {
  binding: CommandBarPromptBinding;
  nativePaneChrome: boolean;
  width: number;
}) {
  const colors = useThemeColors();
  const inputRef = useRef<InputRenderable | null>(null);
  const { ghostSuffix, onQueryChange, placeholder, query, screenKey } = binding;
  const textColor = commandBarText(colors);
  const subtleColor = commandBarSubtleText(colors);

  // The buffer is the source of truth while typing; only an outside change,
  // such as Ctrl+U or a popped route restoring its query, has to be written back.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || input.editBuffer.getText() === query) return;
    input.editBuffer.setText?.(query);
    input.setCursorOffset?.(query.length);
  }, [query, screenKey]);

  const ghostLeft = Math.max(0, Math.min(query.length, width - 1));
  return (
    <Box width={width} height={1} position="relative" style={nativePaneChrome ? undefined : { overflow: "hidden" }}>
      <Input
        key={screenKey}
        ref={inputRef}
        value={query}
        onInput={onQueryChange}
        placeholder={placeholder}
        focused
        // A pasted list of symbols is one line of them, and may run past the field's stock thousand characters.
        joinPastedLines
        maxLength={COMMAND_BAR_MAX_LENGTH}
        data-power-remote-scope="command-bar"
        data-power-remote-surface="command-bar"
        width={nativePaneChrome ? "100%" : width}
        backgroundColor="transparent"
        focusedBackgroundColor="transparent"
        textColor={textColor}
        focusedTextColor={textColor}
        placeholderColor={subtleColor}
        cursorColor={colors.textBright}
      />
      {ghostSuffix && (nativePaneChrome ? (
        // The desktop sets the suggestion right after the typed text, one
        // character per `ch` of the field's font, and cuts it where the field ends.
        <Box position="absolute" top={0} height={1} flexDirection="row" style={{ left: `${displayWidth(query)}ch`, right: 0 }}>
          <ClippedText fg={subtleColor} text={ghostSuffix} width={0} />
        </Box>
      ) : (
        <Box position="absolute" top={0} left={ghostLeft} width={Math.max(0, width - ghostLeft)} height={1}>
          <Text fg={subtleColor}>{truncateToDisplayWidth(ghostSuffix, Math.max(0, width - ghostLeft))}</Text>
        </Box>
      ))}
    </Box>
  );
}

function HeaderCommandPrompt({
  nativePaneChrome,
  onOpen,
  open,
  shortcutLabel,
  width,
}: {
  nativePaneChrome: boolean;
  onOpen: (event?: HeaderActionEvent) => void;
  open: boolean;
  shortcutLabel: string;
  width: number;
}) {
  const colors = useThemeColors();
  const binding = useCommandBarPromptBinding();
  const { placeholder, shortcut } = resolveHeaderPromptContent(width, shortcutLabel);
  const idleBg = headerSurface(colors);
  // Open, the prompt takes the sheet's own surface so the two read as one
  // control: the sheet is the prompt, expanded. Closed it fills nothing on
  // either host; the terminal row is already this colour end to end, and on
  // desktop the header is.
  const backgroundColor = open
    ? (nativePaneChrome ? commandBarPanelBg(colors) : commandBarBg(colors))
    : undefined;
  // The desktop takes the theme's text roles; the terminal mixes from the header's own colours.
  const caretColor = open
    ? commandBarText(colors)
    : nativePaneChrome ? colors.text : blendHex(colors.headerText, colors.header, 0.15);
  const mutedColor = nativePaneChrome ? colors.textDim : blendHex(colors.headerText, colors.header, 0.42);
  // Dimmer than the placeholder it trails: the label is what names the control,
  // the binding is a footnote to it.
  const shortcutColor = nativePaneChrome ? colors.textMuted : blendHex(colors.headerText, colors.header, 0.62);
  // Desktop hover lifts the prompt off the header itself, which is the only
  // thing telling the pointer this text is a control. The terminal has no
  // chrome, so it lifts off the strip fill the whole row already wears.
  const hoverBg = nativePaneChrome
    ? "var(--power-hover-fill)"
    : blendHex(idleBg, colors.headerText, 0.16);
  const inputWidth = Math.max(1, width - 2 - PROMPT_CARET.length);

  return (
    <Box
      {...(nativePaneChrome ? nativePromptFit(width, open) : { width })}
      height={1}
      flexDirection="row"
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={backgroundColor}
      hoverBackgroundColor={open ? undefined : hoverBg}
      data-power-role="header-command-prompt"
      data-power-interactive={open ? undefined : "true"}
      role={open ? undefined : "button"}
      tabIndex={open ? undefined : 0}
      aria-label={t("Search or run a command")}
      aria-keyshortcuts={shortcutLabel}
      onMouseDown={open ? undefined : onOpen}
      onKeyDown={open ? undefined : (event: HeaderActionEvent) => {
        if (event.key === "Enter" || event.key === " ") onOpen(event);
      }}
      style={{
        cursor: open ? undefined : "pointer",
        ...(nativePaneChrome ? nativePromptSurfaceStyle(colors, open) : {}),
      }}
    >
      <Text fg={caretColor} attributes={TextAttributes.BOLD}>{PROMPT_CARET}</Text>
      {open ? (
        binding ? <HeaderPromptInput binding={binding} nativePaneChrome={nativePaneChrome} width={inputWidth} /> : null
      ) : nativePaneChrome ? (
        // One line that wraps and hides its second: the key hint drops whole when the
        // prompt is too narrow for it, and the placeholder never does.
        <Box
          flexDirection="row"
          height={1}
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          overflow="hidden"
          style={{ flexWrap: "wrap", alignContent: "flex-start" }}
        >
          <Text fg={mutedColor}>{placeholder}</Text>
          {shortcut ? <Text fg={shortcutColor}>{`  ${shortcut}`}</Text> : null}
        </Box>
      ) : (
        <>
          <Text fg={mutedColor}>{placeholder}</Text>
          {shortcut ? <Text fg={shortcutColor}>{`  ${shortcut}`}</Text> : null}
          <Box flexGrow={1} minWidth={0} />
        </>
      )}
    </Box>
  );
}

/**
 * Market state, SPY and the base currency at the header's right edge. It fits
 * itself into the columns the prompt geometry reserved rather than into
 * whatever this row has left over, so the cluster and the prompt can never
 * both claim the same space.
 */
function HeaderMarketSummary({ nativePaneChrome, width }: { nativePaneChrome: boolean; width: number }) {
  const colors = useThemeColors();
  return (
    <>
      {width >= 5 ? (
        <Box paddingRight={1} flexShrink={0} data-power-role="header-market">
          <Text fg={colors.warning} {...(nativePaneChrome ? { attributes: TextAttributes.BOLD } : {})}>VIC1</Text>
        </Box>
      ) : null}
      {width >= 14 ? (
        <Box paddingRight={1} flexShrink={0} data-power-role="header-market">
          <Text fg={colors.textDim}>NEM</Text>
        </Box>
      ) : null}
    </>
  );
}

/**
 * Help, one click away on every renderer: the same pane the typed HELP and the
 * `?` key open. It takes its columns from the update status beside it, which
 * is transient, rather than from the market cluster; on the desktop and the
 * web the closed prompt's empty room makes way for it as well.
 */
function HeaderHelpButton({ nativePaneChrome, onPress }: { nativePaneChrome: boolean; onPress: () => void }) {
  return (
    <Box
      flexShrink={0}
      paddingRight={nativePaneChrome ? undefined : TERMINAL_HELP_PADDING_COLUMNS}
      data-power-role="header-help-action"
      style={nativePaneChrome ? { marginRight: 8 } : undefined}
    >
      <Button {...helpButtonProps()} onPress={onPress} stopPropagation />
    </Box>
  );
}

export function Header({
  onOpenHelp,
}: {
  onOpenHelp?: () => void;
  /** Applies a downloaded desktop update and relaunches; the header offers Restart only when it is given. */
}) {
  const colors = useThemeColors();
  const rendererHost = useRendererHost();
  const dispatch = useAppDispatch();
  const commandBarOpen = useAppSelector((state) => state.commandBarOpen);
  const { width: termWidth } = useViewport();
  const { nativePaneChrome = false, titleBarOverlay, nativeWindowChrome = titleBarOverlay, windowControls } = useUiCapabilities();
  const showWindowControls = nativeWindowChrome && windowControls === "windows";
  const windowFullscreen = useWindowFullscreen();
  const prompt = resolveHeaderPromptGeometry({
    nativePaneChrome,
    nativeWindowChrome,
    termWidth,
    titleBarOverlay,
    windowFullscreen,
    allowMarketExpansion: true,
  });
  const shortcutLabel = useCommandBarShortcut();
  const promptWidth = prompt.width;
  const terminalSlotPadding = UPDATE_SLOT_PADDING_COLUMNS;
  // Desktop has its own window chrome to sit on; the terminal has none, so the
  // bar itself wears the prompt's fill and reads as a single strip.
  const headerBg = nativePaneChrome ? colors.header : headerSurface(colors);

  const startWindowDrag = useCallback(() => {
    if (!titleBarOverlay || !nativeWindowChrome) return;
    void rendererHost.startWindowDrag?.();
  }, [nativeWindowChrome, rendererHost, titleBarOverlay]);

  const openCommandBar = useCallback((event?: HeaderActionEvent) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    dispatch({ type: "SET_COMMAND_BAR", open: true, query: "" });
  }, [dispatch]);

  const commandPrompt = (
    <HeaderCommandPrompt
      nativePaneChrome={nativePaneChrome}
      onOpen={openCommandBar}
      open={commandBarOpen}
      shortcutLabel={shortcutLabel}
      width={promptWidth}
    />
  );
  const marketSummary = prompt.marketColumns > 0
    ? <HeaderMarketSummary nativePaneChrome={nativePaneChrome} width={prompt.marketColumns} />
    : null;
  // The desktop and the web fit the update status in CSS (NativeUpdateStatus):
  // its slot takes the room the closed prompt leaves, clips at its own edge, and
  // gives all of it up before an open prompt gives any. Help, the market
  // cluster and the caption buttons keep their size.
  const nativeUpdateSlot = nativePaneChrome ? (
    <Box
      flexDirection="row"
      alignItems="center"
      flexGrow={1}
      flexShrink={NATIVE_UPDATE_SLOT_SHRINK}
      minWidth={0}
      overflow="hidden"
      data-power-role="header-update-status"
      style={{ alignSelf: "stretch" }}
    >
    </Box>
  ) : null;

  if (titleBarOverlay) {
    return (
      <Box
        flexDirection="row"
        height={1}
        alignItems="center"
        backgroundColor={headerBg}
        data-power-role="app-header"
        data-titlebar-overlay="true"
        onMouseDown={startWindowDrag}
        style={{
          boxShadow: `0 -1px 0 ${headerBg}, inset 0 1px 0 ${headerBg}`,
          paddingRight: showWindowControls ? 0 : 12,
          position: "relative",
        }}
      >
        <Box width={prompt.left} />
        {commandPrompt}
        {nativeUpdateSlot ?? (
          <Box flexGrow={1} paddingLeft={terminalSlotPadding} paddingRight={UPDATE_SLOT_PADDING_COLUMNS} minWidth={0}>
          </Box>
        )}
        {onOpenHelp ? <HeaderHelpButton nativePaneChrome onPress={onOpenHelp} /> : null}
        {marketSummary}
        {showWindowControls ? <Box flexShrink={0} width={`${WINDOWS_CONTROL_GROUP_WIDTH_PX}px`} /> : null}
        {showWindowControls ? <WindowControls /> : null}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="row"
      height={1}
      backgroundColor={headerBg}
      data-power-role="app-header"
      data-titlebar-overlay={titleBarOverlay ? "true" : undefined}
      onMouseDown={startWindowDrag}
    >
      <Box width={prompt.left} />
      {commandPrompt}
      {nativeUpdateSlot ?? (
        <Box flexGrow={1} minWidth={0} paddingLeft={terminalSlotPadding}>
        </Box>
      )}
      {onOpenHelp ? <HeaderHelpButton nativePaneChrome={nativePaneChrome} onPress={onOpenHelp} /> : null}
      {marketSummary}
      {showWindowControls ? <WindowControls /> : null}
    </Box>
  );
}
