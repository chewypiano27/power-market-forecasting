/**
 * A call to the desktop's Bun process that did not complete in time: the
 * request timer ran out, or the bridge socket never opened. `name` stays
 * "Error", so crash reports and filters see the same type as before.
 */
export class RpcTimeoutError extends Error {
  readonly elapsedMs: number;
  readonly limitMs: number;

  constructor(message: string, { elapsedMs, limitMs, cause }: { elapsedMs: number; limitMs: number; cause?: unknown }) {
    super(message, cause === undefined ? undefined : { cause });
    this.elapsedMs = elapsedMs;
    this.limitMs = limitMs;
  }
}
