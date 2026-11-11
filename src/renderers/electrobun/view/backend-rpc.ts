type KeyedBackendMessageName = "context-menu.select";

type BackendMessageListener<K extends BackendMessageName> = (message: BackendMessages[K]) => void;

import { Electroview } from "electrobun/view";
import { type DesktopDeepLinkMessage, type DesktopBackendRequestArgs, type DesktopBackendRequestMethod, type DesktopBackendRequestResponse, type DesktopDockPreviewMessage, type DesktopRestartMessage, type DesktopThemePreviewMessage, type ElectrobunBackendInit, type ElectrobunDesktopRpcSchema } from "../shared/protocol";
import { decodeRpcResponse, decodeRpcValue, encodeRpcValue } from "../shared/rpc-codec";

import { RpcTimeoutError } from "../../../utils/rpc-timeout-error";
import { nameRpcTimeout, RPC_MAX_REQUEST_TIME_MS } from "./rpc-timeout";

type BackendMessages = ElectrobunDesktopRpcSchema["webview"]["messages"];
type BackendMessageName = keyof BackendMessages;

let initSnapshot: ElectrobunBackendInit | null = null;
const messageListeners = new Map<string, Set<(message: unknown) => void>>();
const pendingDesktopDeepLinks: DesktopDeepLinkMessage[] = [];

function listenerKey(name: BackendMessageName, key: string | undefined): string {
  return key === undefined ? name : `${name}\u0000${key}`;
}

/** Hands a decoded message to its listeners and returns how many there were. */
function emit<K extends BackendMessageName>(name: K, message: BackendMessages[K], key?: string): number {
  const listeners = messageListeners.get(listenerKey(name, key));
  for (const listener of listeners ?? []) {
    listener(message);
  }
  return listeners?.size ?? 0;
}

const rpc = Electroview.defineRPC<ElectrobunDesktopRpcSchema>({
  maxRequestTime: RPC_MAX_REQUEST_TIME_MS,
  handlers: {
    requests: {
    },
    messages: {
      "context-menu.select": (message) => {
        emit("context-menu.select", message, message.requestId);
      },
      "application-menu.select": (message) => {
        emit("application-menu.select", { command: decodeRpcValue(message.command) });
      },
      "desktop.deepLink": (message) => {
        if (typeof message.url !== "string" || !message.url) return;
        const deepLink = { url: message.url };
        if (emit("desktop.deepLink", deepLink) > 0) return;
        pendingDesktopDeepLinks.push(deepLink);
        if (pendingDesktopDeepLinks.length > 20) pendingDesktopDeepLinks.shift();
      },
      "desktop.state": (message) => {
        emit("desktop.state", { snapshot: decodeRpcValue(message.snapshot) });
      },
      "desktop.dockPreview": (message) => {
        emit("desktop.dockPreview", { preview: decodeRpcValue<DesktopDockPreviewMessage["preview"]>(message.preview) });
      },
      "desktop.themePreview": (message) => {
        emit("desktop.themePreview", { preview: decodeRpcValue<DesktopThemePreviewMessage["preview"]>(message.preview) });
      },

    },
  },
});

const electroview = new Electroview({ rpc });

const BRIDGE_READY_LIMIT_MS = 5_000;

async function waitForBridgeReady(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < BRIDGE_READY_LIMIT_MS) {
    if (electroview.bunSocket?.readyState === WebSocket.OPEN) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new RpcTimeoutError("Electrobun RPC socket did not open in time.", {
    elapsedMs: Date.now() - start,
    limitMs: BRIDGE_READY_LIMIT_MS,
  });
}

export function backendRequest<K extends DesktopBackendRequestMethod>(
  method: K,
  ...args: DesktopBackendRequestArgs<K>
): Promise<DesktopBackendRequestResponse<K>>;
export async function backendRequest(
  method: DesktopBackendRequestMethod,
  payload: unknown = null,
): Promise<unknown> {
  await waitForBridgeReady();
  const result = await nameRpcTimeout(method, payload, () => rpc.request["backend.request"]({
    method,
    payload: encodeRpcValue(payload),
  }));
  return decodeRpcResponse(result);
}

export async function initElectrobunBackend(payload?: { kind?: "main" | "detached"; paneId?: string }): Promise<ElectrobunBackendInit> {
  initSnapshot = await backendRequest("init", payload ?? {});
  return initSnapshot;
}

export function requestElectrobunRestart(message: DesktopRestartMessage = {}): void {
  rpc.send["host.restart"](message);
}

export function getElectrobunBackendInitSnapshot(): ElectrobunBackendInit | null {
  return initSnapshot;
}

/**
 * Listens for a message the Bun process sends this window. Keyed messages
 * belong to one context menu request, capability subscription or HTTP stream,
 * and only reach the listeners registered under that id. A deep link that
 * arrived before anyone listened is replayed to the first listener.
 */
export function onBackendMessage<K extends Exclude<BackendMessageName, KeyedBackendMessageName>>(
  name: K,
  listener: BackendMessageListener<K>,
): () => void;
export function onBackendMessage<K extends KeyedBackendMessageName>(
  name: K,
  key: string,
  listener: BackendMessageListener<K>,
): () => void;
export function onBackendMessage(
  name: BackendMessageName,
  keyOrListener: string | ((message: never) => void),
  keyedListener?: (message: never) => void,
): () => void {
  const key = typeof keyOrListener === "string" ? keyOrListener : undefined;
  const listener = (keyedListener ?? keyOrListener) as (message: unknown) => void;
  const bucketKey = listenerKey(name, key);
  let listeners = messageListeners.get(bucketKey);
  if (!listeners) {
    listeners = new Set();
    messageListeners.set(bucketKey, listeners);
  }
  listeners.add(listener);
  if (name === "desktop.deepLink") {
    for (const message of pendingDesktopDeepLinks.splice(0)) {
      listener(message);
    }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && messageListeners.get(bucketKey) === listeners) {
      messageListeners.delete(bucketKey);
    }
  };
}
