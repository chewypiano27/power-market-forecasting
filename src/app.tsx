import { Box, ContextMenuProvider, useNativeRenderer, useRendererHost, useUiHost } from "./ui";
import { ToastViewport, useToastHost } from "./ui/toast";
import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { AppProvider, useAppDispatch, useAppSelector, useAppStateRef, type AppState } from "./state/app/context";
import { bindAppActivity, useAppActive } from "./state/app/activity";
import { Header } from "./components/layout/header";
import { StatusBar } from "./components/layout/status-bar";
import { useAppChromeShown } from "./components/layout/presentation";
import { Shell } from "./components/layout/shell";
import { DetachedPaneShell } from "./components/layout/detached-pane-shell";
import { TransientLayoutProvider } from "./components/layout/transient-layout";
import { CommandBar } from "./components/command-bar/surface";
import { useDialog } from "./ui/dialog";
import { PluginRegistry } from "./plugins/registry";
import type { LoadedExternalPlugin } from "./plugins/loader";
import type { AppServicesFactory } from "./core/app-service-ports";
import { useThemeColors } from "./theme/theme-context";
import type { AppConfig } from "./types/config";
import type { DesktopDeepLinkBridge } from "./types/desktop-deeplink";
import type { WorkstationPlugin } from "./types/plugin";

import type { DesktopDockPreviewState, DesktopSharedStateSnapshot, DesktopThemePreviewState, DesktopWindowBridge } from "./types/desktop-window";
import type { DesktopApplicationMenuBridge } from "./types/desktop-menu";
import type { LayoutBounds } from "./layout/pane-manager";
import type { AppSessionSnapshot } from "./core/state/session-persistence";

import { createAppNotifier } from "./notifications/app-notifier";
import { attachNotificationLog } from "./notifications/notification-log";
import { useDesktopApplicationMenuRuntime } from "./app/runtime/desktop-menu";
import { useAppGlobalShortcuts } from "./app/global-shortcuts";
import { AppDialogBridge } from "./app/dialog-bridge";
import { KeybindingsProvider, useResolvedKeybindings } from "./app/keybindings";
import { useAppPaneRuntime } from "./app/pane-runtime";
import { bindPluginRegistryRuntimeAccess } from "./app/runtime/plugin-bindings";
import { useAppStartupRuntime } from "./app/runtime/startup";
import { RemoteUiRegistryProvider } from "./remote/semantic-tree";
import { resolveAppSessionSnapshot, resolveInitialAppConfig } from "./app/app-bootstrap-state";
import { scheduleConfigSave } from "./state/config-save-scheduler";
import { LOW_PRIORITY_CONFIG_SAVE_DEBOUNCE_MS } from "./state/persist-scheduler";
import { savedLayoutsDifferOnlyInMirror } from "./core/state/app/layout";
import { measurePerf } from "./utils/perf-marks";
import { useAppLanguage } from "./i18n/react";
import { AppLanguageConfigObserver } from "./app/language-observer";

const EMPTY_EXTERNAL_PLUGINS: LoadedExternalPlugin[] = [];

interface AppInnerProps {
  externalPlugins: readonly LoadedExternalPlugin[];
  pluginRegistry: PluginRegistry;

  sessionSnapshot?: AppSessionSnapshot | null;
  desktopWindowBridge?: DesktopWindowBridge;
  desktopApplicationMenuBridge?: DesktopApplicationMenuBridge;
  desktopDeepLinkBridge?: DesktopDeepLinkBridge;
  /** Hosted browser terminal: nothing is reachable until a session exists. */
  /** Fires once the startup state is in place and the first real layout can paint. */
  onInitialized?: () => void;
  /** Settles once every plugin has registered, setup included. */
  pluginsReady?: Promise<unknown>;
}

function ThemedAppRoot({ children }: { children: ReactNode }) {
  const themeColors = useThemeColors();
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      flexBasis={0}
      minWidth={0}
      minHeight={0}
      overflow="hidden"
      backgroundColor={themeColors.bg}
    >
      {children}
    </Box>
  );
}

function AppInner({
  externalPlugins,
  pluginRegistry,

  sessionSnapshot = null,
  desktopWindowBridge,
  desktopApplicationMenuBridge,
  desktopDeepLinkBridge,
  onInitialized,
  pluginsReady,
}: AppInnerProps) {
  const dispatch = useAppDispatch();
  const stateRef = useAppStateRef();
  const config = useAppSelector((state) => state.config);
  const tickers = useAppSelector((state) => state.tickers);
  const paneState = useAppSelector((state) => state.paneState);
  const focusedPaneId = useAppSelector((state) => state.focusedPaneId);
  const initialized = useAppSelector((state) => state.initialized);
  const onInitializedRef = useRef(onInitialized);
  onInitializedRef.current = onInitialized;
  useEffect(() => {
    if (initialized) onInitializedRef.current?.();
  }, [initialized]);
  const commandBarOpen = useAppSelector((state) => state.commandBarOpen);
  const inputCaptured = useAppSelector((state) => state.inputCaptured);
  const state = useMemo(() => ({
    ...stateRef.current,
    config,
    tickers,
    paneState,
    focusedPaneId,
    initialized,
    commandBarOpen,
    inputCaptured,
  }) as AppState, [
    commandBarOpen,
    config,
    focusedPaneId,
    initialized,
    inputCaptured,
    paneState,
    stateRef,
    tickers,
  ]);
  const appActive = useAppActive();
  const appActiveRef = useRef(appActive);
  const rendererHost = useRendererHost();
  const dialog = useDialog();
  const toast = useToastHost();
  const isDetachedWindow = desktopWindowBridge?.kind === "detached";
  const detachedPaneId = isDetachedWindow ? desktopWindowBridge.paneId ?? null : null;
  const focusDetachedPane = useMemo(() => {
    const focus = desktopWindowBridge?.kind === "main" ? desktopWindowBridge.focusDetachedPane : undefined;
    return focus ? (paneId: string) => { void focus(paneId).catch(() => {}); } : undefined;
  }, [desktopWindowBridge]);
  const [desktopDockPreview, setDesktopDockPreview] = useState<DesktopDockPreviewState | null>(null);
  const [commandBarNativeOccluder, setCommandBarNativeOccluder] = useState<LayoutBounds | null>(null);
  appActiveRef.current = appActive;
  const appNotifier = useMemo(() => createAppNotifier({
    isAppActive: () => appActiveRef.current,
    renderToast: (notification) => {
      const type = notification.type ?? "info";
      let toastId: string | number | undefined;
      const dismissAfter = (run: () => void) => () => {
        try {
          run();
        } finally {
          if (toastId != null) toast.dismiss(toastId);
        }
      };
      const options = {
        title: notification.title,
        subtitle: notification.subtitle,
        duration: notification.persistent ? 0 : notification.duration,
        action: notification.action
          ? {
            label: notification.action.label,
            onClick: dismissAfter(() => notification.action?.onClick()),
          }
          : undefined,
        secondaryAction: notification.secondaryAction
          ? {
            label: notification.secondaryAction.label,
            onClick: dismissAfter(() => notification.secondaryAction?.onClick()),
          }
          : undefined,
      };
      if (type === "success") toastId = toast.success(notification.body, options);
      else if (type === "error") toastId = toast.error(notification.body, options);
      else toastId = toast.info(notification.body, options);
    },
    desktop: rendererHost.supportsNativeDesktopNotifications ? rendererHost : undefined,
  }), [rendererHost, toast]);
  const notify = useCallback((body: string, options?: { type?: "info" | "success" | "error" }) => {
    pluginRegistry.notify({ body, ...options });
  }, [pluginRegistry]);

  useEffect(() => {
    if (desktopWindowBridge?.kind !== "main" || !desktopWindowBridge.subscribeDockPreview) return;
    return desktopWindowBridge.subscribeDockPreview((preview) => {
      setDesktopDockPreview(preview);
    });
  }, [desktopWindowBridge]);

  useDesktopApplicationMenuRuntime({
    desktopApplicationMenuBridge,
    desktopWindowKind: desktopWindowBridge?.kind,
    dispatch,
    pluginRegistry,
    rendererHost,
    stateRef,
  });

  useAppStartupRuntime({ dispatch, initialized: state.initialized, pluginsReady });

  bindPluginRegistryRuntimeAccess({ dispatch, pluginRegistry, stateRef });

  const persistConfig = useCallback((nextConfig: AppState["config"]) => {
    scheduleConfigSave(nextConfig);
  }, []);

  useAppPaneRuntime({

    detachedPaneId,
    dialog,
    dispatch,
    externalPlugins,
    focusDetachedPane,
    isDetachedWindow,
    notify,
    persistConfig,
    pluginRegistry,
    state,
    stateRef,

  });

  // Wire up app-level notifications.
  pluginRegistry.bindHost({ notify: appNotifier.notify });
  // Missed alerts live in this device's state store. A detached window keeps
  // its own in memory rather than overwrite the main window's.
  useEffect(() => (
    isDetachedWindow ? undefined : attachNotificationLog(pluginRegistry.persistence.pluginState)
  ), [isDetachedWindow, pluginRegistry]);

  // Persist layout changes (switching, saving, deleting, renaming layouts).
  // The saved layouts also mirror live pane state and focus, so they change on
  // every cursor move; those updates are written on the low-priority delay
  // rather than paying a full config serialization per keystroke.
  const prevLayouts = useRef(state.config.layouts);
  useEffect(() => {
    if (state.config.layouts === prevLayouts.current) return;
    const mirrorOnly = savedLayoutsDifferOnlyInMirror(prevLayouts.current, state.config.layouts);
    prevLayouts.current = state.config.layouts;
    scheduleConfigSave(
      () => stateRef.current.config,
      mirrorOnly ? { delayMs: LOW_PRIORITY_CONFIG_SAVE_DEBOUNCE_MS } : {},
    );
  }, [state.config.layouts, state.config, stateRef]);

  const chrome = useAppChromeShown();
  const keybindingHost = useUiHost().kind === "opentui" ? "terminal" : "desktop";
  const keybindings = useResolvedKeybindings(state.config.keybindings, keybindingHost);
  useAppGlobalShortcuts({
    dispatch,
    isDetachedWindow,
    keybindings,
    pluginRegistry,
    state,
  });

  if (desktopWindowBridge?.kind === "detached" && desktopWindowBridge.paneId) {
    return (
      <KeybindingsProvider value={keybindings}>
        <AppDialogBridge />
        <ContextMenuProvider pluginRegistry={pluginRegistry}>

            <ThemedAppRoot>
              <DetachedPaneShell
                pluginRegistry={pluginRegistry}
                desktopWindowBridge={{ ...desktopWindowBridge, kind: "detached", paneId: desktopWindowBridge.paneId }}
              />
              <ToastViewport position="bottom-right" />
            </ThemedAppRoot>

        </ContextMenuProvider>
      </KeybindingsProvider>
    );
  }

  return (
    <KeybindingsProvider value={keybindings}>
    <AppDialogBridge />
    <ContextMenuProvider pluginRegistry={pluginRegistry}>

        <ThemedAppRoot>
          {chrome.header && (
            <Header />
          )}
          <TransientLayoutProvider>
            <Shell
              pluginRegistry={pluginRegistry}

              desktopWindowBridge={desktopWindowBridge}
              desktopDockPreview={desktopDockPreview}
              commandBarNativeOccluder={commandBarNativeOccluder}
            />
            <StatusBar
              onOpenChangelog={(version) => {
                void pluginRegistry.createPaneFromTemplateAsync("changelog-pane", {
                  values: { version },
                }).catch(() => {});
              }}
            />
          </TransientLayoutProvider>
          {state.commandBarOpen && (
            <CommandBar

              pluginRegistry={pluginRegistry}
              quitApp={() => rendererHost.requestExit()}
              onNativeOccluderChange={setCommandBarNativeOccluder}
            />
          )}
          <ToastViewport position="bottom-right" />
        </ThemedAppRoot>

    </ContextMenuProvider>
    </KeybindingsProvider>
  );
}

interface AppProps {
  config: AppConfig;
  servicesFactory: AppServicesFactory;
  externalPlugins?: LoadedExternalPlugin[];
  plugins: readonly WorkstationPlugin[];
  desktopWindowBridge?: DesktopWindowBridge;
  desktopApplicationMenuBridge?: DesktopApplicationMenuBridge;
  desktopDeepLinkBridge?: DesktopDeepLinkBridge;
  desktopSnapshot?: DesktopSharedStateSnapshot | null;
  desktopThemePreview?: DesktopThemePreviewState | null;
  /**
   * Requires a Workstation Cloud session before the app is usable. The hosted browser
   * terminal sets this; desktop and the TUI keep sign-in optional.
   */
  /** Fires once the startup state is in place and the first real layout can paint. */
  onInitialized?: () => void;
}

export function App({
  config: initialConfig,
  servicesFactory,
  externalPlugins: providedExternalPlugins,
  plugins,
  desktopWindowBridge,
  desktopApplicationMenuBridge,
  desktopDeepLinkBridge,
  desktopSnapshot = null,
  desktopThemePreview = null,
  onInitialized,
}: AppProps) {
  useAppLanguage();
  const externalPlugins = providedExternalPlugins ?? EMPTY_EXTERNAL_PLUGINS;
  const renderer = useNativeRenderer();
  const effectiveInitialConfig = useMemo(() => {
    return resolveInitialAppConfig({
      initialConfig,
      desktopSnapshot,
      hasDesktopWindowBridge: !!desktopWindowBridge,
    });
  }, [desktopSnapshot, desktopWindowBridge, initialConfig]);
  const [config] = useState(() => effectiveInitialConfig);

  useEffect(() => bindAppActivity(renderer), [renderer]);

  const services = useMemo(() => {
    return measurePerf("startup.app.create-services", () => (
      servicesFactory({
        config,
        plugins,
        externalPlugins,
      })
    ), {
      externalPluginCount: externalPlugins.length,
      disabledPluginCount: config.disabledPlugins.length,
    });
  }, [config.dataDir, externalPlugins, plugins, servicesFactory]);

  useEffect(() => {
    return () => services.destroy();
  }, [services]);

  const sessionSnapshot = useMemo(() => {
    return resolveAppSessionSnapshot({
      config,
      desktopSnapshot,
      desktopWindowKind: desktopWindowBridge?.kind,
      sessionStore: services.persistence.sessions,
    });
  }, [config, desktopSnapshot, desktopWindowBridge?.kind, services.persistence.sessions]);

  return (
    <RemoteUiRegistryProvider>
      <AppProvider
        config={config}
        sessionStore={desktopWindowBridge?.kind === "detached" ? undefined : services.persistence.sessions}
        sessionSnapshot={sessionSnapshot}
        desktopBridge={desktopWindowBridge}
        desktopSnapshot={desktopSnapshot}
        initialThemePreview={desktopThemePreview}
      >
        <AppLanguageConfigObserver />
        <AppInner
          externalPlugins={externalPlugins}
          pluginRegistry={services.pluginRegistry}

          sessionSnapshot={sessionSnapshot}
          desktopWindowBridge={desktopWindowBridge}
          desktopApplicationMenuBridge={desktopApplicationMenuBridge}
          desktopDeepLinkBridge={desktopDeepLinkBridge}
          onInitialized={onInitialized}
          pluginsReady={services.ready}
        />
      </AppProvider>
    </RemoteUiRegistryProvider>
  );
}
