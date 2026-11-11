import { createProxyResponse, toRequestEnvelope, type HttpProxyResponseEnvelope } from "../../../utils/http-proxy-response";
import { setHttpFetchTransport } from "../../../utils/http-transport";
import { backendRequest } from "./backend-rpc";

function createAbortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError");
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    throw createAbortError();
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(createAbortError());
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

async function electrobunHttpFetch(url: string, init?: RequestInit): Promise<Response> {
  if (init?.signal?.aborted) {
    throw createAbortError();
  }

  return createProxyResponse(await withAbort(requestBackendHttpFetch(url, init), init?.signal));
}

async function requestBackendHttpFetch(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<HttpProxyResponseEnvelope> {
  return backendRequest("http.fetch", await toRequestEnvelope(url, init, timeoutMs));
}

export function installElectrobunHttpFetchTransport(): void {
  setHttpFetchTransport(electrobunHttpFetch);
}
