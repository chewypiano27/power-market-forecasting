import {
  readRequestInit,
  toResponseEnvelope,
  type HttpProxyResponseEnvelope,
} from "../../../../utils/http-proxy-response";
import type { DesktopBackendRequestPayload } from "../../shared/protocol";

export async function handleHttpFetch(
  payload: DesktopBackendRequestPayload<"http.fetch">,
): Promise<HttpProxyResponseEnvelope> {
  const url = requireProxyableUrl(payload.url, "http.fetch");
  const { method, headers, body, redirect, timeoutMs } = readRequestInit(payload.init);

  const response = await fetch(url, {
    method, headers, body, redirect,
    signal: timeoutMs && timeoutMs <= 120_000 ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  return toResponseEnvelope(response);
}

/** Rejects anything the desktop must not proxy on the app's behalf. */
export function requireProxyableUrl(rawUrl: unknown, method: string): URL {
  if (typeof rawUrl !== "string") {
    throw new Error(`${method} requires a URL.`);
  }
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported ${method} protocol: ${url.protocol}`);
  }
  return url;
}
