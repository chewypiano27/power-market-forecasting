import { startPeakTracking } from "../../../plugins/builtin/vic-power/demand-peak-service";
/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import { App } from "../../../app";
import { applyLanguageFromConfig } from "../../../i18n";
import { uiBuiltinPlugins } from "../../../plugins/catalog-ui";
import { backendRequest, initElectrobunBackend, onBackendMessage } from "./backend-rpc";

import { installFocusScopeRelease } from "../../dom/host/focus-scope";
import { installElectrobunConfigStoreHost } from "./config-host";
import { installElectrobunHttpFetchTransport } from "./http-fetch";
import { installElectrobunWindowFullscreenTracking } from "./window-fullscreen";
import { installDomMarketDataFrames } from "../../dom/data-frames";
import { releaseBootFrameWhenDrawn, startBootFrameRecorder } from "../../dom/boot-frame";
import { DomErrorBoundary, DomHostProviders } from "../../dom/dom-host-providers";
import { DesktopFatalScreen } from "./fatal-screen";
import { resolveRendererWindowError } from "./renderer-window-error";
import { createWebUiHost, webRendererHost } from "./ui-host";
import { createDesktopWindowBridge } from "./desktop/window/bridge";
import { prepareDetachedSnapshot } from "./desktop/window/snapshot";
import { createElectrobunAppServices } from "./app-services";

const element = document.getElementById("root");
if (!element) throw new Error("Missing root element");
const rootElement = element;
rootElement.tabIndex = -1;
const root = createRoot(rootElement);
const releaseBootFrame = releaseBootFrameWhenDrawn(document, rootElement);
let appMounted = false;

function renderFatal(error: unknown, details?: string) {
  releaseBootFrame();
  root.render(<DesktopFatalScreen error={error} details={details} source="desktop-renderer" />);
}
window.__powerRenderFatalError = (error, details, source) => {
  if (resolveRendererWindowError({ error, details, source, appMounted }) !== "ignore") renderFatal(error, details);
};

async function boot() {
  installElectrobunConfigStoreHost();
  installElectrobunHttpFetchTransport();
  const init = await initElectrobunBackend();
  installFocusScopeRelease();
  installElectrobunWindowFullscreenTracking();
  installDomMarketDataFrames();
  const desktopSnapshot = init.windowKind === "detached" && init.paneId && init.desktopSnapshot
    ? prepareDetachedSnapshot(init.desktopSnapshot, init.paneId)
    : init.desktopSnapshot;
  const config = desktopSnapshot?.config ?? init.config;
  applyLanguageFromConfig(config);
  root.render(
    <DomErrorBoundary label="[desktop]" fallback={(error, details) => <DesktopFatalScreen error={error} details={details} source="desktop-renderer" />}>
      <DomHostProviders ui={createWebUiHost(init.desktopPlatform)} renderer={webRendererHost}>
        <App config={config} servicesFactory={createElectrobunAppServices} plugins={uiBuiltinPlugins}
          desktopWindowBridge={createDesktopWindowBridge(init.windowKind, init.paneId)}
          desktopApplicationMenuBridge={{ subscribe: listener => onBackendMessage("application-menu.select", ({ command }) => listener(command)) }}
          desktopSnapshot={desktopSnapshot} desktopThemePreview={init.desktopThemePreview} />
      </DomHostProviders>
    </DomErrorBoundary>,
  );
  appMounted = true;
  window.setTimeout(releaseBootFrame, 4_000);
  if (init.windowKind === "main") {
    const stopPeakTracking = startPeakTracking();
    window.addEventListener("pagehide", stopPeakTracking, { once: true });
  }
  if (init.windowKind === "main") startBootFrameRecorder({
    doc: document, root: rootElement,
    save: frame => { void backendRequest("host.saveBootFrame", { frame }).catch(console.error); },
  });
  void backendRequest("host.focusWindow").then(() => rootElement.focus({ preventScroll: true })).catch(console.error);
}
void boot().catch(renderFatal);
